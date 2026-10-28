import { afterEach, describe, expect, test } from 'bun:test';
import { inspectRenderedQuality, observeRenderedQuality, type RenderedQualityReport } from '../src/utils/renderedQuality';

const frames: HTMLIFrameElement[] = [];
function fixture(html: string, extraCss = '') {
  const iframe = document.createElement('iframe'); document.body.append(iframe); frames.push(iframe);
  const doc = iframe.contentDocument!;
  doc.head.innerHTML = `<style>* { background-color:rgba(0,0,0,0); background-image:none; mix-blend-mode:normal; overflow-x:visible; overflow-y:visible; font-size:14px; font-weight:400; visibility:visible; opacity:1; } html,body { background-color:rgb(255,255,255); color:rgb(0,0,0); opacity:1; } ${extraCss}</style>`;
  doc.body.innerHTML = html;
  const sizes = (el: Element, x: number, y: number, width: number, height: number) => {
    el.getBoundingClientRect = () => ({ x, y, left:x, top:y, width, height, right:x+width, bottom:y+height, toJSON:()=>({}) });
    for (const [key, value] of Object.entries({ clientWidth:width, clientHeight:height, scrollWidth:width, scrollHeight:height })) Object.defineProperty(el,key,{ configurable:true, value });
  };
  Object.defineProperty(doc.documentElement,'clientWidth',{configurable:true,value:390});
  Object.defineProperty(doc.documentElement,'clientHeight',{configurable:true,value:844});
  sizes(doc.body,0,0,390,844);
  for (const el of Array.from(doc.body.querySelectorAll('*'))) sizes(el,16,20,180,24);
  // Happy DOM drops this WebKit property; inject only that browser-computed value.
  const computedStyle = doc.defaultView!.getComputedStyle.bind(doc.defaultView);
  doc.defaultView!.getComputedStyle = ((el: Element) => {
    const style = computedStyle(el);
    return new Proxy(style, { get(target, property) {
      if (property === 'getPropertyValue') return (name: string) => name === '-webkit-text-fill-color'
        ? /-webkit-text-fill-color\s*:\s*([^;]+)/.exec(el.getAttribute('style') || '')?.[1].trim() || target.getPropertyValue(name)
        : name === '-webkit-line-clamp' ? /-webkit-line-clamp\s*:\s*([^;]+)/.exec(el.getAttribute('style') || '')?.[1].trim() || target.getPropertyValue(name)
        : target.getPropertyValue(name);
      return Reflect.get(target, property, target);
    } });
  }) as typeof doc.defaultView.getComputedStyle;
  const textLines = new Map<string, Array<{top:number;bottom:number;width:number;height:number}>>();
  doc.createRange = (() => {
    let textNode: Node;
    return { selectNodeContents: (node:Node) => {textNode=node;}, getClientRects: () => textLines.get(textNode.parentElement?.closest('[data-nid]')?.getAttribute('data-nid') || '') || [{top:20,bottom:36,width:40,height:16}] };
  }) as typeof doc.createRange;
  doc.elementFromPoint = () => doc.querySelector('button') || doc.body;
  return { iframe, doc, sizes, textLines, report: () => inspectRenderedQuality(doc), codes: () => inspectRenderedQuality(doc).findings.map(f=>f.code) };
}
afterEach(()=>frames.splice(0).forEach(frame=>frame.remove()));

