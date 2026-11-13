import {test,expect} from 'bun:test';
import {inlineFormContracts,inspectInlineForms,requestedProgressSummary,inspectProgressSummary} from '../src/services/ai/inlineFormContract';
import {compileBusinessTextEdits} from '../src/services/ai/businessTextEdits';
import {buildPageRedesignSource,inspectRedesignContent} from '../src/services/ai/pageRedesignSource';
import {parseHtmlCopy} from '../src/utils/htmlDocument';
import {preparePageTaskPlan} from '../src/services/ai/pageTaskPlan';
import {buildDesignTaskContract} from '../src/services/ai/designWorkflow';
import {TaskBudget} from '../src/services/ai/taskBudget';
import {checkGenerationQuality} from '../src/services/ai/generationQuality';
const request='1. 择偶要求任务改为内联条件表单区：将任务3改为可展开表单区块：保留标题，下方新增年龄、身高、学历、地区等条件行。';
const form='<section class="card"><h2>择偶要求</h2>'+['年龄','身高','学历','地区'].map((label,i)=>`<label for="field-${i}">${label}</label><input id="field-${i}">`).join('')+'</section>';
test('命名任务的明确字段清单要求同组唯一原生表单，不接受按钮或旁文',()=>{
 expect(inlineFormContracts(request)).toEqual([{title:'择偶要求',fields:['年龄','身高','学历','地区']}]);
 expect(inspectInlineForms(parseHtmlCopy(form).doc,request)).toEqual([]);
 expect(inspectInlineForms(parseHtmlCopy('<section><span>择偶要求</span>'+form+'</section>').doc,request)).toEqual([]);
 for(const bad of [form.replace('<input id="field-0">','<button id="field-0">选择</button>'),form.replace('for="field-0"','for="missing"'),form.replace('<input id="field-0">','<input hidden id="field-0">'),form.replace('<input id="field-0">','<input readonly id="field-0">'),form.replace('<input id="field-0">','<input disabled id="field-0">'),form+form.replaceAll('field-','other-')])expect(inspectInlineForms(parseHtmlCopy(bad).doc,request)[0].severity).toBe('error');
 expect(inspectInlineForms(parseHtmlCopy(form.replace('年龄</label>','年龄区间</label>').replace('身高</label>','身高区间</label>')).doc,request)).toEqual([]);
 expect(inspectInlineForms(parseHtmlCopy(form.replace('地区</label>','家乡</label>')).doc,request)).not.toEqual([]);
 expect(inlineFormContracts('不要'+request)).toEqual([]);expect(inlineFormContracts('优化择偶要求表单')).toEqual([]);
 expect(inlineFormContracts('> '+request)).toEqual([]);expect(inlineFormContracts('```text\n'+request+'\n```')).toEqual([]);
});

test('业务规划的实际请求携带明确字段合同，冻结历史格式保持不变',async()=>{
 const baseline='<main><button><span>择偶要求</span><span>去完成</span></button></main>',contract=buildDesignTaskContract({intent:'modify_screen',request,target:{id:'source',name:'原页',htmlContent:baseline},deviceProfile:'mobile',frameWidth:390}),provider={id:'unit',name:'unit',protocol:'openai_compatible' as const,baseUrl:'https://invalid.test',apiKey:''};
 let calls=0;const core={generateObject:async(_schema:unknown,options:any)=>{calls++;const data=JSON.parse(options.messages.at(-1).content);expect(data.explicitInlineForms).toEqual([{title:'择偶要求',fields:['年龄','身高','学历','地区']}]);expect(options.messages[0].content).toContain('不能只画字段按钮');return {goal:'在原页填写条件',actor:'用户',completion:['填写资料'],questions:[],features:[{id:'f1',title:'择偶要求',change:'update',basis:'user',sourceIds:['user:request'],information:['年龄','身高','学历','地区'].map(label=>({label,kind:'input'})),interactions:[],states:[]}]};}} as any;
 const budget=new TaskBudget({maxRequests:1,maxRequestedOutputTokens:1024,maxDurationMs:10000,maxRequestDurationMs:10000});
 try{const plan=await preparePageTaskPlan(core,{contract,provider,model:'unit',budget,baselineHtml:baseline,isCurrent:()=>true,maxTokens:1024});expect(plan.plan.features[0].information).toHaveLength(4);expect(calls).toBe(1);}finally{budget.close();}
});
test('原去完成提示只在唯一同名入口真正由完整内联表单代替时免于保留',()=>{
 const old='<main><button><span>择偶要求</span><span data-nid="entry">去完成</span></button><p data-nid="keep">其他说明</p></main>',source=buildPageRedesignSource(old,{deviceProfile:'pc'});
 expect(inspectRedesignContent(source,form+'<p>其他说明</p>',request,old)).toEqual([]);
 expect(checkGenerationQuality(form+'<p>其他说明</p>',{baselineHtml:old,modificationRequest:request}).findings.some(f=>f.code==='action_removed')).toBe(false);
 expect(inspectRedesignContent(source,form.replace('<input id="field-0">','')+'<p>其他说明</p>',request,old).some(f=>f.code==='redesign_content_missing'&&f.nid==='entry')).toBe(true);
 expect(inspectRedesignContent(source,form,request,old).some(f=>f.nid==='keep')).toBe(true);
 const duplicate=old.replace('</main>','<button><span>择偶要求</span><span data-nid="entry2">去完成</span></button></main>');
 expect(inspectRedesignContent(buildPageRedesignSource(duplicate,{deviceProfile:'pc'}),form+'<p>其他说明</p>',request,duplicate).filter(f=>f.nid?.startsWith('entry'))).toHaveLength(2);
});
test('明确进度摘要的新计数只匹配唯一原计数，不扩大其他文字授权',()=>{
 const prompt='进度摘要条改为完成度计数样式：右侧“已填 8/14”，下方说明。',items=[{nid:'progress',text:'已完成 2/4'},{nid:'other',text:'保留说明'}];
 expect(requestedProgressSummary(prompt)).toBe('已填 8/14');expect(compileBusinessTextEdits(items,prompt)).toEqual([{version:1,nid:'progress',before:'已完成 2/4',after:'已填 8/14',kind:'progress-summary'}]);
 expect(compileBusinessTextEdits([...items,{nid:'second',text:'已完成 1/3'}],prompt)).toEqual([]);
 expect(compileBusinessTextEdits(items,'不要'+prompt)).toEqual([]);
 expect(()=>requestedProgressSummary(prompt.replace('8/14','15/14'))).toThrow();expect(()=>requestedProgressSummary(prompt+'\n'+prompt.replace('8/14','7/14'))).toThrow('冲突');
 const old='<p data-nid="progress">已完成 2/4</p><p data-nid="other">保留说明</p>',source=buildPageRedesignSource(old,{deviceProfile:'pc'});
 expect(inspectRedesignContent(source,'<p>已填 8/14</p><p>保留说明</p>',prompt,old)).toEqual([]);
 expect(inspectRedesignContent(source,'<p>已填 8/14</p>',prompt,old).some(f=>f.nid==='other')).toBe(true);
 expect(inspectProgressSummary(parseHtmlCopy('<p>已填 8/14</p><p>已填 8/14</p>').doc,prompt)).toEqual([]);
 expect(inspectProgressSummary(parseHtmlCopy('<p>已填 8/14</p>').doc,prompt,()=>({text:'已填 8/14',uncertain:true}))[0].severity).toBe('error');
});
