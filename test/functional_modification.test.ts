import {expect,test} from 'bun:test';
import {requiresFunctionalPlanning,requiresElementStructure} from '../src/services/ai/functionalModification';
import {requiresModificationReview} from '../src/services/ai/modificationEntry';
import {buildReviewedModificationRequest} from '../src/services/ai/modificationReview';
test('review metadata is not mistaken for an add action; its actual user content still controls functional routing',()=>{
 const analysis={summary:'调整层级',items:[{id:'one',title:'文字层级',reason:'主次不明显',change:'主按钮文字加粗'}]};
 expect(requiresFunctionalPlanning(buildReviewedModificationRequest(analysis,['one'],'主按钮内边距增大'))).toBe(false);
 expect(requiresFunctionalPlanning(buildReviewedModificationRequest(analysis,['one'],'新增保存按钮'))).toBe(true);
 expect(requiresFunctionalPlanning('用户补充：邮箱设为必填')).toBe(true);
 expect(requiresElementStructure('用户补充：放大图标，缩小角标')).toBe(false);
 expect(requiresElementStructure('用户补充：新增图标')).toBe(true);
});
test('clear functional changes go to internal planning without another selectable analysis',()=>{
 for(const text of ['增加邮箱输入框和保存按钮','新增筛选功能，支持按行业筛选','新增筛选表单并调整背景','删除阴影并增加保存按钮','删除推荐模块','将关注按钮改为点击后显示已关注状态','add an email field and save button']){
  expect(requiresFunctionalPlanning(text)).toBe(true);expect(requiresModificationReview(text)).toBe(false);
 }
});
test('explicit element structures include functional additions and decorative nodes, not size/style requests or quoted labels',()=>{
 for(const text of ['在卡片增加邮箱输入框','给按钮增加图标','插入分隔线','新增一行提示文字','add an icon'])expect(requiresElementStructure(text)).toBe(true);
 for(const text of ['增大图标，缩小badge','给按钮增加阴影','给输入框新增圆角','不要新增图标，只加粗文字','把标题改成“新增邮箱输入框”'])expect(requiresElementStructure(text)).toBe(false);
});
test('visual adjustments, label changes, protective constraints and vague optimization do not create business planning',()=>{
 for(const text of ['给按钮增加阴影，文字小一号','增大图标，缩小badge','把按钮文案改为“新增筛选功能”','不要新增功能，只调整按钮颜色','优化页面','删除按钮的阴影','给输入框增加圆角'])expect(requiresFunctionalPlanning(text)).toBe(false);
 expect(requiresModificationReview('优化页面')).toBe(true);
});
