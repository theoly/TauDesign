import {expect,test} from 'bun:test';
import {inspectDesignEntities,designEntitySummary} from '../src/services/ai/designEntityValidation';
import type {ComponentDefinition} from '../src/types/project';
const card:ComponentDefinition={id:'card',name:'资料卡片',templateHtml:'<article><p>资料</p></article>',version:3,createdAt:1,updatedAt:1};
const options={components:{card},pageIds:['home','detail']};
const instance=(version='3',extra='')=>`<article data-nid="card0001" data-component-id="card" data-component-version="${version}" ${extra}><p>用户资料</p></article>`;
test('有效组件与页面目标只读检查，原始HTML和定义保持不变',()=>{
 const html=`<main>${instance()}<a data-target-screen-id="detail">详情</a></main>`,before=JSON.stringify(options);
 expect(inspectDesignEntities(html,options)).toMatchObject({passed:true,componentCount:1,pageLinkCount:1,findings:[]});expect(JSON.stringify(options)).toBe(before);expect(html).toContain('用户资料');
});
for(const id of ['missing','','toString',' card '])test(`未知或空组件 ${JSON.stringify(id)} 不以原型属性当作定义`,()=>{
 const report=inspectDesignEntities(`<article data-component-id="${id}">资料</article>`,options);expect(report.passed).toBe(false);expect(report.findings[0].code).toBe('unresolved_component_reference');
});
for(const value of ['','0','-1','1.5','abc','4','01','9007199254740993'])test(`无效或未来版本 ${value}`,()=>expect(inspectDesignEntities(instance(value),options).passed).toBe(false));
test('缺省版本兼容但明确披露未验证模板，不伪称模板相等',()=>{
 const report=inspectDesignEntities('<article data-component-id="card">自由文案</article>',options);expect(report.passed).toBe(true);expect(report.findings[0].severity).toBe('warning');expect(designEntitySummary(report)).toContain('未验证模板一致性');
});
test('孤立版本属性和坏定义不能通过',()=>{
 expect(inspectDesignEntities('<div data-component-version="3"></div>',options).findings[0].code).toBe('orphan_component_version');
 for(const change of [{id:'different'},{templateHtml:''},{version:0},{version:NaN},{version:null as any}])expect(inspectDesignEntities(instance(),{...options,components:{card:{...card,...change}}}).findings[0].code).toBe('invalid_component_definition');
});
test('同一旧实例可保留，当前内容和样式无需强制同步',()=>{
 const baseline=instance('1'),html=baseline.replace('用户资料','用户编辑内容');const report=inspectDesignEntities(html,{...options,baselineHtml:baseline});
 expect(report.passed).toBe(true);expect(report.findings[0]).toMatchObject({code:'stale_component_instance',severity:'warning'});expect(designEntitySummary(report)).toContain('本次未同步模板');
 expect(inspectDesignEntities(instance('1'),options).passed).toBe(false);
});
for(const change of ['nid','version','component','tag','copy'] as const)test(`旧实例 ${change} 不能授权新引入的旧版本`,()=>{
 const baseline=instance('1');let html=baseline;
 if(change==='nid')html=html.replace('card0001','new00001');if(change==='version')html=instance('2');if(change==='component')html=html.replace('data-component-id="card"','data-component-id="other"');if(change==='tag')html=html.replaceAll('article','section');if(change==='copy')html+=instance('1').replace('card0001','copy0001');
 expect(inspectDesignEntities(html,{...options,components:{...options.components,other:{...card,id:'other'}},baselineHtml:baseline}).passed).toBe(false);
});
test('无nid的旧页面按DOM位置兼容，重复基线nid不授予例外',()=>{
 const baseline=instance('1').replace(' data-nid="card0001"','');expect(inspectDesignEntities(baseline,{...options,baselineHtml:baseline}).passed).toBe(true);
 expect(inspectDesignEntities(instance('1'),{...options,baselineHtml:instance('1')+instance('1')}).passed).toBe(false);
 expect(inspectDesignEntities(instance('1')+instance('1'),{...options,baselineHtml:instance('1')}).passed).toBe(false);
});
for(const id of ['','missing',' detail '])test(`不存在的静态目标 ${JSON.stringify(id)}`,()=>{
 expect(inspectDesignEntities(`<button data-target-screen-id="${id}">详情</button>`,options).findings[0].code).toBe('unresolved_page_link');
});
test('检查template内容及SVG属性，不检查普通外部href的业务行为',()=>{
 const report=inspectDesignEntities('<template><template><div data-component-id="missing"></div></template></template><svg><a data-target-screen-id="missing"><text>详情</text></a></svg>',options);
 expect(report.passed).toBe(false);expect(report.componentCount).toBe(1);expect(report.pageLinkCount).toBe(1);
 expect(inspectDesignEntities('<a href="https://example.com">资料</a>',options).passed).toBe(true);
});
