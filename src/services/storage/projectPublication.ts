/** A short local commit window. No token is serialized or accepted as model/candidate authority. */
export interface ProjectPublicationToken {readonly version:1;readonly projectId:string;readonly label:string}
let active:ProjectPublicationToken|null=null,view:ProjectPublicationToken|null=null,installing=false;
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(listener=>listener());
export const getProjectPublication=()=>view;
export const subscribeProjectPublication=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function assertNoProjectPublication(){if(active&&!installing)throw Error('正在保存已确认的设计，请等待保存结果后再编辑或切换工程。');}
export function beginProjectPublication(projectId:string,label:string):ProjectPublicationToken{
 if(active)throw Error('正在保存已确认的设计，请等待保存结果。');const token=Object.freeze({version:1 as const,projectId,label});active=token;view=Object.freeze({...token});notify();return token;
}
export function installProjectPublication<T>(token:ProjectPublicationToken,install:()=>T):T{
 if(active!==token||installing)throw Error('设计发布安装句柄无效。');installing=true;
 try{const result=install();if(result instanceof Promise)throw Error('设计发布安装必须同步完成。');return result;}finally{installing=false;}
}
export function endProjectPublication(token:ProjectPublicationToken){if(active!==token)throw Error('设计发布结束句柄无效。');active=null;view=null;notify();}
const projectFields=['id','name','createdAt','folderPath','projectAuthoringSession','settings','designSystem','designSystemOrigin','designLibraryBinding','screens','screenOrder','overrides','decisions','components','assets','panelStates','coverImage','quickPrompts','projectDocuments','stagedScreen'];
export function guardProjectPublicationFields(before:object,partial:object,replace=false,fields=projectFields){
 if(!active||installing)return;
 for(const field of fields)if((replace||Object.prototype.hasOwnProperty.call(partial,field))&&(before as any)[field] !== (partial as any)[field])assertNoProjectPublication();
}
