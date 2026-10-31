import {beforeEach,expect,test} from 'bun:test';
import {buildDesignTaskContract,buildRestyleContract,buildHtmlImportContract} from '../src/services/ai/designWorkflow';
import {makeGuidancePacket,withGuidanceReceipts} from '../src/services/ai/designKnowledge/receipt';
import {selectDesignRules} from '../src/services/ai/designKnowledge/selector';
import {captureDesignGuidanceHistory,readDesignGuidanceHistory} from '../src/services/ai/designKnowledge/history';
import {isTaskContractShape} from '../src/services/ai/taskContractShape';
import {resolveWorkflowValidation} from '../src/services/ai/workflowValidation';
import {sameRecordedHtml,taskProvenanceIssue} from '../src/services/ai/taskProvenance';
import {DefaultAIEngineCore} from '../src/services/ai/engine/core/aiEngineCore';
import {MockTransport} from '../src/services/ai/engine/transport/mockTransport';
import {ConversationStore} from '../src/services/storage/conversationStore';
import {LocalStorageStorage} from '../src/services/storage/projectStorage';
const provider={id:'fixture',name:'fixture',protocol:'openai_compatible' as const,baseUrl:'https://invalid.test',apiKey:'NEVER_STORE_PROVIDER_KEY'};
beforeEach(()=>localStorage.clear());
async function guided(request='新建长正文页面'){
 const c=buildDesignTaskContract({intent:'create_screen',request,deviceProfile:'mobile',frameWidth:390});
 c.designGuidance=makeGuidancePacket(c,selectDesignRules({request:'长正文',operation:'create',device:'mobile',scope:'page',maxChars:1500}),'html');
 const t=new MockTransport();t.queueResponse('<main>PRIVATE_TARGET_HTML</main>');
 await withGuidanceReceipts(new DefaultAIEngineCore(t),c,c.designGuidance).streamText({provider,model:'fixture',messages:[{role:'system',content:c.designGuidance.selection.body}]}).textPromise;
 return c;
}
test('history projects only frozen provenance, is detached and contains no arbitrary fields or credentials',async()=>{
 const c=await guided();Object.assign(c,{apiKey:'CALLER_SECRET',html:'PRIVATE_TARGET_HTML',rawResponse:'PRIVATE_RAW_REPLY'});
 const record=captureDesignGuidanceHistory(c,c.request)!;expect(record).toBeDefined();expect(record.contract.designGuidance).toEqual(c.designGuidance);
 const json=JSON.stringify(record);for(const secret of ['NEVER_STORE_PROVIDER_KEY','CALLER_SECRET','PRIVATE_TARGET_HTML','PRIVATE_RAW_REPLY','DEVICE_SECRET'])expect(json).not.toContain(secret);
 c.designGuidance!.requests[0].status='cancelled';expect(record.contract.designGuidance!.requests[0].status).toBe('completed');
 expect(readDesignGuidanceHistory(JSON.parse(json),'其他轮次')).toBeUndefined();
 expect(captureDesignGuidanceHistory(undefined,'旧会话')).toBeUndefined();expect(taskProvenanceIssue(record.contract)).toBeUndefined();
});
for(const kind of ['scope','body','workflow','receipt','malformed','foreign-rule-field','device-field'] as const)test(`invalid ${kind} provenance is not restored`,async()=>{
 const c=await guided();
 if(kind==='scope')c.allowedChanges=['screen:outside'];if(kind==='body')c.designGuidance!.selection.body+='changed';if(kind==='workflow')c.operation='restyle';
 if(kind==='receipt')c.designGuidance!.requests[0].parentTaskId='outside';if(kind==='malformed')(c as any).knowledgeSources=[null];
 if(kind==='device-field')Object.assign(c.device,{apiKey:'DEVICE_SECRET'});
 if(kind==='foreign-rule-field')(c.designGuidance!.selection.selected[0].rule as any).apiKey='NESTED_SECRET';
 expect(captureDesignGuidanceHistory(c,c.request)).toBeUndefined();
});
test('cancelled provenance can be read as cancelled but never satisfies completed delivery',async()=>{
 const c=await guided();c.designGuidance!.requests[0].status='cancelled';const record=captureDesignGuidanceHistory(c,c.request)!;
 expect(record.contract.designGuidance!.requests[0].status).toBe('cancelled');expect(taskProvenanceIssue(record.contract)).toContain('缺少完整');
 expect(taskProvenanceIssue(record.contract,false)).toBeUndefined();
});
test('independent JSONL shards reopen rule histories, corrupt metadata preserves text, compaction drops provenance',async()=>{
 const storage=new LocalStorageStorage('rule-history'),store=new ConversationStore(storage),a=await guided('新建第一长正文页'),b=await guided('新建第二长正文页');
 for(const [index,c] of [a,b].entries())await store.appendTurn({turnId:`rule-${index}`,ts:Date.UTC(2026,8+index,1),user:{text:c.request},assistant:{text:`正文${index}`,designGuidanceHistory:captureDesignGuidanceHistory(c,c.request)}});
 const corrupt=captureDesignGuidanceHistory(b,b.request)!;corrupt.contract.allowedChanges=['outside'];await store.appendTurn({turnId:'broken',ts:Date.UTC(2026,9,2),user:{text:b.request},assistant:{text:'坏来源仍保留正文',designGuidanceHistory:corrupt}});
 const reopened=new ConversationStore(storage),turns=await reopened.loadRecent();
 expect(turns.map(t=>readDesignGuidanceHistory(t.assistant.designGuidanceHistory,t.user.text)?.contract.request)).toEqual([a.request,b.request,undefined]);expect(turns[2].assistant.text).toBe('坏来源仍保留正文');
 expect(await reopened.compactOldest(1)).toBe(1);const compacted=await reopened.loadRecent();expect(compacted[0].assistant.designGuidanceHistory).toBeUndefined();expect(compacted[1].assistant.designGuidanceHistory).toBeDefined();
});
for(const bad of [null,false,0,[],{}, {version:1,workflowId:'create-page',operation:'create',strategy:'new-page'}])test(`malformed task cannot be treated as legacy: ${JSON.stringify(bad)}`,()=>{
 expect(isTaskContractShape(bad)).toBe(false);expect(resolveWorkflowValidation(bad as any,'candidate').ok).toBe(false);expect(taskProvenanceIssue(bad as any)).toBeDefined();
});
test('legacy absence still uses live quality/render gates and does not mint provenance',()=>{
 expect(resolveWorkflowValidation(undefined,'candidate').ok).toBe(true);expect(taskProvenanceIssue(undefined)).toBeUndefined();expect(readDesignGuidanceHistory(undefined,'旧')).toBeUndefined();
});

