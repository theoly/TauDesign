import {describe,expect,test} from 'bun:test';
import {extractPageStyle,mergeExtractedStyle} from '../src/services/import/pageStyleExtraction';
import {defaultTheme} from '../src/utils/themePresets';

const html=`<html><head><style>:root{--start:#fff3ea;--end:#fffaf5;--brand:#f57e4d}body{background:linear-gradient(180deg,var(--start),var(--end))}.primary{background:linear-gradient(90deg,var(--brand),#e95b28);border-radius:16px} .avatar{background:linear-gradient(red,blue)}.veil{position:fixed;inset:0;background:linear-gradient(black,transparent)}</style></head><body data-nid="root0001"><button class="primary" data-nid="action01">立即开始</button><div class="avatar" data-nid="avatar01">头像</div><div class="veil" data-nid="overlay1">遮罩</div></body></html>`;
const analyze=(source=html)=>extractPageStyle({id:'source',name:'参考页',htmlContent:source,position:{x:0,y:0}},defaultTheme,'light','mobile');
describe('页面风格提取',()=>{
 test('根背景与主按钮分开，解析变量并保留来源',()=>{
  const a=analyze(),page=a.backgrounds.find(c=>c.role==='page'&&c.paint.kind==='gradient'),action=a.backgrounds.find(c=>c.role==='primaryAction');
  expect(page).toBeDefined();expect(action).toBeDefined();expect(JSON.stringify(page!.paint)).toContain('#fff3ea');expect(page!.paint.source?.name).toBe('参考页');expect(page!.selector).toBe('[data-nid="root0001"]');
  expect(a.backgrounds.filter(c=>c.role==='page').some(c=>c.selector.includes('avatar01')||c.selector.includes('overlay1'))).toBe(false);
 });
 test('只合并所选角色，不重写字体/另一模式/来源主题',()=>{
  const a=analyze(),choice=a.backgrounds.find(c=>c.role==='page')!,before=JSON.stringify(defaultTheme);
  const merged=mergeExtractedStyle(defaultTheme,a,{backgroundIds:[choice.id],fields:[]},'light');
  expect(merged.tokens.backgrounds?.page?.light).toEqual(choice.paint);expect(merged.tokens.backgrounds?.primaryAction).toBeUndefined();expect(merged.tokens.backgrounds?.page?.dark).toBeUndefined();expect(merged.tokens.typography).toEqual(defaultTheme.tokens.typography);expect(JSON.stringify(defaultTheme)).toBe(before);
 });
 test('没有有效背景时不猜渐变，危险表达式不能成为候选',()=>{
  const a=analyze('<html><body style="background:url(javascript:alert(1))"><img src="x" style="background:linear-gradient(red,blue)"></body></html>');
  expect(a.backgrounds.some(c=>c.role==='page'&&c.paint.kind==='gradient')).toBe(false);expect(a.warnings.length).toBeGreaterThan(0);
 });
 test('未选择/不存在的候选不得静默修改主题',()=>{
  const a=analyze();expect(mergeExtractedStyle(defaultTheme,a,{backgroundIds:[],fields:[]},'light')).toEqual(defaultTheme);
  expect(()=>mergeExtractedStyle(defaultTheme,a,{backgroundIds:['missing'],fields:[]},'light')).toThrow();
 });
 test('首个局部卡片不推断成高可信页面背景',()=>{
  const a=analyze('<body><main><section class="promo" data-nid="promocard" style="background:linear-gradient(red,blue)">小型推广卡片</section></main></body>');
  expect(a.backgrounds.find(c=>c.selector.includes('promocard'))?.role).toBe('decorativeSurface');
 });
 test('用户明确指定局部渐变用途后才提升为页面背景',()=>{
  const a=analyze('<main><section data-nid="promocard" style="background:linear-gradient(red,blue)">卡片</section></main>'),choice=a.backgrounds.find(c=>c.role==='decorativeSurface')!;
  const merged=mergeExtractedStyle(defaultTheme,a,{backgroundIds:[choice.id],fields:[],backgroundRoles:{[choice.id]:'page'}},'light');expect(merged.tokens.backgrounds?.page?.light).toEqual(choice.paint);expect(merged.tokens.backgrounds?.decorativeSurface).toBeUndefined();
 });
});
