import {projectAuthoringNotice,type ProjectAuthoringSession} from './projectAuthoring';
/** A readable/recovered project is not necessarily an editable project. */
export function projectWriteIssue(state:{projectAuthoringSession:ProjectAuthoringSession|null;projectSaveStatus:string|null;projectSaveError:string|null},historyError?:string|null):string|undefined{
 const reason=projectAuthoringNotice(state.projectAuthoringSession)??(state.projectSaveStatus==='readonly'?state.projectSaveError??'当前工程仅供恢复查看。':undefined)??historyError;
 if(reason)return `当前工程无法保存设计：${reason} 请先恢复缺失文件并重新打开工程。`;
 if(!state.projectAuthoringSession)return '当前工程尚未建立保存会话，请重新打开工程后再设计。';
}
