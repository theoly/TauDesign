import { afterEach, beforeEach, expect, test } from 'bun:test';
import { PageRenderCheck } from '../src/services/ai/pageRenderCheck';
import { createProjectStorage } from '../src/services/storage/projectStorage';
import { useProjectStore } from '../src/stores/useProjectStore';
import { neutralModernTheme } from '../src/utils/themePresets';

let width:PropertyDescriptor|undefined;
beforeEach(()=>{width=Object.getOwnPropertyDescriptor(document.documentElement,'clientWidth');Object.defineProperty(document.documentElement,'clientWidth',{configurable:true,value:1600});});
afterEach(()=>{if(width)Object.defineProperty(document.documentElement,'clientWidth',width);else delete (document.documentElement as any).clientWidth;document.querySelectorAll('iframe[title^="重塑核验"]').forEach(el=>el.remove());});
const request=()=>({screen:{id:'a',name:'真实核验',position:{x:0,y:0},htmlContent:'<main data-nid="a"><button data-nid="b" class="btn">提交</button></main>'},
  designSystem:neutralModernTheme,settings:{...useProjectStore.getState().settings,deviceProfile:'mobile' as const,frameWidth:390,useCustomNavigation:false},assets:[],overrides:{}});
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
async function loadFrame(){
  for(let i=0;i<30;i++){
    const iframe=document.querySelector<HTMLIFrameElement>('iframe[title^="重塑核验"]');
    if(iframe){const doc=iframe.contentDocument?.querySelector('meta[name="taudesign-render-check"]') ? iframe.contentDocument : new DOMParser().parseFromString(iframe.srcdoc,'text/html');if(doc!==iframe.contentDocument)Object.defineProperty(iframe,'contentDocument',{configurable:true,value:doc});iframe.dispatchEvent(new Event('load'));return {iframe,doc};}
    await wait();
  }
  throw new Error('iframe not mounted');
}
test('uses srcdoc with real device dimensions, CSP, tokens, chrome and L4; removes observer and surface',async()=>{
  let disposed=0;let publish!:(report:any)=>void;const r=request();r.overrides={b:{nid:'b',declarations:{color:'var(--color-primary)'}}};
  const pending=PageRenderCheck.inspect(r,createProjectStorage('render-test'),{observe:(_frame,callback)=>{publish=callback;return()=>{disposed++;};}});
  const {iframe,doc}=await loadFrame();
  expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("script-src 'none'");
  expect(doc.querySelector('style[data-taudesign-runtime="tokens"]')?.textContent).toContain('--color-primary');
  expect(doc.querySelector('style[data-taudesign-runtime="overrides"]')?.textContent).toContain('[data-nid="b"]');
  expect(doc.querySelector('.td-mini-title')).not.toBeNull();expect(iframe.style.width).toBe('390px');expect(iframe.style.height).not.toBe('0px');
  publish({status:'complete',findings:[],inspected:2});const result=await pending;
  expect(result.status).toBe('complete');expect(iframe.isConnected).toBe(false);expect(disposed).toBe(1);
});
test('incomplete evidence cannot become success on timeout; pending observers are cleaned',async()=>{
  let disposed=0;const pending=PageRenderCheck.inspect(request(),createProjectStorage('render-test'),{timeoutMs:70,
    observe:(_frame,publish)=>{publish({status:'incomplete',findings:[],inspected:2,reason:'字体尚未就绪'});return()=>{disposed++;};}});
  await loadFrame();const result=await pending;expect(result.status).toBe('incomplete');expect(result.reason).toContain('字体');expect(disposed).toBe(1);
  expect(document.querySelector('iframe[title^="重塑核验"]')).toBeNull();
});
test('loads lazy images eagerly only in the inspection copy, including below the fold',async()=>{
  const r=request();r.screen.htmlContent='<main style="padding-top:2000px"><img loading="lazy" src="data:image/svg+xml,%3Csvg/%3E" alt="图片"></main>';
  const original=r.screen.htmlContent;let publish!:(report:any)=>void;
  const pending=PageRenderCheck.inspect(r,createProjectStorage('render-test'),{observe:(_frame,callback)=>{publish=callback;return()=>{};}});
  const {doc}=await loadFrame();
  try {expect(doc.querySelector('img')?.getAttribute('loading')).toBe('eager');expect(r.screen.htmlContent).toBe(original);}
  finally {publish({status:'complete',findings:[],inspected:2});await pending;}
});
test('abort cleans an active iframe and ignores late complete evidence',async()=>{
  const controller=new AbortController();let publish!:(report:any)=>void;let disposed=0;
  const pending=PageRenderCheck.inspect(request(),createProjectStorage('render-test'),{signal:controller.signal,
    observe:(_frame,callback)=>{publish=callback;return()=>{disposed++;};}});
  await loadFrame();controller.abort();const result=await pending;publish({status:'complete',findings:[],inspected:2});
  expect(result.status).toBe('unavailable');expect(result.reason).toContain('取消');expect(disposed).toBe(1);expect(document.querySelector('iframe[title^="重塑核验"]')).toBeNull();
});
test('DOM simulators without a viewport fail explicitly rather than reporting a fabricated pass',async()=>{
  Object.defineProperty(document.documentElement,'clientWidth',{configurable:true,value:0});
  const result=await PageRenderCheck.inspect(request(),createProjectStorage('render-test'));
  expect(result.status).toBe('unavailable');expect(result.reason).toContain('实际渲染视口');
});

test('render proof fingerprints the same local image/font/L4 bytes materialized into srcdoc',async()=>{
 const {readProjectRenderResources}=await import('../src/services/ai/projectAssetIntegrity');
 const image='assets/images/render.png',font=`assets/imports/fonts/${'b'.repeat(64)}.woff2`,storage=createProjectStorage(`render-${crypto.randomUUID()}`);
 await storage.writeBinary(image,btoa('image'));await storage.writeBinary(font,btoa('font'));
 const r=request();r.screen.htmlContent=`<main data-nid="a"><style>@font-face{font-family:Local;src:url('${font}')}</style><img src="${image}" alt="例图"></main>`;
 r.assets=[{id:'image',relPath:image} as never];r.overrides={a:{nid:'a',declarations:{background:`url('${image}')`}}};
 let publish!:(report:any)=>void;
 const pending=PageRenderCheck.inspect(r,storage,{observe:(_frame,callback)=>{publish=callback;return()=>{};}});
 const {doc}=await loadFrame();
 try{
  expect(doc.querySelector('img')!.getAttribute('src')).toContain('data:image/png;base64,');
  expect(doc.querySelector('style[data-taudesign-runtime="overrides"]')!.textContent).toContain('data:image/png;base64,');
  const expected=await readProjectRenderResources(storage,[r.screen],r.assets,r.overrides);
  publish({status:'complete',findings:[],inspected:2});expect((await pending).resourceFiles).toEqual(expected.resourceFiles);
 }finally{publish({status:'complete',findings:[],inspected:2});await pending;}
});
