import {test,expect} from 'bun:test';
import {enrichContext} from '../src/services/ai/engine/context/contextEnricher';
import {validContextManifest,makeContextManifest,contextSource} from '../src/services/ai/engine/context/contextManifest';
import {contentFingerprint} from '../src/services/ai/designWorkflow';
import {buildPageReferenceSnapshot} from '../src/services/ai/engine/context/pageReferenceContext';
import {enforceBudgetGuard} from '../src/services/ai/engine/context/budgetGuard';
import {safeModelDiagnostic} from '../src/services/ai/transportFailure';
test('context diagnostics describe complete business projections and never echo SVG bodies from gateway errors',()=>{
 const result=enforceBudgetGuard({targetHtml:'x'.repeat(31000),targetIsBusinessInventory:true,referencedScreens:[],skeletonizeFn:()=>{throw Error('required content cannot be stripped');}});
 expect(result.targetScreenHtml).toHaveLength(31000);expect(result.warnings.join('')).toContain('业务文本');expect(result.warnings.join('')).not.toContain('参考页面已压缩');
 expect(safeModelDiagnostic('gateway error <svg><path d="M0 0L99 99"/></svg>')).not.toContain('M0 0');expect(safeModelDiagnostic('SVG生成格式无效')).toBe('SVG生成格式无效');
});
const common={rawPrompt:'调整目标页面',intent:'modify_screen' as const,activeScreenId:'target',targetScreenOverride:{id:'target'},deviceProfile:'mobile' as const,frameWidth:390,baseSystemPrompt:'规则'};
test('required large source, scoped CSS and L4 stay intact while omitted references are identified',()=>{
 const html='<main data-nid="root"><p>'+('必需原文'.repeat(10000))+'</p></main>',css='.source{display:grid}';
 const result=enrichContext({...common,rawPrompt:'调整目标页面 @参考页面',screens:{target:{id:'target',name:'目标',htmlContent:html,scopedCss:css},ref:{id:'ref',name:'参考页面',htmlContent:'<main><p>参考资料</p></main>'}},overrides:{'target:root':{nid:'root',declarations:{padding:'8px'}}}});
 const text=result.messages.at(-1)!.content;expect(text).toContain(html);expect(text).toContain(css);expect(text).toContain('padding: 8px !important');expect(validContextManifest(result.contextManifest)).toBe(true);
 expect(result.contextManifest.sources.find(s=>s.kind==='target')?.status).toBe('full');expect(result.contextManifest.sources.find(s=>s.kind==='reference')?.status).toBe('omitted');
 const corrupt=structuredClone(result.contextManifest);corrupt.sources[0].status='summary';expect(validContextManifest(corrupt)).toBe(false);
});
test('metadata uses source fingerprints and excludes encoded reference images; unrelated active pages are not claimed as injected',()=>{
 const attachment={name:'a.png',dataUrl:'data:image/png;base64,YQ=='};
 const result=enrichContext({...common,intent:'create_screen',attachment,targetScreenOverride:{id:null},screens:{target:{id:'target',name:'旧页',htmlContent:'<main>旧页</main>'}},textReferences:[{name:'说明.md',content:'原需求全文',source:'upload'}]});
 expect(result.contextManifest.sources.some(s=>s.kind==='target')).toBe(false);expect(result.contextManifest.sources.find(s=>s.kind==='document')?.sourceFingerprint).toBe(contentFingerprint('原需求全文'));
 expect(JSON.stringify(result.contextManifest)).not.toContain('YQ==');expect(result.messages.at(-1)?.imageUrl).toBe(attachment.dataUrl);
 expect(()=>makeContextManifest([contextSource('required','target','全文',undefined,true)],[])).toThrow('必需来源');
});
test('read-only reference projection removes encoded CSS and SVG drawing bodies without changing the actual source',()=>{
 const html='<style>.a{background:image-set("data:image/png;base64,YQ==" 1x);color:var(--color-text)}</style><main><svg class="icon" data-nid="icon"><path d="M0 0L20 20"/></svg><img srcset="data:image/png;base64,YQ== 1x"></main>';
 const source={id:'source',name:'来源',htmlContent:html,scopedCss:'.b{--payload:"data:image/png;base64,YQ==";padding:var(--space-2)}'},result=buildPageReferenceSnapshot(source);
 expect(result.skeletonHtml+result.styles).not.toContain('YQ==');expect(result.skeletonHtml).not.toContain('M0 0L20 20');expect(result.skeletonHtml).toContain('data-reference-media');expect(result.styles).toContain('padding:var(--space-2)');expect(source.htmlContent).toBe(html);
});