describe('真实渲染规则的几何输入',()=>{
  test('通知角标压住主图标时定位警告；独立占位及隐藏角标不误报',()=>{
    const f=fixture('<button class="notification-control" aria-label="通知"><svg class="icon"></svg><span data-nid="count" class="badge-count">3</span></button>');
    const button=f.doc.querySelector('button')!, icon=f.doc.querySelector('svg')!, badge=f.doc.querySelector('span')!;
    f.sizes(button,20,20,52,44);f.sizes(icon,24,30,20,20);f.sizes(badge,28,28,18,18);
    expect(f.report().findings.some(x=>x.code==='render_badge_overlap'&&x.nid==='count')).toBe(true);
    f.sizes(badge,48,22,18,18);expect(f.codes()).not.toContain('render_badge_overlap');
    f.sizes(badge,48,22,18,30);expect(f.codes()).toContain('render_badge_oversized');
    badge.setAttribute('style','display:none');f.sizes(badge,28,28,18,18);expect(f.codes()).not.toContain('render_badge_overlap');
  });
  test('旧绝对定位徽标覆盖卡片文字时警告',()=>{
    const f=fixture('<article class="card"><p data-nid="title">主内容</p><span data-nid="corner" class="badge" style="position:absolute">重要</span><svg class="icon"></svg></article>');
    f.sizes(f.doc.querySelector('article')!,10,10,200,100);f.sizes(f.doc.querySelector('svg')!,150,50,20,20);f.sizes(f.doc.querySelector('.badge')!,20,20,40,30);
    f.textLines.set('title',[{left:20,right:100,top:20,bottom:36,width:80,height:16}] as any);
    expect(f.codes()).toContain('render_badge_overlap');
  });
  test('旧图标未使用icon类时也检查定位徽标遮挡',()=>{
    const f=fixture('<button aria-label="通知"><svg></svg><span class="badge" style="position:absolute" data-nid="legacy-count">3</span></button>');
    f.sizes(f.doc.querySelector('button')!,20,20,44,44);f.sizes(f.doc.querySelector('svg')!,24,30,20,20);f.sizes(f.doc.querySelector('span')!,28,28,18,18);
    expect(f.report().findings.some(x=>x.code==='render_badge_overlap'&&x.nid==='legacy-count')).toBe(true);
  });
  test('无实际布局时不可用，不能当作检查通过',()=>{
    const frame=document.createElement('iframe'); document.body.append(frame);frames.push(frame);
    expect(inspectRenderedQuality(frame.contentDocument!).status).toBe('unavailable');
  });
  test('水平溢出及文字裁切定位到对应nid',()=>{
    const f=fixture('<p data-nid="address" style="overflow-x:hidden;overflow-y:hidden">长地址</p>');
    f.sizes(f.doc.querySelector('p')!,380,20,80,20);
    Object.defineProperty(f.doc.querySelector('p')!,'scrollWidth',{configurable:true,value:180});
    const report=f.report();
    expect(report.findings.some(x=>x.code==='render_horizontal_overflow'&&x.nid==='address')).toBe(true);
    expect(report.findings.some(x=>x.code==='render_clipped_text')).toBe(true);
  });
  test('祖先容器裁切嵌套文字时定位到文字，显式截断除外',()=>{
    const f=fixture('<div data-nid="box" style="overflow-y:hidden"><p data-nid="text">实际占多行的内容</p></div>');
    f.sizes(f.doc.querySelector('div')!,16,20,180,20);f.sizes(f.doc.querySelector('p')!,16,20,180,48);
    f.textLines.set('text',[{top:20,bottom:36,left:16,right:100,width:84,height:16},{top:40,bottom:56,left:16,right:100,width:84,height:16}] as any);
    const issues=f.report().findings.filter(x=>x.code==='render_clipped_text');expect(issues.some(x=>x.nid==='text')).toBe(true);
    f.doc.querySelector('div')!.style.textOverflow='ellipsis';
    expect(f.report().findings.filter(x=>x.code==='render_clipped_text')).toEqual([]);
  });
  test('缩放祖先的裁切坐标不与未缩放client尺寸混算',()=>{
    const f=fixture('<div data-nid="box" style="overflow-y:hidden;transform:scale(2)"><p data-nid="text">完整可见的一行</p></div>');
    f.sizes(f.doc.querySelector('div')!,16,20,360,40);f.sizes(f.doc.querySelector('p')!,16,20,300,32);
    Object.defineProperty(f.doc.querySelector('div')!,'clientWidth',{configurable:true,value:180});
    Object.defineProperty(f.doc.querySelector('div')!,'clientHeight',{configurable:true,value:20});
    f.textLines.set('text',[{top:20,bottom:52,left:16,right:200,width:184,height:32}] as any);
    expect(f.report().findings.filter(x=>x.code==='render_clipped_text')).toEqual([]);
  });
  for (const transform of ['scale:2', 'rotate:15deg', 'perspective:100px']) test(`独立变换${transform}不能绕过裁切保护`,()=>{
    const f=fixture(`<div data-nid="box" style="overflow-y:hidden;${transform}"><p data-nid="text">完整可见的一行</p></div>`);
    f.sizes(f.doc.querySelector('div')!,16,20,360,40);f.sizes(f.doc.querySelector('p')!,16,20,300,32);
    Object.defineProperty(f.doc.querySelector('div')!,'clientWidth',{configurable:true,value:180});
    Object.defineProperty(f.doc.querySelector('div')!,'clientHeight',{configurable:true,value:20});
    f.textLines.set('text',[{top:20,bottom:52,left:16,right:200,width:184,height:32}] as any);
    expect(f.report().findings.filter(x=>x.code==='render_clipped_text')).toEqual([]);
  });
  test('合法横向滚动、隐藏内容和声明截断不误报',()=>{
    const f=fixture('<section style="overflow-x:auto"><span data-nid="rail">长轨道项</span></section><p data-nid="hidden" hidden>隐藏</p><p data-nid="truncated" style="overflow-x:hidden;overflow-y:hidden;text-overflow:ellipsis">合法省略</p>');
    f.sizes(f.doc.querySelector('[data-nid="rail"]')!,450,20,100,24);
    f.sizes(f.doc.querySelector('[data-nid="hidden"]')!,500,30,100,24);
    Object.defineProperty(f.doc.querySelector('[data-nid="truncated"]')!,'scrollWidth',{configurable:true,value:500});
    expect(f.codes()).not.toContain('render_horizontal_overflow');expect(f.codes()).not.toContain('render_clipped_text');
  });
  test('多个内联片段同一行不误判，真实两行给出提示；显式多行除外',()=>{
    const f=fixture('<button data-nid="one" class="btn"><span>标题</span><span>标签</span></button><span data-nid="two" class="tag">两行</span><button data-nid="explicit" class="btn" style="white-space:normal">明确多行</button>');
    const lines=[{top:20,bottom:36,width:40,height:16},{top:40,bottom:56,width:40,height:16}];
    f.textLines.set('two',lines);f.textLines.set('explicit',lines);
    const wraps=f.report().findings.filter(x=>x.code==='render_unexpected_wrap');expect(wraps.map(x=>x.nid)).toEqual(['two']);
  });
  test('只测功能图标盒子的中心，不把内容SVG或有文字的按钮当成图标控件',()=>{
    const f=fixture('<div data-nid="off" class="icon-box"><svg class="icon"></svg></div><div data-nid="center" class="avatar"><svg class="icon"></svg></div><div data-nid="logo" class="icon-box"><svg></svg></div><button data-nid="label" class="btn"><svg class="icon"></svg>操作</button>');
    for(const id of ['off','center','logo','label'])f.sizes(f.doc.querySelector(`[data-nid="${id}"]`)!,0,0,44,44);
    f.sizes(f.doc.querySelector('[data-nid="off"] svg')!,0,0,20,20);
    f.sizes(f.doc.querySelector('[data-nid="center"] svg')!,12,12,20,20);
    const issues=f.report().findings.filter(x=>x.code==='render_icon_off_center');expect(issues.map(x=>x.nid)).toEqual(['off']);
  });
  test('控件中心被另一层遮住时提示，自己的子元素不误报',()=>{
    const f=fixture('<button data-nid="action"><span>操作</span></button><aside>浮层</aside>');
    f.doc.elementFromPoint=()=>f.doc.querySelector('aside');expect(f.codes()).toContain('render_occluded_control');
    f.doc.elementFromPoint=()=>f.doc.querySelector('button span');expect(f.codes()).not.toContain('render_occluded_control');
  });
  test('读取实际文字和祖先背景；普通小字4.5、大字3，渐变与透明组不猜测',()=>{
    const f=fixture('<p data-nid="low" style="color:rgb(180,180,180)">浅色小字</p><p data-nid="large" style="font-size:24px;color:rgb(130,130,130)">大字</p><section style="background-color:rgb(0,0,0)"><p data-nid="on-dark" style="color:rgb(255,255,255)">白字</p></section><p data-nid="gradient" style="color:rgb(180,180,180);background-image:linear-gradient(white,black)">渐变</p><section style="opacity:0.5"><p data-nid="group" style="color:rgb(180,180,180)">组透明</p></section>');
    const contrast=f.report().findings.filter(x=>x.code==='render_contrast');expect(contrast.map(x=>x.nid)).toEqual(['low']);expect(contrast[0].actual).toContain(':1');
  });
  test('资源未稳、节点预算耗尽明确为未完成',()=>{
    const f=fixture('<p data-nid="one">一</p><p data-nid="two">二</p>');
    expect(inspectRenderedQuality(f.doc,{resourcesReady:false}).status).toBe('incomplete');
    expect(inspectRenderedQuality(f.doc,{maxNodes:1}).reason).toContain('前1个');
  });
});

