import type {ConversationTurn} from './conversationStore';
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v));
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(s=>typeof s==='string');
/** A malformed optional field cannot take away otherwise valid conversation text. */
export function readConversationTurn(value:unknown):ConversationTurn|null {
 if(!object(value)||typeof value.turnId!=='string'||!value.turnId||typeof value.ts!=='number'||!Number.isFinite(value.ts)||value.ts<0||
  Number.isNaN(new Date(value.ts).getTime())||!/^\d{4}-/.test(new Date(value.ts).toISOString())||!object(value.user)||typeof value.user.text!=='string'||!object(value.assistant)||typeof value.assistant.text!=='string')return null;
 const t=structuredClone(value),user=t.user as Record<string,unknown>,assistant=t.assistant as Record<string,unknown>;
 if(typeof user.reviewRequest!=='string')delete user.reviewRequest;
 for(const key of ['attachments','textFiles'])if(!strings(user[key]))delete user[key];
 if(typeof t.intent!=='string')delete t.intent;
 if(typeof assistant.model!=='string')delete assistant.model;
 if(typeof assistant.durationMs!=='number'||!Number.isFinite(assistant.durationMs)||assistant.durationMs<0)delete assistant.durationMs;
 if(typeof assistant.aborted!=='boolean')delete assistant.aborted;
 if(!object(assistant.usage)||Object.values(assistant.usage).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))delete assistant.usage;
 if(!object(t.changeSet))delete t.changeSet;
 else{
  const cs=t.changeSet;
  if(!Array.isArray(cs.screens)||cs.screens.some(s=>!object(s)||typeof s.id!=='string'||typeof s.name!=='string'||!['created','rewritten'].includes(String(s.action))))delete cs.screens;
  if(!Array.isArray(cs.tokens)||cs.tokens.some(s=>!object(s)||['path','from','to'].some(k=>typeof s[k]!=='string')))delete cs.tokens;
  if(!strings(cs.decisions))delete cs.decisions;
  if(typeof cs.checkpointId!=='string')delete cs.checkpointId;
 }
 // Keep invalid planning/rule provenance so the existing read-only UI can explain it.
 return t as unknown as ConversationTurn;
}
