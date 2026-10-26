import {test,expect} from 'bun:test';
import {parseOuterShadows,createBoxShadowFilter} from '../src/utils/foreignObjectShadows';
test('resolved CSS shadow list preserves color commas, spread and stacking order',()=>{
 const list=parseOuterShadows('rgba(6, 182, 212, 0.3) 0px 0px 0px 1px, rgb(6, 182, 212) 0px 6px 22px -4px')!;
 expect(list).toHaveLength(2);expect(list[1]).toEqual({color:'rgb(6, 182, 212)',x:0,y:6,blur:22,spread:-4});
 const doc=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"></svg>','image/svg+xml');const filter=createBoxShadowFilter(doc,'shadow',list,150,80);doc.documentElement.append(filter);
 expect(filter.querySelector('feMorphology')?.getAttribute('operator')).toBe('dilate');expect(filter.querySelectorAll('feMorphology')[1].getAttribute('operator')).toBe('erode');
 expect([...filter.querySelectorAll('feMergeNode')].map(e=>e.getAttribute('in'))).toEqual(['shadow1','shadow0','SourceGraphic']);expect(filter.querySelector('feGaussianBlur')?.getAttribute('stdDeviation')).toBe('11');
 expect(filter.getAttribute('color-interpolation-filters')).toBe('sRGB');expect(new DOMParser().parseFromString(new XMLSerializer().serializeToString(doc),'image/svg+xml').querySelector('parsererror')).toBeNull();
});
test('unsupported inset, malformed, huge and excessive shadows cannot masquerade as converted output',()=>{
 expect(parseOuterShadows('none')).toEqual([]);
 for(const v of ['rgba(0,0,0,.2) 0px 2px 5px inset','rgb(0,0,0) 0px 0px -1px','rgb(0,0,0) 0px 0px 900px','rgb(0,0,0 0px 0px 5px','rgb(0,0,0) 1em 2px',Array(9).fill('black 0px 1px 2px').join(',')])expect(parseOuterShadows(v)).toBeNull();
});
test('compatibility warnings survive PNG orchestration instead of being reported as a native success',async()=>{
 const {exportScreenPng}=await import('../src/utils/pngExporter');
 const result=await exportScreenPng({id:'shadow',name:'阴影',position:{x:0,y:0},htmlContent:'<main>示例</main>'},{tokensCss:'',baseCss:'',screenOverrides:'',width:300,clipToHeight:true,clipHeight:220,scale:1,bgColor:'#fff'},{isNativeAvailable:()=>false,legacyExport:async(_screen,options)=>{options.onWarning?.('透明节点无法无损补偿');return 'data:image/png;base64,fixture';}});
 expect(result.engine).toBe('foreign-object');expect(result.warnings).toEqual(['透明节点无法无损补偿']);expect(result.fallbackReason).toContain('浏览器');
});