describe('操作控件可见性不能漏检', () => {
  const errors = (f: ReturnType<typeof fixture>) => f.report().findings.filter(x => x.code.startsWith('render_action_') && x.severity === 'error');
  for (const markup of ['<button>提交</button>', '<a href="/go">进入</a>', '<div role="button">操作</div>', '<input type="submit" value="提交">', '<input type="button" value="操作">']) {
    test(`无nid或类名的操作控件文字透明仍报错: ${markup}`, () => {
      const f = fixture(markup, 'button,a,[role="button"],input { color:rgba(0,0,0,0);background-image:linear-gradient(white,black); }');
      expect(errors(f).some(x => x.code === 'render_action_invisible_label')).toBe(true);
    });
  }
  for (const style of ['display:none', 'visibility:hidden', 'opacity:0', 'color:transparent', '-webkit-text-fill-color:transparent', 'font-size:0']) {
    test(`嵌套文案${style}给出错误`, () => {
      const f = fixture(`<button data-nid="cta"><span style="${style}">提交</span></button>`);
      expect(errors(f).map(x => x.nid)).toEqual(['cta']);
    });
  }
  for (const style of ['opacity:0', 'visibility:hidden', 'font-size:0', '-webkit-text-fill-color:transparent']) {
    test(`操作控件自身${style}不会被可见性预筛丢弃`, () => {
      const f = fixture(`<button data-nid="cta" style="${style}">提交</button>`);
      expect(errors(f).some(x => x.code === 'render_action_invisible_label')).toBe(true);
    });
  }
  for (const [width,height] of [[0,24],[180,0],[0,0]]) test(`操作控件${width}x${height}报尺寸错误`, () => {
    const f = fixture('<button data-nid="cta">提交</button>');f.sizes(f.doc.querySelector('button')!,16,20,width,height);
    expect(errors(f).some(x => x.code === 'render_action_zero_size')).toBe(true);
  });
  test('缺失文案和子文案零尺寸也报告，且不同无nid按钮不合并', () => {
    const f = fixture('<button></button><button><span>提交</span></button>');
    f.sizes(f.doc.querySelector('span')!,16,20,0,0);
    expect(errors(f)).toHaveLength(2);
  });
  test('隐藏弹层、未激活面板、显式隐藏控件和disabled不误拦', () => {
    const f = fixture('<section hidden><button></button></section><section style="display:none"><button></button></section><section style="visibility:hidden"><button></button></section><section style="opacity:0"><button></button></section><button hidden></button><button style="display:none"></button><button disabled style="color:transparent">提交</button><div role="button" aria-disabled="true"></div><fieldset disabled><button></button></fieldset>');
    expect(errors(f)).toEqual([]);
  });
  test('正常嵌套文字、默认submit和有可见图标的命名按钮不误拦', () => {
    const f = fixture('<button><span>提交</span></button><input type="submit"><button aria-label="关闭"><svg><path></path></svg></button><button title="关闭"><svg></svg></button><a href="/go"><img alt="进入"></a><button><svg><title>菜单</title><path></path></svg></button>');
    expect(errors(f)).toEqual([]);
  });
  test('可访问名称不能替代已经消失的视觉图标', () => {
    const f = fixture('<button aria-label="关闭"><svg style="display:none"></svg></button>');
    expect(errors(f)).toHaveLength(1);
  });
});