test('all contract builders capture declared theme identity instead of tokens or arbitrary caller fields',()=>{
 const system={id:'theme',name:'主题',tokens:{private:'THEME_PAYLOAD'},apiKey:'THEME_SECRET'},origin={kind:'project' as const,sourceId:'theme',tokenVersion:2,tokenFingerprint:'12345678',updatedAt:999,apiKey:'ORIGIN_SECRET'},knowledge={kind:'document' as const,id:'doc',fingerprint:'12345678',apiKey:'SOURCE_SECRET'};
 const create=buildDesignTaskContract({intent:'create_screen',request:'新建',deviceProfile:'mobile',frameWidth:390,designSystem:system,designSystemOrigin:origin,knowledgeSources:[knowledge]});
 const restyle=buildRestyleContract({scope:'single',target:{id:'page',name:'页',html:'<main>原文</main>'},deviceProfile:'mobile',frameWidth:390,designSystem:system,designSystemOrigin:origin,knowledgeSources:[knowledge]});
 const imported=buildHtmlImportContract({mode:'preserve',fileName:'page.html',html:'<main>原文</main>',deviceProfile:'mobile',frameWidth:390,designSystem:system});
 for(const c of [create,restyle,imported]){expect(isTaskContractShape(c)).toBe(true);expect(c.designSystem).toMatchObject({id:'theme',name:'主题'});for(const secret of ['THEME_PAYLOAD','THEME_SECRET','ORIGIN_SECRET','SOURCE_SECRET','updatedAt'])expect(JSON.stringify(c)).not.toContain(secret);}
 system.name='后来修改';origin.sourceId='changed';knowledge.id='changed';expect(create.designSystem!.name).toBe('主题');expect(create.designSystemOrigin!.sourceId).toBe('theme');expect(create.knowledgeSources[0].id).toBe('doc');
});

test('archive page binding tolerates only newly injected IDs, never replacement of existing IDs or content',()=>{
 expect(sameRecordedHtml('<main><p>正文</p></main>','<main data-nid="root"><p data-nid="copy">正文</p></main>')).toBe(true);
 expect(sameRecordedHtml('<main data-nid="keep"><p>正文</p></main>','<main data-nid="other"><p>正文</p></main>')).toBe(false);
 expect(sameRecordedHtml('<main><p>正文</p></main>','<main><p>另一正文</p></main>')).toBe(false);
});
