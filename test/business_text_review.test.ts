import {test,expect} from 'bun:test';
import {businessTextReviewChoices,prepareBusinessTextReview,inspectBusinessTextReview,inspectBusinessTextRendering,validBusinessTextReview} from '../src/services/ai/businessTextReview';
import {buildPageRedesignSource,inspectRedesignContent} from '../src/services/ai/pageRedesignSource';
import {makeFailedPageDraft} from '../src/services/ai/qualityDraft';
import {checkGenerationQuality} from '../src/services/ai/generationQuality';
import {contentFingerprint} from '../src/services/ai/designWorkflow';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {loadStagedCandidate} from '../src/services/storage/candidateRepository';
import {parseHtmlCopy} from '../src/utils/htmlDocument';

function fixture(protectedNids:string[]=[]){
 const baseline='<main><p data-nid="original">原有进度摘要</p><p data-nid="keep">其他业务必须保留</p><button data-nid="button">保留按钮</button><label data-nid="label">字段标签<input name="email"></label></main>';
 const html='<main><section data-nid="region"><p data-nid="replacement">新进度摘要</p></section><section data-nid="other"><p data-nid="keep">其他业务必须保留</p><button data-nid="button">保留按钮</button><label data-nid="label">字段标签<input name="email"></label>'+Array.from({length:15},(_,i)=>`<p>其它${i}</p>`).join('')+'</section></main>';
 const source=buildPageRedesignSource(baseline,{deviceProfile:'pc',protectedNids});
 const options={wholePageRedesign:{version:1 as const,sourceFingerprint:source.sourceFingerprint,inventoryFingerprint:contentFingerprint(JSON.stringify(source))},baselineHtml:baseline,protectedNids};
 const draft=makeFailedPageDraft(html,'context','binding',options)!;
 const change={sourceNid:'original',targetNid:'replacement',before:'原有进度摘要',after:'新进度摘要'};
 return {baseline,source,options,draft,change};
}
test('逐项文本确认只允许用户选中的源与目标，保留未确认业务并要求指定新文字',()=>{
 const f=fixture(),observed=businessTextReviewChoices(f.source,f.baseline,f.draft);
 expect(observed.sources).toEqual([{sourceNid:'original',before:'原有进度摘要'}]);
 const review=prepareBusinessTextReview(f.source,f.baseline,f.draft,['region'],[f.change])!;
 expect(validBusinessTextReview(review)).toBe(true);expect(review.changes[0].regionNid).toBe('region');
 expect(inspectRedesignContent(f.source,f.draft.html,'重新设计',f.baseline,review)).toEqual([]);
 const moved=f.draft.html.replace('data-nid="replacement"','data-nid="wrong"');
 expect(inspectBusinessTextReview(f.source,f.baseline,moved,review)[0].code).toBe('redesign_text_review_not_applied');
 const wrong=f.draft.html.replace('新进度摘要','另一个摘要').replace('</main>','<p>新进度摘要</p></main>');
 expect(inspectRedesignContent(f.source,wrong,'重新设计',f.baseline,review).some(i=>i.code==='redesign_text_review_not_applied')).toBe(true);
 const lost=f.draft.html.replace('其他业务必须保留','');expect(inspectRedesignContent(f.source,lost,'重新设计',f.baseline,review).some(i=>i.code==='redesign_content_missing'&&i.nid==='keep')).toBe(true);
 expect(checkGenerationQuality(f.draft.html,{...f.options,contentTask:{request:'重新设计',businessTextReview:review}}).passed).toBe(true);
});
test('伪造来源、歧义源、重复目标、空文案、超额和越区文案确认都拒绝',()=>{
 const f=fixture(),prepare=(changes:any[],selected=['region'])=>prepareBusinessTextReview(f.source,f.baseline,f.draft,selected,changes);
 for(const change of [{...f.change,before:'伪造原文'},{...f.change,after:''},{...f.change,targetNid:'keep'},{...f.change,extra:'permission'}])expect(()=>prepare([change])).toThrow();
 expect(()=>prepare([f.change,f.change])).toThrow();expect(()=>prepare(Array(9).fill(f.change))).toThrow();
 expect(()=>prepare([f.change],['other'])).toThrow();
 expect(()=>prepareBusinessTextReview(f.source,f.baseline,{...f.draft,html:f.draft.html+'changed'},['region'],[f.change])).toThrow('草稿已变化');
 const review=prepare([f.change])!;expect(()=>inspectBusinessTextReview({...f.source,sourceFingerprint:'12345678'},f.baseline,f.draft.html,review)).toThrow('来源');
 const duplicate={...f.source,texts:[...f.source.texts,f.source.texts[0]]};expect(businessTextReviewChoices(duplicate,f.baseline,f.draft).sources).toEqual([]);
 expect(()=>prepareBusinessTextReview(f.source,f.baseline,f.draft,[],[],{...review,changes:[...review.changes,{...review.changes[0],sourceNid:'keep'}]})).toThrow();
});
test('隐藏、交互与保护节点不开放文本授权，保存的确认也不能掩盖隐藏产物',()=>{
 const f=fixture(),review=prepareBusinessTextReview(f.source,f.baseline,f.draft,['region'],[f.change])!;
 for(const replacement of ['<p hidden data-nid="replacement">新进度摘要</p>','<button data-nid="replacement">新进度摘要</button>','<p data-nid="replacement"><span>新进度摘要</span></p>']){
  const draft={...f.draft,html:f.draft.html.replace('<p data-nid="replacement">新进度摘要</p>',replacement)};draft.fingerprint=contentFingerprint(draft.html);
  expect(businessTextReviewChoices(f.source,f.baseline,draft).targets.some(t=>t.targetNid==='replacement')).toBe(false);
  expect(inspectBusinessTextReview(f.source,f.baseline,draft.html,review)).toHaveLength(1);
 }
 const locked=fixture(['original']);expect(businessTextReviewChoices(locked.source,locked.baseline,locked.draft).sources).toEqual([]);
 expect(businessTextReviewChoices(f.source,f.baseline,f.draft).targets.some(t=>['button','label'].includes(t.targetNid))).toBe(false);
});
test('恢复确认沿用实际原页合同，伪造值或篡改字段被全页检查拒绝',()=>{
 const f=fixture(),review=prepareBusinessTextReview(f.source,f.baseline,f.draft,['region'],[f.change])!;
 expect(prepareBusinessTextReview(f.source,f.baseline,f.draft,[],[],review)).toEqual(review);
 const bad={...review,changes:[{...review.changes[0],before:'篡改'}]};
 expect(inspectRedesignContent(f.source,f.draft.html,'重新设计',f.baseline,bad).some(i=>i.code==='redesign_text_review_invalid')).toBe(true);
 expect(validBusinessTextReview({...review,extra:'permission'})).toBe(false);
});