describe('渲染检查监听生命周期',()=>{
  test('输入控件文案属性变化后重查，不沿用旧的通过结果', async () => {
    const f = fixture('<input type="button" value="提交">');const reports:RenderedQualityReport[]=[];
    const stop = observeRenderedQuality(f.iframe, report => reports.push(report));
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(reports.at(-1)?.findings.filter(x => x.code.startsWith('render_action_'))).toEqual([]);
      f.doc.querySelector('input')!.setAttribute('value', '');
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(reports.at(-1)?.findings.some(x => x.code === 'render_action_invisible_label')).toBe(true);
    } finally { stop(); }
  });
  test('稳定后发布真实测量结果；样式变化会重新测量，取消后不再回调',async()=>{
    const f=fixture('<p data-nid="text">内容</p>'); const reports:RenderedQualityReport[]=[];
    const stop=observeRenderedQuality(f.iframe,r=>reports.push(r));
    await new Promise(resolve=>setTimeout(resolve,150));
    expect(reports.at(-1)?.status).toBe('complete');
    f.doc.querySelector('p')!.setAttribute('style','color:rgb(200,200,200)');
    await new Promise(resolve=>setTimeout(resolve,150));
    expect(reports.at(-1)?.findings.some(x=>x.code==='render_contrast')).toBe(true);
    stop();const count=reports.length;
    f.doc.querySelector('p')!.setAttribute('style','color:black');
    await new Promise(resolve=>setTimeout(resolve,150));expect(reports).toHaveLength(count);
  });
  test('图片超时明确未完成，后续加载完成后重新测量；编辑器高亮不触发重查',async()=>{
    const f=fixture('<p data-nid="text">内容</p><img>');const img=f.doc.querySelector('img')!;
    Object.defineProperty(img,'complete',{configurable:true,value:false});
    const reports:RenderedQualityReport[]=[];const stop=observeRenderedQuality(f.iframe,r=>reports.push(r));
    try {
      await new Promise(resolve=>setTimeout(resolve,1700));expect(reports.at(-1)?.status).toBe('incomplete');
      Object.defineProperty(img,'complete',{configurable:true,value:true});Object.defineProperty(img,'naturalWidth',{configurable:true,value:100});
      img.dispatchEvent(new Event('load'));
      await new Promise(resolve=>setTimeout(resolve,180));expect(reports.at(-1)?.status).toBe('complete');
      const count=reports.length;f.doc.querySelector('p')!.classList.add('aidesign-quality-target');
      await new Promise(resolve=>setTimeout(resolve,180));expect(reports).toHaveLength(count);
    } finally {stop();}
  });
  test('字体等待中的旧文档被取消，不会把旧报告写到新候选',async()=>{
    const f=fixture('<p data-nid="old">旧</p>'); let release!:()=>void;
    Object.defineProperty(f.doc,'fonts',{configurable:true,value:{ready:new Promise<void>(resolve=>{release=resolve;}),status:'loading',addEventListener(){},removeEventListener(){}}});
    const reports:RenderedQualityReport[]=[];const stop=observeRenderedQuality(f.iframe,r=>reports.push(r));
    await new Promise(resolve=>setTimeout(resolve,130));stop();const count=reports.length;release();
    await new Promise(resolve=>setTimeout(resolve,50));expect(reports).toHaveLength(count);expect(reports.some(x=>x.status==='complete')).toBe(false);
  });
});

