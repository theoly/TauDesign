import {expect,test} from 'bun:test';
import {compactTokenCss,selectTokenGuidance,renderTokenGuidance} from '../src/services/ai/designKnowledge/tokenWindow';
import {compileTokensToCss} from '../src/utils/cssCompiler';
import {themePresets} from '../src/utils/themePresets';
import {selectDesignRules} from '../src/services/ai/designKnowledge/selector';
import {WORKFLOW_CATALOG,workflowRulePolicy} from '../src/services/ai/workflowCatalog';
const query={request:'按钮完整文案',operation:'modify' as const,device:'mobile' as const,scope:'element' as const,features:['button' as const],maxChars:10000};
function parsed(css:string){const el=document.createElement('style');document.head.append(el);el.textContent=css;const rules=Array.from(el.sheet!.cssRules).map(r=>r.cssText);el.remove();return rules;}
test('token compaction preserves parsed declarations across all themes, modes and devices',()=>{
 for(const theme of themePresets.map(p=>p.theme))for(const mode of ['light','dark'] as const)for(const device of ['mobile','pc'] as const){
  const css=compileTokensToCss(theme.tokens,mode,device),compact=compactTokenCss(css);expect(parsed(compact)).toEqual(parsed(css));expect(compact.length).toBeLessThan(css.length);
 }
});
test('quoted whitespace, escapes and comments are not rewritten by the generated-token window',()=>{
 const quoted=String.raw`"A;  B \" C"`,comment=String.raw`/* note : { \" ' */`;
 const css=`:root {\n  --font: ${quoted};\n  ${comment}\n  --label: 'x;  y';\n  --gap: calc(1px + 2px);\n}`;
 const compact=compactTokenCss(css);expect(compact).toContain(quoted);expect(compact).toContain(comment);expect(compact).toContain("'x;  y'");expect(compact).toContain('calc(1px + 2px)');
});
test('guidance reuses only recovered JSON characters, preserving every other payload and the output budget',()=>{
 const theme=themePresets.map(p=>p.theme)[0],tokens=compileTokensToCss(theme.tokens,'light'),payload={request:'按钮文字不要丢失',html:'<button data-nid="target01">提交</button>',tokens,classes:['btn','btn-primary'],protectedNids:['keep0001']};
 const selection=selectTokenGuidance(tokens,query),adapted=renderTokenGuidance(payload,selection);
 expect(selection.selected.length).toBeGreaterThan(0);expect(adapted.payload).toEqual({...payload,tokens:compactTokenCss(tokens)});expect(JSON.stringify(adapted.payload).length+adapted.suffix.length).toBeLessThanOrEqual(JSON.stringify(payload).length);
 expect(adapted.suffix).toContain('[TY-06@1]');expect(adapted.suffix).not.toContain('返回完整 HTML');expect(payload.tokens).toBe(tokens);
});
test('no capacity or no match leaves the original payload byte-for-byte and frozen oversized advice refuses to send',()=>{
 const payload={tokens:':root{--x:1px;}',html:'原HTML'};const selection=selectTokenGuidance(payload.tokens,query);
 expect(selection.body).toBe('');expect(selection.fallback).toBe('budget');expect(renderTokenGuidance(payload,selection)).toEqual({payload,suffix:''});
 const full=selectDesignRules(query);expect(()=>renderTokenGuidance(payload,full)).toThrow('参考窗口');
});
test('all registered workflows declare output-specific eligibility; excluded routes cannot borrow an HTML policy',()=>{
 for(const workflow of Object.values(WORKFLOW_CATALOG))expect(workflowRulePolicy(workflow.id).reason).toBeTruthy();
 for(const id of ['answer-question','propose-theme','plan-multiple-pages','plan-page-variants','import-html-preserve','import-html-unify','import-html-selective'] as const)expect(workflowRulePolicy(id).protocols).toEqual([]);
 expect(workflowRulePolicy('edit-page-copy').protocols).toContain('fragment-json');expect(workflowRulePolicy('restyle-batch').protocols).toContain('style-patch-json');expect(workflowRulePolicy('review-page-modification').protocols).toEqual(['analysis-json']);
});