test('真实绘制观察不可用、隐藏或不完整时，确认文案仍为阻断项',()=>{
 const f=fixture(),review=prepareBusinessTextReview(f.source,f.baseline,f.draft,['region'],[f.change])!,doc=parseHtmlCopy(f.draft.html).doc;
 expect(inspectBusinessTextRendering(doc,review,()=>({text:f.change.after}))).toEqual([]);
 expect(inspectBusinessTextRendering(doc,review,()=>({text:''}))[0]).toMatchObject({code:'render_text_review_missing',severity:'error'});
 expect(inspectBusinessTextRendering(doc,review,()=>({text:f.change.after,uncertain:true}))[0]).toMatchObject({code:'render_text_review_unverified',severity:'error'});
 expect(inspectBusinessTextRendering(doc,{...review,changes:null} as any,()=>({text:f.change.after}))[0].severity).toBe('error');
});

test('真实候选保存重开保留逐项确认，采纳检查不接受被替换的目标文案',async()=>{
 const prior=useProjectStore.getState(),history=useHistoryStore.getState();let id='';
 try{
  const store=useProjectStore.getState();id=store.initNewProject({name:'合成文案确认',deviceProfile:'pc',createSpecimen:false});
  const f=fixture();store.addScreen({name:'合成原页',htmlContent:f.baseline},'target');
  const baseline=useProjectStore.getState().screens.target.htmlContent,source=buildPageRedesignSource(baseline,{deviceProfile:'pc'}),options={...f.options,baselineHtml:baseline,wholePageRedesign:{version:1 as const,sourceFingerprint:source.sourceFingerprint,inventoryFingerprint:contentFingerprint(JSON.stringify(source))}};
  const draft=makeFailedPageDraft(f.draft.html,'context','binding',options)!;
  const review=prepareBusinessTextReview(source,baseline,draft,['region'],[f.change])!;
  const contract=buildDesignTaskContract({intent:'modify_screen',request:'重新设计',target:{id:'target',name:'合成原页',htmlContent:baseline},deviceProfile:'pc',frameWidth:1440,designSystem:useProjectStore.getState().designSystem});
  contract.wholePageRedesign=options.wholePageRedesign;contract.businessTextReview=review;
  store.stageScreenChange('target',draft.html,'合成新页','重新设计',contract);
  const archived=await loadStagedCandidate(id);expect(archived!.workflowContract!.businessTextReview).toEqual(review);
  expect(useProjectStore.getState().getStagedDeliveryReport().checks.find(c=>c.id==='quality')?.status).toBe('passed');
  store.discardStagedChange();expect(store.restoreStagedCandidate(archived!,id)).toBe(true);
  expect(useProjectStore.getState().stagedRenderQuality).toBeNull();
  expect(useProjectStore.getState().getStagedDeliveryReport().checks.find(c=>c.id==='quality')?.status).toBe('passed');
  const bad={...archived!,newHtml:archived!.newHtml.replace('新进度摘要','已被篡改')};store.restoreStagedCandidate(bad,id);
  expect(useProjectStore.getState().getStagedDeliveryReport().checks.find(c=>c.id==='quality')?.status).toBe('blocked');
  expect(await store.adoptStagedChange()).toBe(false);expect(useProjectStore.getState().screens.target.htmlContent).toBe(baseline);
 }finally{if(id){useProjectStore.getState().discardStagedChange();await loadStagedCandidate(id);}useProjectStore.setState(prior,true);useHistoryStore.setState(history,true);}
});