describe('裁切装饰与真实水平越界',()=>{
  function decoration(style='position:absolute',host='position:relative;overflow-x:hidden;overflow-y:hidden',tag='div',extra=''){
    const f=fixture(`<section data-nid="clip-host" style="${host}"><${tag} data-nid="decoration" style="${style}" ${extra}></${tag}></section>`);
    f.sizes(f.doc.querySelector('section')!,16,20,358,100);f.sizes(f.doc.querySelector('[data-nid="decoration"]')!,300,0,98,98);return f;
  }
  test('empty rotated decoration clipped by its containing block is not visible page overflow',()=>{
    const f=decoration('position:absolute;transform:rotate(15deg)');
    expect(f.report().findings.some(x=>x.code==='render_horizontal_overflow'&&x.nid==='decoration')).toBe(false);
    f.doc.querySelector('section')!.style.overflowX='visible';
    expect(f.report().findings.some(x=>x.code==='render_horizontal_overflow'&&x.nid==='decoration')).toBe(true);
  });
  for(const [name,style,host,tag,extra] of [
    ['fixed','position:fixed','overflow-x:hidden','div',''],
    ['absolute escapes clipping ancestor','position:absolute','overflow-x:hidden','div',''],
    ['complex clip transform','position:absolute','position:relative;overflow-x:hidden;transform:scale(2)','div',''],
    ['semantic media','position:absolute','position:relative;overflow-x:hidden','img','alt="图片"'],
    ['named leaf','position:absolute','position:relative;overflow-x:hidden','div','role="img" aria-label="业务图表"'],
  ] as const)test(`${name} retains overflow warning`,()=>{
    const f=decoration(style,host,tag,extra);
    expect(f.report().findings.some(x=>x.code==='render_horizontal_overflow'&&x.nid==='decoration')).toBe(true);
  });
  test('clipping container outside viewport still warns and text is not exempted',()=>{
    const f=decoration();f.sizes(f.doc.querySelector('section')!,16,20,440,100);
    expect(f.report().findings.some(x=>x.code==='render_horizontal_overflow'&&x.nid==='decoration')).toBe(true);
    const text=fixture('<section style="position:relative;overflow-x:hidden"><p data-nid="text">必须完整显示</p></section>');
    text.sizes(text.doc.querySelector('section')!,16,20,358,100);text.sizes(text.doc.querySelector('p')!,380,20,80,24);
    text.textLines.set('text',[{top:20,bottom:36,left:380,right:460,width:80,height:16}] as any);
    expect(text.codes()).toContain('render_horizontal_overflow');expect(text.codes()).toContain('render_clipped_text');
  });
});

