import {beforeEach,expect,test} from 'bun:test';
import {neutralModernTheme} from '../src/utils/themePresets';
import {buildDesignTaskContract,buildRestyleContract,buildHtmlImportContract} from '../src/services/ai/designWorkflow';
import {makeGuidancePacket,withGuidanceReceipts,guidancePacketIssue} from '../src/services/ai/designKnowledge/receipt';
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

function rebindCorruptRoot(c:any){
 const previous=c.designGuidance;
 c.designGuidance=makeGuidancePacket(c,previous.selection,previous.protocol);
 c.designGuidance.requests=previous.requests.map((r:any,index:number)=>({...r,parentTaskId:c.taskId,requestId:`${c.taskId}:request-${index+1}`}));
 return c;
}
for(const field of ['operation','strategy','device','source','origin'] as const)test(`runtime task enum ${field} cannot accept a JSON array through string coercion`,async()=>{
 const c:any=await guided();
 if(field==='operation')c.operation=['create'];
 if(field==='strategy')c.strategy=['new-page'];
 if(field==='device')c.device.profile=['mobile'];
 if(field==='source')c.knowledgeSources=[{kind:['document'],id:'doc',fingerprint:'12345678'}];
 if(field==='origin')c.designSystemOrigin={kind:['project']};
 rebindCorruptRoot(c);
 expect(isTaskContractShape(c)).toBe(false);
 expect(taskProvenanceIssue(c,false)).toBeDefined();expect(guidancePacketIssue(c,false,'history')).toBeDefined();
 expect(captureDesignGuidanceHistory(c,c.request)).toBeUndefined();
});
for(const taskId of [7,{value:'design'},['design'],null])test(`direct source validation rejects malformed taskId ${JSON.stringify(taskId)} even with matching recalculated child identities`,async()=>{
 const c:any=await guided();c.taskId=taskId;rebindCorruptRoot(c);
 expect(guidancePacketIssue(c,false,'history')).toBeDefined();expect(guidancePacketIssue(c)).toBeDefined();
 expect(captureDesignGuidanceHistory(c,c.request)).toBeUndefined();
});
test('malformed enum source stored in real monthly conversation data cannot restore guidance while its text survives',async()=>{
 const c:any=await guided();c.knowledgeSources=[{kind:['document'],id:'doc',fingerprint:'12345678'}];rebindCorruptRoot(c);
 const storage=new LocalStorageStorage(`bad-enum-${crypto.randomUUID()}`),store=new ConversationStore(storage);
 await store.appendTurn({turnId:'bad-enum',ts:Date.UTC(2026,10,1),user:{text:c.request},assistant:{text:'保留历史设计正文',designGuidanceHistory:{version:1,contract:c}}});
 const [turn]=await new ConversationStore(storage).loadRecent();
 expect(turn.assistant.text).toBe('保留历史设计正文');expect(turn.assistant.designGuidanceHistory).toBeDefined();
 expect(readDesignGuidanceHistory(turn.assistant.designGuidanceHistory,turn.user.text)).toBeUndefined();
});

