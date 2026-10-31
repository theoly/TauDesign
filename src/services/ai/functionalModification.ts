import {formRuleChanges} from './formBehaviorChanges';
const withoutReviewLabels=(request:string)=>request.replace(/(^|\n)\s*用户补充\s*[:：]\s*/g,'$1');
/** A bounded entry hint. It never grants scope, and ambiguous requests keep the existing review flow. */
export function requiresFunctionalPlanning(request:string):boolean {
  const instructions=withoutReviewLabels(request);
  if(formRuleChanges(instructions).length)return true;
  const text=instructions.replace(/“[^”]*”|「[^」]*」|"[^"]*"|'[^']*'/g,'');
  return text.split(/[，,。；;\n]|并(?:且)?|同时|以及|\band\b/i).some(clause=>{
    if(/不要|无需|无须|禁止|不得|不增加|不新增|不删除|不修改|保留|保持|\b(?:do not|don't|without)\b/i.test(clause))return false;
    // Adding decoration to a control does not add functionality to it.
    if(/(?:阴影|圆角|颜色|配色|背景|边框|字号|字体|间距|文案|文字|shadow|radius|color|spacing|font|label text)/i.test(clause))return false;
    return /(?:增加|添加|新增|加入|补充|补上|删除|移除|去掉|\b(?:add|remove|delete|insert)\b).{0,50}(?:功能|模块|字段|输入框|表单|按钮|筛选|搜索|分页|排序|权限|校验|选项|field|input|form|button|feature|section|filter|search|pagination|validation)/i.test(clause)
      || /(?:点击|选择|提交|勾选|切换|输入|\b(?:click|select|submit)\b).{0,35}(?:后|时|then|after).{0,50}(?:显示|打开|跳转|校验|禁用|启用|更新|反馈|show|open|navigate|validate|disable|enable)/i.test(clause);
  });
}

/** Only explicit structural operations on an already referenced element. Never chooses a wider root. */
export function requiresElementStructure(request:string):boolean {
  if(requiresFunctionalPlanning(request))return true;
  const text=withoutReviewLabels(request).replace(/“[^”]*”|「[^」]*」|"[^"]*"|'[^']*'/g,'');
  return text.split(/[，,。；;\n]|并(?:且)?|同时|以及|\band\b/i).some(clause=>{
    if(/不要|无需|无须|禁止|不得|保留|保持|\b(?:do not|don't|without)\b/i.test(clause)||/阴影|圆角|颜色|配色|背景|边框|字号|字体|间距|宽度|高度|shadow|radius|color|spacing|font|width|height/i.test(clause))return false;
    return /(?:增加|添加|新增|插入|加入|加上|补上|删除|移除|去掉|\b(?:add|insert|remove|delete)\b).{0,35}(?:图标|分隔线|徽标|角标|标签|进度条|图片|提示|说明|一(?:段|行|条).{0,8}(?:文字|内容)|icon|divider|badge|image|paragraph|hint)/i.test(clause);
  });
}
