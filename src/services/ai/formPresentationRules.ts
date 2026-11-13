import type {QualityFinding} from './generationQuality';

export const FORM_PRESENTATION_RULES=`表单：输入用边框/下划线/有效填充等清晰指示，保留label关联、状态和业务原值。相关只读项共组，外框留Token内距勿贴边，不伪装可编辑。同类行标签与值统一列，长标签完整换行。密度按设备、业务和spacing/typography Token选取，组间大于组内，兼顾触控，不套固定行高/padding。颜色Token用于颜色，border-width用长度、border-style用solid等；合法变量/fallback/引用链保留。只改选中的元素或区域，保留其它业务/控件/媒体外链；导入保留原貌不强排。`;
export const SCOPED_FORM_PRESENTATION_RULES=FORM_PRESENTATION_RULES+'\n局部范围优先：上述指导仅适用于本次授权子树，已有无关表单和只读分组不得为满足指导重排；当前操作协议不支持的调整应停止说明，不扩大授权、不更改输出Schema。';

/** Measured presentation advice, never a semantic/aesthetic guarantee or an automatic rewrite. */
export function inspectFormPresentation(doc:Document,maxNodes=1500):QualityFinding[]{
 const win=doc.defaultView;
 if(!win||doc.documentElement.clientWidth<=0||doc.body.getBoundingClientRect().width<=0)return [];
 const findings:QualityFinding[]=[];
 const css=(el:Element)=>win.getComputedStyle(el);
 const visible=(el:Element)=>{
  for(let at:Element|null=el;at;at=at.parentElement){const s=css(at);if(at.hasAttribute('hidden')||s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}
  const r=el.getBoundingClientRect();return r.width>0&&r.height>0;
 };
 const ink=(value:string)=>value!=='transparent'&&!/rgba\([^)]*,\s*0\s*\)$/.test(value)&&!/[\s/]0(?:\.0+)?\s*\)$/.test(value);
 const outlined=(el:Element)=>{
  const s=css(el);return ['Top','Right','Bottom','Left'].some(side=>Number.parseFloat(s[`border${side}Width` as keyof CSSStyleDeclaration] as string)>0&&
   !['none','hidden',''].includes(s[`border${side}Style` as keyof CSSStyleDeclaration] as string)&&ink(s[`border${side}Color` as keyof CSSStyleDeclaration] as string));
 };
 const decorated=(el:Element)=>{
  const s=css(el);return outlined(el)||s.boxShadow!==''&&s.boxShadow!=='none'||s.backgroundImage!==''&&s.backgroundImage!=='none';
 };
 const filled=(el:Element)=>{
  const s=css(el);if(!ink(s.backgroundColor)||!el.parentElement)return false;
  // Transparent ancestors cannot establish a known background comparison.
  const match=(value:string)=>/^rgba?\(([^)]+)\)$/.exec(value)?.[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  const a=match(s.backgroundColor),b=match(css(el.parentElement).backgroundColor);
  return Boolean(a&&b&&(a[3]??1)===1&&(b[3]??1)===1&&a.slice(0,3).some((n,i)=>Math.abs(n-b[i])>=12));
 };
 const add=(el:Element,code:string,message:string,actual:string,expected:string)=>findings.push({code,severity:'warning',nid:el.getAttribute('data-nid')??el.closest('[data-nid]')?.getAttribute('data-nid')??undefined,message,actual,expected});
 const controls=Array.from(doc.querySelectorAll('input,select,textarea')).slice(0,maxNodes).filter(el=>!el.matches('input[type="hidden"],input[type="radio"],input[type="checkbox"],input[type="range"],input[type="color"],input[type="file"],input[type="button"],input[type="submit"],input[type="reset"],[readonly],[disabled]')&&visible(el));
 for(const el of controls){
  let indication=decorated(el)||filled(el);
  // An input-group boundary can be legitimate; a whole form outline cannot identify every input.
  for(let at=el.parentElement,depth=0;!indication&&at&&depth<2;at=at.parentElement,depth++){
   if(at.querySelectorAll('input:not([type="hidden"]),select,textarea').length!==1)break;
   indication=decorated(at)||filled(at);
  }
  if(!indication)add(el,'render_form_input_affordance','输入区域缺少可测得的边框、下划线、填充或阴影指示，请人工核对可辨识性。','控件及紧邻独立输入组未测得清晰输入指示','选用符合页面风格的边框/下划线/有效填充等方式；不强制统一外观');
 }
 const groupSelector='form,fieldset,[role="group"],[data-form-group],dl';
 for(const group of Array.from(doc.querySelectorAll(groupSelector)).slice(0,maxNodes)){
  if(!visible(group))continue;
  const labels=Array.from(group.querySelectorAll('label')).filter(label=>label.closest(groupSelector)===group&&visible(label));
  const rows=labels.flatMap(label=>{
   const id=label.getAttribute('for'),control=id?doc.getElementById(id):label.querySelector('input,select,textarea');
   if(!control||!group.contains(control)||!visible(control)||label.contains(control))return [];
   const a=label.getBoundingClientRect(),b=control.getBoundingClientRect();
   if(Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=0||a.right>b.left+2)return [];
   return [{label,control,a,b}];
  });
  if(rows.length>=3&&rows.every(row=>!['absolute','fixed'].includes(css(row.control).position))){
   // Only comparable same-column horizontal rows; multiple responsive columns are not presumed wrong.
   const xs=rows.map(row=>row.a.left),values=rows.map(row=>row.b.left);
   if(Math.max(...xs)-Math.min(...xs)<=2&&Math.max(...values)-Math.min(...values)>Math.max(3,Number.parseFloat(css(group).fontSize)*0.25))
    add(group,'render_form_column_alignment','同组水平字段的标签起点一致，但控件列起点不一致，请核对是否有意设计。',`值列起点差${Math.round(Math.max(...values)-Math.min(...values))}px`,'同类字段共享列轨道；保留长标签和不同响应式布局');
  }
  if(!outlined(group)||group.querySelector('input:not([readonly]):not([disabled]),select:not([disabled]),textarea:not([readonly]):not([disabled])'))continue;
  if(group.querySelectorAll('dt,[readonly],[disabled],[aria-readonly="true"]').length<2)continue;
  const s=css(group),sides=['Top','Right','Bottom','Left'];
  if(sides.some(side=>!(Number.parseFloat(s[`padding${side}` as keyof CSSStyleDeclaration] as string)>0)))
   add(group,'render_form_group_padding','只读信息组有外框，但部分方向没有内边距，请核对内容是否贴边。',`padding ${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,'按项目spacing Token给相关只读信息组留出呼吸空间；嵌套内容已有留白时可保留');
 }
 return findings;
}
