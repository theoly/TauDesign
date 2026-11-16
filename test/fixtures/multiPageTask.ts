import type {PageTaskPlan} from '../../src/services/ai/pageTaskPlan';
/** Extractable multi-page request: each block has a page title and ≥2 content sections. */
export function pageSpec(id:string,title:string):string{
 return `## ${id} ${title}\n### 展示内容\n${title}的核心信息与主操作。\n### 用户操作与结果\n完成${title}相关操作并反馈。`;
}
export function twoPageRequest():string{return `${pageSpec('P01','登录页')}\n${pageSpec('P02','注册页')}`;}
export function threePageRequest():string{return `${twoPageRequest()}\n${pageSpec('P03','首页')}`;}
export function multiPageTask(name:string,requirements:string[],links:string[]=[]):PageTaskPlan {
 return {goal:`浏览${name}并完成所需操作`,actor:'页面用户',completion:['看到操作反馈'],questions:[],features:[{id:'f1',title:'本页内容',change:'add',basis:'user',sourceIds:['user:request'],
  information:[{label:requirements[0]??'资料',kind:'display'}],interactions:[{label:'提交',precondition:'信息已填写',outcome:'展示提交反馈',targetScreenId:''},...links.map(name=>({label:`打开${name}`,precondition:'需要查看关联信息',outcome:`显示${name}`,targetScreenId:name}))],
  states:[{name:'默认',condition:'进入页面',feedback:'显示本页内容'}]}]};
}
export function withMultiPageTasks<T extends {pages:Array<{name:string;requirements:string[];links:string[]}>}>(value:T) {
 return {...value,pages:value.pages.map(p=>({...p,task:multiPageTask(p.name,p.requirements,p.links)}))};
}
