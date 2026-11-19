import {test,expect} from 'bun:test';
import {blockerRegionRepairPlan,draftRegionChoices,repairDraftRegions} from '../src/services/ai/draftRegionRepair';
import {makeFailedPageDraft} from '../src/services/ai/qualityDraft';
const html='<main data-nid="root"><section data-nid="region"><h2>基础资料</h2><p>填写资料</p></section><section data-nid="other">'+Array.from({length:15},(_,i)=>`<p data-nid="p${i}">保留${i}</p>`).join('')+'</section></main>';
const provider={id:'test',name:'test',protocol:'openai_compatible' as const,baseUrl:'https://invalid.test',apiKey:'',isEnabled:true};
const options={provider,model:'test',messages:[{role:'system' as const,content:'使用项目Token'}]};
test('草稿局部修复只发送选中子树，保留其他区域且不覆盖源草稿',async()=>{
 const draft=makeFailedPageDraft(html,'context','binding',{})!,original=draft.html;let calls=0;
 const core={generateObject:async(_schema:unknown,o:any)=>{calls++;expect(o.messages.at(-1).content).toContain('基础资料');expect(o.messages.at(-1).content).not.toContain('保留14');return {nid:'region',html:'<section data-nid="region"><h2>基础资料</h2><label>身高<input type="number"/></label></section>'};}} as any;
 expect(draftRegionChoices(draft).map(x=>x.nid)).toEqual(['region']);
 const result=await repairDraftRegions(core,options,draft,{nids:['region'],instruction:'补齐身高字段'},[],()=>{});
 expect(calls).toBe(1);expect(result).toContain('保留14');expect(result).toContain('type="number"');expect(draft.html).toBe(original);
});

test('修复 block 选项把阻断项映射到最多3个草稿区域并生成定点说明',()=>{
 const baseline='<main data-nid="root"><section data-nid="region" aria-label="基础资料"><h2>基础资料</h2><p data-nid="keep-a">原文甲</p><p data-nid="keep-b">原文乙</p></section><section data-nid="other">'+Array.from({length:15},(_,i)=>`<p data-nid="p${i}">保留${i}</p>`).join('')+'</section></main>';
 const draftHtml='<main data-nid="root"><section data-nid="region" aria-label="基础资料"><h2>基础资料</h2><p data-nid="keep-a">改写甲</p></section><section data-nid="other">'+Array.from({length:15},(_,i)=>`<p data-nid="p${i}">保留${i}</p>`).join('')+'</section></main>';
 const draft=makeFailedPageDraft(draftHtml,'context','binding',{})!;
 draft.quality={passed:false,findings:[
  {code:'redesign_content_missing',severity:'error',nid:'keep-b',message:'整页重设计遗漏了未经授权删除或改写的原业务文案。',actual:'原文乙',expected:'保留'},
  {code:'redesign_content_missing',severity:'error',nid:'keep-a',message:'整页重设计遗漏了未经授权删除或改写的原业务文案。',actual:'原文甲',expected:'保留'},
  {code:'unknown_class',severity:'warning',nid:'region',message:'警告不参与',actual:'x',expected:'y'},
 ]};
 const plan=blockerRegionRepairPlan(draft,baseline);
 expect(plan).toEqual({nids:['region'],instruction:expect.stringContaining('keep-b')});
 expect(plan!.instruction).toContain('keep-a');
 expect(plan!.instruction).not.toContain('警告不参与');
 const withoutBaseline=blockerRegionRepairPlan(draft);
 expect(withoutBaseline?.nids).toEqual(['region']);
 expect(withoutBaseline!.instruction).toContain('keep-a');
 expect(withoutBaseline!.instruction).not.toContain('keep-b');
});
test('保护、越界身份、歧义选择、取消与公共样式不能通过修复',async()=>{
 const draft=makeFailedPageDraft(html,'context','binding',{})!;
 const core={generateObject:async()=>({nid:'region',html:'<section data-nid="region"><p data-nid="p14">越界</p></section>'})} as any;
 const req={nids:['region'],instruction:'修复字段'};
 await expect(repairDraftRegions(core,options,draft,req,['region'],()=>{})).rejects.toThrow('保护');
 await expect(repairDraftRegions(core,options,draft,req,[],()=>{})).rejects.toThrow('其他区块');
 await expect(repairDraftRegions(core,options,draft,{...req,nids:['root']},[],()=>{})).rejects.toThrow();
 const controller=new AbortController();controller.abort();await expect(repairDraftRegions(core,{...options,signal:controller.signal},draft,req,[],()=>{})).rejects.toThrow('停止');
});

test('异步修复使用冻结的草稿与选区，调用方后续修改不影响合并结果',async()=>{
 const draft=makeFailedPageDraft(html,'context','binding',{})!,repair={nids:['region'],instruction:'增加身高字段'};
 let resolve!:(v:any)=>void;const core={generateObject:()=>new Promise(r=>resolve=r)} as any;
 const pending=repairDraftRegions(core,options,draft,repair,[],()=>{});
 draft.html='<main>已改变</main>';repair.nids=['other'];repair.instruction='改写其他区域';
 resolve({nid:'region',html:'<section data-nid="region"><h2>基础资料</h2><label>身高<input/></label></section>'});
 const result=await pending;expect(result).toContain('保留14');expect(result).toContain('身高');expect(result).not.toContain('已改变');
});
