import {expect,test} from 'bun:test';
import {exportScreenPng,type PngExportOptions} from '../src/utils/pngExporter';
import type {Screen} from '../src/types/project';
const options:PngExportOptions={tokensCss:'',baseCss:'.icon-mask{-webkit-mask-image:var(--icon-svg);mask-image:var(--icon-svg)}',screenOverrides:'',width:390,scale:1,bgColor:'#fff'};
const screen=(htmlContent:string,scopedCss?:string):Screen=>({id:'mask-page',name:'掩码验收',position:{x:0,y:0},htmlContent,scopedCss});
for(const [name,page,overrides,expected] of [
 ['registered icon',screen('<main><span class="icon-mask" aria-label="消息"></span></main>'),'',true],
 ['inline mask',screen('<main><i style="mask-image: url(assets/icons/bell.svg)"></i></main>'),'',true],
 ['prefixed mask',screen('<main><i style="-webkit-mask:var(--icon-svg) center / contain no-repeat"></i></main>'),'',true],
 ['scoped mask',screen('<main class="symbol"></main>','.symbol{mask-image:url(assets/icons/bell.svg)}'),'',true],
 ['authored style mask',screen('<style>.symbol{mask:url(assets/icons/bell.svg)}</style><main class="symbol"></main>'),'',true],
 ['comment before scoped declaration',screen('<main class="symbol"></main>'),'.symbol{/* registered icon */ -webkit-mask-image:url(assets/icons/bell.svg)}',true],
 ['comment before inline declaration',screen('<main style="/* registered icon */ mask:url(assets/icons/bell.svg)"></main>'),'',true],
 ['L4 mask',screen('<main data-nid="icon0001"></main>'),'[data-nid="icon0001"]{-webkit-mask-image:url(assets/icons/bell.svg)}',true],
 ['plain page with unused base icon rule',screen('<main><h1>照片</h1><img src="assets/images/coast.png" alt="海岸"></main>'),'',false],
 ['explicit no mask',screen('<main style="mask-image:none"></main>'),'',false],
] as const)test(`native export chooses the correct backend for ${name}`,async()=>{
 const original=page.htmlContent;let calls=0;
 const result=await exportScreenPng(page,{...options,screenOverrides:overrides},{isNativeAvailable:()=>true,measureHeight:async()=>1000,nativeExport:async args=>{calls++;expect(args.preferSnapshot).toBe(expected);return {dataUrl:'data:image/png;base64,AAAA',width:390,height:1000,engine:args.preferSnapshot?'native-webview-snapshot':'native-webview-pdf'};},legacyExport:async()=>{throw Error('Unexpected fallback');}});
 expect(result.engine).toBe(expected?'native-webview-snapshot':'native-webview-pdf');expect(calls).toBe(1);expect(page.htmlContent).toBe(original);
});
test('mask snapshot failure uses the existing explicit fallback, never the known broken PDF path',async()=>{
 let calls=0;const result=await exportScreenPng(screen('<span class="icon-mask"></span>'),options,{isNativeAvailable:()=>true,measureHeight:async()=>1000,nativeExport:async args=>{calls++;expect(args.preferSnapshot).toBe(true);throw Error('snapshot timeout');},legacyExport:async()=>'data:image/png;base64,BBBB'});
 expect(calls).toBe(1);expect(result.engine).toBe('foreign-object');expect(result.fallbackReason).toBe('snapshot timeout');
});
