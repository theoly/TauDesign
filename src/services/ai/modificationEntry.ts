/** 入口判断只读取用户诉求，不从原页面或附件代码推断用户已授权的修改。 */
export function requiresModificationReview(request: string, context: { hasElementReference?: boolean } = {}): boolean {
  const text = request.replace(/\[引用(?:元素|画框)[^\]]*\]/g, '').trim();
  // 用户主动要求先给建议时，即使举了具体修改例子也应先分析。
  const instructions = text.replace(/“[^”]*”|「[^」]*」|"[^"]*"|'[^']*'/g, '');
  if (/先[^。\n]{0,12}(?:分析|建议|列出|方案)|(?:列出|给出|提供)[^。\n]{0,12}(?:修改点|修改建议|优化建议)|不要直接(?:改|修改)|\banaly[sz]e\b[^.\n]*\bfirst\b/i.test(instructions)) return true;
  const target = /按钮|标题|卡片|图标|头像|姓名|文案|文本|文字|节点|字段|输入框|表单|抽屉|弹窗|底栏|顶栏|导航|列表|标签|角标|徽标|间距|圆角|背景|边框|阴影|字号|手机号|邮箱|电话|CTA|sheet|button|heading|title|card|icon|badge|avatar|label|field|input|form|drawer|footer|header|spacing|radius/i;
  return !text.split(/[。；;\n]|(?=并(?:且|将|把|给|为)|同时)/).some(part => {
    // 保留配色、不删除按钮属于保护条件，不能让宽泛优化跳过分析。
    const clause = part
      .replace(/(?:保留|保持|不要(?:删除|删|移除|修改|更改|调整|改动)|不(?:删除|删|移除|修改|更改|调整|改动))[^，,。；;\n]*/g, '')
      .replace(/(?:增加|添加|加上|提升|增强)(?:一点|一些|更多|些)?(?:视觉)?(?:美感|质感|高级感|现代感|设计感|专业感)/g, '').trim();
    if (!clause) return false;
    if (/(?:改成|改为|替换为|缩短为|换成|设置为|设置成|设为|调整为)\s*[“「"'\w\u4e00-\u9fff]/i.test(clause)) return true;
    if (!context.hasElementReference && !target.test(clause)) return false;
    if (/太长|过长|挤压|遮挡|溢出|丢失|消失|看不见|不见了|未居中|不居中|错位|重叠|截断/.test(clause)) return true;
    if (/增加|添加|新增|加上|加入|补上|增大|缩小|放大|减小|变大|变小|删除|移除|去掉|隐藏|显示|加粗|居中|对齐|固定|吸底|缩短|换行|单行|收缩|滚动|重排|移动|放到|移到/.test(clause)) return true;
    if (/\b(?:add|remove|delete|hide|show|center|align|resize|move|replace)\b|\bchange\b.+\bto\b/i.test(clause)) return true;
    return /\b\d+(?:\.\d+)?\s*(?:px|rem|em|%)|(?:btn-|text-|font-|gap-|p-)[a-z0-9-]+|(?:使用|采用|改用)\s*#[a-f0-9]{3,8}\b/i.test(clause);
  });
}
