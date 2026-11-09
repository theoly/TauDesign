import type {ProjectStorage} from './projectStorage';
export interface PublicationDescriptor {id:string;kind:'candidate'|'restyle'|'batch';screenIds:string[];componentIds?:string[]}
export interface ProjectPublicationCommit {
 version:1;id:string;kind:PublicationDescriptor['kind'];projectId:string;at:number;beforeIdentity:string;
 screens:Array<{id:string;htmlSha256:string;cssSha256:string}>;
 components:Array<{id:string;htmlSha256:string}>;
}
const shaPattern=/^[a-f0-9]{64}$/;
const isSha=(value:unknown)=>typeof value==='string'&&shaPattern.test(value);
const keys=(value:object,names:string[])=>Object.keys(value).sort().join(',')===names.sort().join(',');
export const publicationSha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
function validCommit(value:unknown,projectId:string):value is ProjectPublicationCommit{
 const row=value as ProjectPublicationCommit;
 return !!row&&keys(row,['version','id','kind','projectId','at','beforeIdentity','screens','components'])&&row.version===1&&row.projectId===projectId&&typeof row.id==='string'&&/^[a-z0-9-]{1,160}$/.test(row.id)&&['candidate','restyle','batch'].includes(row.kind)&&Number.isFinite(row.at)&&row.at>0&&isSha(row.beforeIdentity)&&
  Array.isArray(row.screens)&&Array.isArray(row.components)&&row.screens.length+row.components.length>0&&
  row.screens.every(p=>p&&keys(p,['id','htmlSha256','cssSha256'])&&typeof p.id==='string'&&isSha(p.htmlSha256)&&isSha(p.cssSha256))&&new Set(row.screens.map(p=>p.id)).size===row.screens.length&&
  row.components.every(p=>p&&keys(p,['id','htmlSha256'])&&typeof p.id==='string'&&isSha(p.htmlSha256))&&new Set(row.components.map(p=>p.id)).size===row.components.length;
}
export function parsePublicationCommits(value:unknown,projectId:string):ProjectPublicationCommit[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||!value.every(row=>validCommit(row,projectId))||new Set(value.map(row=>row.id)).size!==value.length)throw Error('工程交付提交事实损坏，未覆盖原记录；请先恢复工程资料。');
 return value;
}
/** Metadata inside the authoritative project, never a second page index or permission to execute. */
export async function appendPublicationCommit(files:Record<string,string>,projectId:string,beforeIdentity:string,descriptor:PublicationDescriptor){
 if(!descriptor||Object.keys(descriptor).some(key=>!['id','kind','screenIds','componentIds'].includes(key))||!Array.isArray(descriptor.screenIds)||descriptor.componentIds!==undefined&&!Array.isArray(descriptor.componentIds))throw Error('交付提交范围无效。');
 const root=JSON.parse(files['project.json']),previous=parsePublicationCommits(root.publicationCommits,projectId);
 if(previous.some(row=>row.id===descriptor.id))throw Error('交付已提交，不能重复发布同一结果。');
 const row:ProjectPublicationCommit={version:1,id:descriptor.id,kind:descriptor.kind,projectId,at:Date.now(),beforeIdentity,screens:[],components:[]};
 for(const id of descriptor.screenIds){if(typeof id!=='string'||!root.screens[id]||files[`screens/${id}.html`]===undefined)throw Error('交付页面不在本次完整工程中。');row.screens.push({id,htmlSha256:await publicationSha(files[`screens/${id}.html`]),cssSha256:await publicationSha(files[`screens/${id}.css`]??'')});}
 for(const id of descriptor.componentIds??[]){const html=root.components?.[id]?.templateHtml;if(typeof html!=='string')throw Error('交付组件不在本次完整工程中。');row.components.push({id,htmlSha256:await publicationSha(html)});}
 if(!validCommit(row,projectId))throw Error('交付提交事实无效。');root.publicationCommits=[...previous,row];files['project.json']=JSON.stringify(root,null,2);return row;
}
export async function readPublicationCommits(storage:ProjectStorage,projectId:string){
 const text=await storage.readText('project.json');if(!text)return [];
 const root=JSON.parse(text);if(root.id!==projectId)return [];return parsePublicationCommits(root.publicationCommits,projectId);
}
export async function matchesPublicationCommit(commit:ProjectPublicationCommit|undefined,expected:{id:string;kind:PublicationDescriptor['kind'];screens:Array<{id:string;htmlContent:string;scopedCss?:string}>;components?:Array<{id:string;templateHtml:string}>}){
 if(!commit||commit.id!==expected.id||commit.kind!==expected.kind||commit.screens.length!==expected.screens.length||commit.components.length!==(expected.components?.length??0))return false;
 for(const page of expected.screens){const row=commit.screens.find(p=>p.id===page.id);if(!row||row.htmlSha256!==await publicationSha(page.htmlContent)||row.cssSha256!==await publicationSha(page.scopedCss??''))return false;}
 for(const component of expected.components??[]){const row=commit.components.find(c=>c.id===component.id);if(!row||row.htmlSha256!==await publicationSha(component.templateHtml))return false;}return true;
}
