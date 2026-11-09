import {extractClassWhitelist} from '../src/utils/cssCompiler';
import {getBaseCss} from '../src/styles/baseCss';
import {expect,test} from 'bun:test';
import {COMPONENT_CONTRACTS,renderComponentContracts} from '../src/services/ai/componentContracts';
import {TokenLintEngine} from '../src/utils/tokenLint';
import {techBlueTheme} from '../src/utils/themePresets';
test('对话阅读建议仅随相关请求提供，保留旧页授权边界',()=>{
 const rule=COMPONENT_CONTRACTS.find(c=>c.id==='conversation-reading')!;
 expect(rule.rule).toContain('不缩字');expect(rule.rule).toContain('未授权不重组');
 expect(renderComponentContracts(true,'新建聊天建议页，咨询师提供三条建议')).toContain(rule.html);
 expect(renderComponentContracts(false,'调整对话建议')).toContain(rule.rule);
 expect(renderComponentContracts(false,'调整对话建议')).not.toContain(rule.html);
 for(const request of ['新增预约表单','增大铃铛、缩小角标','优化指标看板'])expect(renderComponentContracts(true,request)).not.toContain(rule.rule);
});
test('对话示例只用现有权威类且正文与操作纵向分离',()=>{
 const rule=COMPONENT_CONTRACTS.find(c=>c.id==='conversation-reading')!;
 for(const device of ['pc','mobile']as const)expect(TokenLintEngine.scan(rule.html,techBlueTheme,device).issues.filter(i=>i.issueType==='unknown_class')).toEqual([]);
 const doc=new DOMParser().parseFromString(rule.html,'text/html');
 expect(doc.querySelectorAll('.card').length).toBe(1);
 const article=doc.querySelector('article')!;expect(article.classList.contains('col')).toBe(true);
 expect(article.querySelector('p')!.className).toBe('text-md leading-relaxed');
 expect(article.querySelector('p')!.getAttribute('style')).toContain('var(--color-text-primary)');
 expect(article.querySelector('p')!.classList.contains('text-primary')).toBe(false);
 expect(article.querySelectorAll('button').length).toBe(2);expect(article.querySelector('.btn-primary')).toBeNull();
 expect(article.querySelector('p')!.nextElementSibling?.textContent).toContain('复制');
});

test('权威白名单识别where/复合/嵌套规则，不把属性值和声明当作类',()=>{
 const css='/* .comment { */ :where(.card), :where(.sheet-card) { background:url("font.fake");content:".content";} @media(min-width:800px){:where(.panel){color:red}.real.active:hover{color:blue}} a[title=".attribute"]:not(.disabled){color:red}';
 expect(extractClassWhitelist(css)).toEqual(['active','card','disabled','panel','real','sheet-card']);
 for(const device of ['pc','mobile']as const){const names=extractClassWhitelist(getBaseCss(device));for(const name of ['card','sheet-card','panel','tag'])expect(names).toContain(name);}
});