describe('长正文被横排操作组挤窄',()=>{
 const copy='这周六西湖边有个版画展，我多了一张票，一起去看看吗？';
 function cramped(style='',parentStyle='display:flex;flex-direction:row',markup?:string){
  const f=fixture(markup??`<div data-nid="card" style="${parentStyle}"><div data-nid="tools"><button>复制</button><button>采用</button></div><p data-nid="copy" style="${style}">${copy}</p></div>`);
  f.sizes(f.doc.querySelector('[data-nid="card"]')!,16,20,300,180);f.sizes(f.doc.querySelector('[data-nid="tools"]')!,16,80,190,44);f.sizes(f.doc.querySelector('[data-nid="copy"]')!,216,20,60,180);
  f.textLines.set('copy',Array.from({length:7},(_,i)=>({top:20+i*22,bottom:36+i*22,width:60,height:16})));
  return f;
 }
 test('不溢出也检出严重正文挤压并定位；中等宽度仅警告',()=>{
  const f=cramped();expect(f.report().findings.find(x=>x.code==='render_compressed_body')).toMatchObject({nid:'copy',severity:'error'});
  f.sizes(f.doc.querySelector('[data-nid="copy"]')!,216,20,100,180);
  expect(f.report().findings.find(x=>x.code==='render_compressed_body')?.severity).toBe('warning');
 });
 test('纵向卡片、宽正文、少行正文或已经整体换行的操作组不误报',()=>{
  const f=cramped();const copyEl=f.doc.querySelector('[data-nid="copy"]')!,root=f.doc.querySelector('[data-nid="card"]')!,tools=f.doc.querySelector('[data-nid="tools"]')!;
  root.setAttribute('style','display:flex;flex-direction:column');expect(f.codes()).not.toContain('render_compressed_body');
  root.setAttribute('style','display:flex;flex-direction:row');f.sizes(copyEl,16,140,60,180);expect(f.codes()).not.toContain('render_compressed_body');
  f.sizes(copyEl,216,20,180,180);expect(f.codes()).not.toContain('render_compressed_body');
  f.sizes(copyEl,216,20,60,180);f.textLines.set('copy',[{top:20,bottom:36,width:60,height:16}]);expect(f.codes()).not.toContain('render_compressed_body');
  f.textLines.set('copy',Array.from({length:7},(_,i)=>({top:20+i*22,bottom:36+i*22,width:60,height:16})));tools.remove();expect(f.codes()).not.toContain('render_compressed_body');
 });
 for(const style of ['writing-mode:vertical-rl','text-overflow:ellipsis','-webkit-line-clamp:2','transform:scale(2)'])test(`显式特殊排版不推断为窄列：${style}`,()=>{expect(cramped(style).codes()).not.toContain('render_compressed_body');});
 test('竖排祖先和表格不误报，无nid正文仍检查',()=>{
  const f=cramped();f.doc.querySelector('[data-nid="card"]')!.setAttribute('style','display:flex;writing-mode:vertical-rl');expect(f.codes()).not.toContain('render_compressed_body');
  f.doc.querySelector('[data-nid="card"]')!.setAttribute('style','display:flex;flex-direction:row');
  f.doc.querySelector('[data-nid="card"]')!.setAttribute('role','table');expect(f.codes()).not.toContain('render_compressed_body');
  f.doc.querySelector('[data-nid="card"]')!.removeAttribute('role');
  f.doc.querySelector('p')!.removeAttribute('data-nid');f.textLines.set('card',Array.from({length:7},(_,i)=>({top:20+i*22,bottom:36+i*22,width:60,height:16})));
  expect(f.codes()).toContain('render_compressed_body');
 });
});