for(const extra of ['tokens','origin-time','both'] as const)test(`legacy frozen ${extra} history survives projection without rewriting its binding`,async()=>{
 const c=await guided();
 if(extra!=='origin-time')Object.assign(c.designSystem??=( {id:neutralModernTheme.id,name:neutralModernTheme.name}),{tokens:structuredClone(neutralModernTheme.tokens)});
 if(extra!=='tokens')Object.assign(c,{designSystemOrigin:{kind:'project',sourceId:'legacy-theme',updatedAt:123}});
 rebindCorruptRoot(c);
 const before=structuredClone(c),record=captureDesignGuidanceHistory(c,c.request);
 expect(record).toBeDefined();expect(record!.contract.designSystem).toEqual(c.designSystem);expect(record!.contract.designSystemOrigin).toEqual(c.designSystemOrigin);
 expect(record!.contract.designGuidance).toEqual(c.designGuidance);expect(c).toEqual(before);
 const storage=new LocalStorageStorage(`legacy-theme-${crypto.randomUUID()}`),store=new ConversationStore(storage);
 await store.appendTurn({turnId:'legacy-theme',ts:Date.UTC(2026,10,2),user:{text:c.request},assistant:{text:'原始会话正文',designGuidanceHistory:record}});
 const [turn]=await new ConversationStore(storage).loadRecent(),restored=readDesignGuidanceHistory(turn.assistant.designGuidanceHistory,turn.user.text);
 expect(restored).toEqual(record);expect(restored!.contract.designGuidance!.requests[0].status).toBe('completed');
 expect(guidancePacketIssue(restored!.contract,false,'history')).toBeUndefined();
});
for(const location of ['theme','tokens','origin'] as const)test(`legacy ${location} projection refuses undeclared nested credentials rather than rewriting a frozen binding`,async()=>{
 const c:any=await guided();c.designSystem={id:neutralModernTheme.id,name:neutralModernTheme.name,tokens:structuredClone(neutralModernTheme.tokens)};c.designSystemOrigin={kind:'project',updatedAt:1};
 if(location==='theme')c.designSystem.apiKey='LEGACY_PRIVATE_CREDENTIAL';
 if(location==='tokens')c.designSystem.tokens.typography.apiKey='LEGACY_PRIVATE_CREDENTIAL';
 if(location==='origin')c.designSystemOrigin.apiKey='LEGACY_PRIVATE_CREDENTIAL';
 rebindCorruptRoot(c);expect(captureDesignGuidanceHistory(c,c.request)).toBeUndefined();
});

test('legacy theme backgrounds and semantic color aliases remain exact read-only data',async()=>{
 const c:any=await guided(),tokens=structuredClone(neutralModernTheme.tokens);
 tokens.backgrounds={page:{light:{kind:'gradient',layers:[{kind:'linear',geometry:'90deg',stops:[{color:'#fff',position:0},{color:'#fff7ed',position:100}]}],fallback:'#fff',source:{kind:'html-import',name:'旧导入页',selector:'body',fingerprint:'12345678'}}}};
 tokens.colorRoles={light:{primary:{source:'custom',value:'#ee6600'},onPrimary:{source:'alias',role:'inverseText'}}};
 c.designSystem={id:'legacy',name:'渐变主题',tokens};rebindCorruptRoot(c);
 const record=captureDesignGuidanceHistory(c,c.request);expect(record).toBeDefined();expect(record!.contract.designSystem).toEqual(c.designSystem);expect(record!.contract.designGuidance).toEqual(c.designGuidance);
});
test('pre-A2 full-theme history does not migrate shadows or insert missing style defaults into a frozen binding',async()=>{
 const c:any=await guided(),tokens:any=structuredClone(neutralModernTheme.tokens);
 tokens.shadows={sm:'0 1px 2px #0001',md:'0 4px 6px #0001',lg:'0 8px 12px #0001'};delete tokens.blur;delete tokens.personality;
 c.designSystem={id:'legacy',name:'早期主题',tokens};rebindCorruptRoot(c);
 const record=captureDesignGuidanceHistory(c,c.request);expect(record).toBeDefined();expect(record!.contract.designSystem).toEqual(c.designSystem);expect(record!.contract.designGuidance!.bindingFingerprint).toBe(c.designGuidance.bindingFingerprint);
});
for(const bad of ['numeric-map','background-source','color-binding','time-type','inline-image'] as const)test(`legacy theme ${bad} is not silently converted to a valid historical source`,async()=>{
 const c:any=await guided(),tokens:any=structuredClone(neutralModernTheme.tokens);c.designSystem={id:'legacy',name:'旧主题',tokens};
 if(bad==='numeric-map')tokens.typography.sizes={body:'not-a-number'};
 if(bad==='background-source')tokens.backgrounds={page:{light:{kind:'solid',color:'#fff',source:{kind:'page',name:'a',selector:'body',fingerprint:'12345678',apiKey:'UNKNOWN_SECRET'}}}};
 if(bad==='color-binding')tokens.colorRoles={light:{primary:{source:'custom',value:'#ee6600',apiKey:'UNKNOWN_SECRET'}}};
 if(bad==='time-type')c.designSystemOrigin={kind:'project',updatedAt:'123'};
 if(bad==='inline-image')tokens.colors.primary['500']='data:image/png;base64,PRIVATE_IMAGE_BYTES';
 rebindCorruptRoot(c);expect(captureDesignGuidanceHistory(c,c.request)).toBeUndefined();
});
