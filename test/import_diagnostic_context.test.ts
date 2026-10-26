import {expect,test} from 'bun:test';
import {TokenLintEngine,getTokenLintContext,computeScreenAuditReport} from '../src/utils/tokenLint';
import {checkGenerationQuality} from '../src/services/ai/generationQuality';
import {techBlueTheme} from '../src/utils/themePresets';
import type {Screen} from '../src/types/project';
const html='<style>.author-card{background:#f80}</style><section data-nid="card" class="author-card undefined-class" style="color:#f80;background:rgb(1, 2, 3);border-radius:17px"><button>保存</button></section>';
function page(mode:'preserve'|'selective'|'unify'):Pick<Screen,'id'|'name'|'htmlContent'|'metadata'>{
 return {id:'import',name:'导入页',htmlContent:html,metadata:{importedHtml:{version:1,fileName:'source.html',mode,categories:[],changes:[],retained:[]}}};
}
test('author CSS never extends the base whitelist or asserts that the class renders without styles',()=>{
 const report=TokenLintEngine.scan(html,techBlueTheme,'mobile');
 const unknown=report.issues.filter(i=>i.issueType==='unknown_class');
 expect(unknown.map(i=>i.rawSnippet)).toEqual(['author-card','undefined-class']);
 expect(unknown.every(i=>i.description.includes('页面自带 CSS')&&!i.description.includes('不会产生任何样式'))).toBe(true);
 expect(report.complianceRate).toBeLessThan(100);
});
for(const mode of ['preserve','selective'] as const)test(`${mode} keeps exact diagnostic identities, counts and compliance while explaining retained values`,()=>{
 const context=getTokenLintContext(page(mode));expect(context).toBe('retained-source');
 const ordinary=TokenLintEngine.scan(html,techBlueTheme,'mobile'),retained=TokenLintEngine.scan(html,techBlueTheme,'mobile',context);
 expect(retained.issues.map(({issueType,nid,rawSnippet})=>({issueType,nid,rawSnippet}))).toEqual(ordinary.issues.map(({issueType,nid,rawSnippet})=>({issueType,nid,rawSnippet})));
 expect(retained.complianceRate).toBe(ordinary.complianceRate);
 const literals=retained.issues.filter(i=>i.issueType.startsWith('literal_'));expect(literals).toHaveLength(3);
 expect(literals.every(i=>i.description.startsWith('保留源页面')&&i.suggestedFix.includes('无需替换'))).toBe(true);
 expect(computeScreenAuditReport(page(mode),techBlueTheme,'mobile').issues).toEqual(retained.issues);
});
test('unify and ordinary pages still require project Tokens',()=>{
 expect(getTokenLintContext(page('unify'))).toBe('project-tokens');expect(getTokenLintContext({})).toBe('project-tokens');
 expect(TokenLintEngine.scan(html,techBlueTheme).issues.find(i=>i.issueType==='literal_color')?.description).toContain('破坏主题统一');
});
test('retained source context cannot bypass action or safety checks',()=>{
 const result=checkGenerationQuality('<main data-nid="a"><button class="btn-primary" onclick="go()"><svg></svg></button><script>go()</script></main>',{tokenLintContext:'retained-source'});
 expect(result.passed).toBe(false);
 expect(result.findings.some(f=>f.code==='event_handler'&&f.severity==='error')).toBe(true);
 expect(result.findings.some(f=>f.code==='active_content'&&f.severity==='error')).toBe(true);
 expect(result.findings.filter(f=>f.severity==='error').length).toBeGreaterThan(2);
});
test('diagnostic wording cannot change source HTML and mobile-only classes are scanned by device',()=>{
 const original=html;
 TokenLintEngine.scan(html,techBlueTheme,'mobile','retained-source');expect(html).toBe(original);
 const mobile='<div class="safe-bottom">内容</div>';
 expect(TokenLintEngine.scan(mobile,techBlueTheme,'mobile').issues).toHaveLength(0);
 expect(TokenLintEngine.scan(mobile,techBlueTheme,'pc').issues.some(i=>i.issueType==='unknown_class')).toBe(true);
});
