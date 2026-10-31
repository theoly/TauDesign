import type {DesignTaskContract} from './designWorkflow';
import {isTaskContractShape} from './taskContractShape';
import {WORKFLOW_CATALOG} from './workflowCatalog';
import {guidancePacketIssue} from './designKnowledge/receipt';
import {pageTaskPlanIssue} from './pageTaskPlan';
import {validMultiPageScope} from './multiPageContract';
import {validReferenceImageIdentity,validLibrarySourceIdentity} from './workflowSources';
import {parseHtmlCopy} from '../../utils/htmlDocument';

/** Adoption can inject missing stable IDs; it cannot silently change the archived page content. */
export function sameRecordedHtml(source:string,result:string):boolean {
 if(source===result)return true;
 try{
  const a=parseHtmlCopy(source).doc,b=parseHtmlCopy(result).doc;
  const original=Array.from(a.querySelectorAll('*')),delivered=Array.from(b.querySelectorAll('*'));
  if(original.length!==delivered.length)return false;
  original.forEach((el,index)=>{if(!el.hasAttribute('data-nid'))delivered[index].removeAttribute('data-nid');});
  return a.documentElement.isEqualNode(b.documentElement);
 }catch{return false;}
}

/** Historical identity/shape, never a current checker-plan or adoption authorization. */
export function taskProvenanceIssue(value:DesignTaskContract|undefined,completed=true):string|undefined {
 if(value===undefined)return; // Existing archives may predate task contracts.
 if(!isTaskContractShape(value))return '任务来源结构损坏。';
 const workflow=Object.hasOwn(WORKFLOW_CATALOG,value.workflowId)?WORKFLOW_CATALOG[value.workflowId]:undefined;
 if(!workflow||value.operation!==workflow.operation||value.strategy!==workflow.strategy)return '任务来源工作流身份不一致。';
 if((value.multiPage!==undefined&&!validMultiPageScope(value.multiPage))||
  (value.referenceImage!==undefined&&!validReferenceImageIdentity(value.referenceImage))||
  (value.librarySource!==undefined&&!validLibrarySourceIdentity(value.librarySource)))return '任务来源身份不完整。';
 return guidancePacketIssue(value,completed,'history')??pageTaskPlanIssue(value);
}
