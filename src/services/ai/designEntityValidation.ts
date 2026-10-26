import {hasTemplateContract,compileComponentTemplate,assertComponentInstance} from '../../utils/componentTemplate';
import type {ComponentDefinition} from '../../types/project';
import type {QualityFinding,QualityReport} from './generationQuality';
import {parseHtmlCopy} from '../../utils/htmlDocument';

export interface DesignEntityReport extends QualityReport {
  componentCount:number;
  templateCount:number;
  pageLinkCount:number;
}
interface LocatedElement {element:Element;path:string}

/** Include inert template contents; attributes there must not provide a hidden reference bypass. */
function locatedElements(html:string):LocatedElement[] {
  const {doc}=parseHtmlCopy(html),result:LocatedElement[]=[];
  const visit=(parent:ParentNode,path:string)=>{
    Array.from(parent.children).forEach((element,index)=>{
      const location=`${path}/${element.localName}:${index}`;
      result.push({element,path:location});
      visit(element,location);
      if(element.localName==='template')visit((element as HTMLTemplateElement).content,`${location}/template`);
    });
  };
  visit(doc,'');return result;
}
const identity=({element,path}:LocatedElement)=>element.hasAttribute('data-nid')?`nid:${element.getAttribute('data-nid')}`:`path:${path}`;
const versionNumber=(value:string|null)=>value!==null&&/^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):undefined;

/** Read-only identity checks, independent of model assertions or library binding mode. */
export function inspectDesignEntities(html:string,options:{components:Record<string,ComponentDefinition>;pageIds:Iterable<string>;baselineHtml?:string}):DesignEntityReport {
  const elements=locatedElements(html),baseline=new Map<string,LocatedElement[]>(),pageIds=new Set(options.pageIds),identityCounts=new Map<string,number>();
  for(const node of elements){const key=identity(node);identityCounts.set(key,(identityCounts.get(key)??0)+1);}
  for(const node of options.baselineHtml===undefined?[]:locatedElements(options.baselineHtml)){
    const key=identity(node);baseline.set(key,[...(baseline.get(key)??[]),node]);
  }
  const findings:QualityFinding[]=[];let componentCount=0,pageLinkCount=0,templateCount=0;
  const add=(element:Element,code:string,severity:'error'|'warning',message:string,actual:string,expected:string)=>findings.push({code,severity,message,actual,expected,nid:element.getAttribute('data-nid')||undefined});
  for(const node of elements){
    const {element}=node,id=element.getAttribute('data-component-id'),rawVersion=element.getAttribute('data-component-version');
    if(id!==null){
      componentCount++;
      const definition=Object.hasOwn(options.components,id)?options.components[id]:undefined;
      const current=definition?.version===undefined?1:definition.version;
      if(!id||!definition){add(element,'unresolved_component_reference','error',`引用了不存在的组件 ${id||'（空 ID）'}。`,id,'当前工程真实组件ID');}
      else if(definition.id!==id||typeof definition.templateHtml!=='string'||!definition.templateHtml.trim()||!Number.isSafeInteger(current)||current<1){
        add(element,'invalid_component_definition','error',`组件 ${id} 的定义或版本无效。`,id,'有效的当前组件定义');
      }else if(hasTemplateContract(definition)&&(()=>{try{compileComponentTemplate(definition);return false;}catch(error){add(element,'invalid_component_template_contract','error',`组件「${definition.name||id}」模板合同无效：${error instanceof Error?error.message:'无法解析'}`,id,'有效模板与插槽合同');return true;}})()){
        // A malformed explicit contract is always blocked, including legacy instances.
      }else if(rawVersion===null){
        const original=baseline.get(identity(node));
        const retained=original?.length===1&&identityCounts.get(identity(node))===1&&original[0].element.localName===element.localName&&original[0].element.getAttribute('data-component-id')===id&&original[0].element.getAttribute('data-component-version')===null;
        add(element,'unversioned_component_instance',hasTemplateContract(definition)&&!retained?'error':'warning',hasTemplateContract(definition)&&!retained?`严格组件「${definition.name||id}」的新实例必须声明当前版本，未验证模板一致性。`:`组件「${definition.name||id}」未声明实例版本，兼容保留，未验证模板一致性。`,id,'显式组件版本');
      }else{
        const declared=versionNumber(rawVersion);
        if(declared===undefined||declared>current){
          add(element,'invalid_component_version','error',`组件「${definition.name||id}」版本 ${rawVersion} 无效或高于当前 v${current}。`,rawVersion,`v${current}`);
        }else if(declared===current&&hasTemplateContract(definition)){
          try{assertComponentInstance(element,definition);templateCount++;}catch(error){add(element,'component_template_mismatch','error',`组件「${definition.name||id}」v${current}：${error instanceof Error?error.message:'模板不一致'}`,id,'固定模板与声明插槽一致');}
        }else if(declared<current){
          const original=baseline.get(identity(node));
          const unchanged=original?.length===1&&identityCounts.get(identity(node))===1&&original[0].element.localName===element.localName&&original[0].element.getAttribute('data-component-id')===id&&original[0].element.getAttribute('data-component-version')===rawVersion;
          add(element,'stale_component_instance',unchanged?'warning':'error',unchanged?
            `保留原有组件「${definition.name||id}」v${declared}，当前定义为 v${current}；本次未同步模板。`:
            `新引入的组件「${definition.name||id}」声明旧版 v${declared}，当前定义为 v${current}。`,rawVersion,`v${current}；原页同身份旧实例可保留`);
        }
      }
    }else if(rawVersion!==null){
      add(element,'orphan_component_version','error','组件版本声明缺少 data-component-id。',rawVersion,'同时提供真实组件ID');
    }
    const target=element.getAttribute('data-target-screen-id');
    if(target!==null){
      pageLinkCount++;
      if(!target||!pageIds.has(target))add(element,'unresolved_page_link','error',`静态跳转指向不存在的页面 ${target||'（空 ID）'}。`,target,'当前工程或已确认计划中的页面ID');
    }
  }
  return {passed:!findings.some(f=>f.severity==='error'),componentCount,templateCount,pageLinkCount,findings};
}

export function designEntitySummary(report:DesignEntityReport):string {
  const details=report.findings.filter(f=>f.severity==='error');
  const messages=(details.length?details:report.findings).slice(0,5).map(f=>f.message);
  return `已核对 ${report.componentCount} 个组件引用、${report.pageLinkCount} 个静态页面目标。${report.templateCount?`已核对 ${report.templateCount} 个固定模板与插槽合同。`:""}${messages.join(' ')}${report.findings.length>5?' 其余问题请检查页面引用。':''}`;
}
