import {beforeEach,expect,test} from 'bun:test';
import {useProjectStore} from '../src/stores/useProjectStore';
import {useHistoryStore} from '../src/stores/useHistoryStore';
import {extractPageStyle,mergeExtractedStyle} from '../src/services/import/pageStyleExtraction';
import {styleApplicationKey} from '../src/services/import/styleApplication';
import {buildScreenDocument} from '../src/utils/screenDocument';
import {compileTokensToCss} from '../src/utils/cssCompiler';
import {getBaseCss} from '../src/styles/baseCss';
import {seedImportedScreen} from './helpers/importFixture';
import {buildStandaloneHtml} from '../src/utils/exportRenderer';
import {backgroundScreenUpdates} from '../src/services/import/styleApplication';
import {screenBackgroundCss,manualBackgroundResetCss} from '../src/utils/screenBackgrounds';

beforeEach(()=>{useProjectStore.getState().initNewProject({name:'渐变提取',deviceProfile:'mobile',createSpecimen:false});
 useProjectStore.getState().addScreen({name:'参考',htmlContent:'<body data-nid="root0001" style="background:linear-gradient(180deg,#fff3ea,#ffffff)"><button data-nid="action01">开始</button></body>',position:{x:0,y:0}},'source');useProjectStore.getState().addBlankScreen('保持原样');useHistoryStore.getState().restore(null);});
test('选择性背景同步与主题在一次History中恢复',()=>{
 const s=useProjectStore.getState(),a=extractPageStyle(s.screens.source,s.designSystem,'light','mobile'),choice=a.backgrounds.find(c=>c.role==='page')!,theme=mergeExtractedStyle(s.designSystem,a,{backgroundIds:[choice.id],fields:[]},'light'),other=s.screenOrder.find(id=>id!=='source')!;
 s.applyExtractedStyle(theme,['source'],styleApplicationKey(s));
 const next=useProjectStore.getState();expect(next.designSystem.tokens.backgrounds?.page?.light?.kind).toBe('gradient');expect(next.screens[other].metadata?.themeBackgrounds?.snapshot?.page?.light?.kind).toBe('solid');expect(next.screens.source.htmlContent).toBe(s.screens.source.htmlContent);
 expect(useHistoryStore.getState().past).toHaveLength(1);useHistoryStore.getState().undo();expect(useProjectStore.getState().designSystem).toEqual(s.designSystem);expect(useProjectStore.getState().screens[other].metadata?.themeBackgrounds).toBeUndefined();useHistoryStore.getState().redo();expect(useProjectStore.getState().designSystem).toEqual(theme);
 const html=buildScreenDocument(next.screens.source,{tokensCss:compileTokensToCss(theme.tokens),baseCss:getBaseCss('mobile'),screenOverrides:'',deviceProfile:'mobile'});expect(html).toContain('data-taudesign-runtime="theme-backgrounds"');expect(html).toContain('--background-page');
});
test('过期预览不能覆盖新主题，固定设计库不能编辑',()=>{
 const s=useProjectStore.getState(),key=styleApplicationKey(s);s.addBlankScreen('后来新增');expect(()=>useProjectStore.getState().applyExtractedStyle(s.designSystem,[],key)).toThrow('变化');
 useProjectStore.setState({designLibraryBinding:{mode:'pinned_reference'} as any});expect(()=>useProjectStore.getState().applyExtractedStyle(s.designSystem,[],styleApplicationKey(useProjectStore.getState()))).toThrow();
});
test('已有工程仅显式确认导入主题后可更新，导入和背景冻结一次撤销',()=>{
 const s=useProjectStore.getState(),theme=structuredClone(s.designSystem);theme.tokens.backgrounds={page:{light:{kind:'gradient',layers:[{kind:'linear',geometry:'180deg',stops:[{color:'#fff3ea'},{color:'#fff'}]}]}}};
 const screen={name:'新导入',htmlContent:'<body data-nid="import01">导入内容</body>',metadata:{importedHtml:{fileName:'new.html',mode:'preserve' as const,categories:[],changes:[],retained:[],version:1 as const}}};
 expect(()=>seedImportedScreen(screen,{projectId:s.id,designSystem:theme})).toThrow();
 const id=seedImportedScreen(screen,{projectId:s.id,designSystem:theme,themeUpdate:{expectedKey:styleApplicationKey(s),syncScreenIds:[]}});
 expect(useProjectStore.getState().designSystem).toEqual(theme);expect(useProjectStore.getState().screens.source.metadata?.themeBackgrounds?.snapshot).toBeDefined();
 expect(useHistoryStore.getState().past).toHaveLength(1);useHistoryStore.getState().undo();expect(useProjectStore.getState().screens[id]).toBeUndefined();expect(useProjectStore.getState().designSystem).toEqual(s.designSystem);
 expect(useProjectStore.getState().screens.source).toEqual(s.screens.source);useHistoryStore.getState().redo();expect(useProjectStore.getState().screens.source.htmlContent).toBe(s.screens.source.htmlContent);expect(useProjectStore.getState().screens.source.position).toEqual(s.screens.source.position);
});
test('独立HTML剥离内部nid后仍保留选定根背景绑定',()=>{
 const s=useProjectStore.getState(),screen={...s.screens.source,htmlContent:'<main data-nid="root0001" class="bg-surface">内容</main>',metadata:{themeBackgrounds:{bindings:{page:['[data-nid="root0001"]']}}}};
 const html=buildStandaloneHtml(screen,{tokensCss:compileTokensToCss(s.designSystem.tokens),baseCss:getBaseCss('mobile'),screenOverrides:'',deviceProfile:'mobile'}),doc=new DOMParser().parseFromString(html,'text/html');
 expect(doc.querySelector('[data-nid]')).toBeNull();expect(doc.querySelector('[data-export-id="root0001"]')).not.toBeNull();expect(doc.querySelector('style[data-taudesign-runtime="theme-backgrounds"]')?.textContent).toContain('[data-export-id="root0001"]');
});
test('只改主色也冻结未选旧页面的主操作背景',()=>{
 const s=useProjectStore.getState(),theme=structuredClone(s.designSystem);theme.tokens.colors.primary['500']='#ff0000';
 expect(backgroundScreenUpdates(s,theme,[])[s.screenOrder[1]].metadata?.themeBackgrounds?.snapshot?.primaryAction).toBeDefined();
});
test('手动L4背景色关闭主题渐变图层且不再强绑该角色',()=>{
 const s=useProjectStore.getState(),screen={...s.screens.source,metadata:{themeBackgrounds:{bindings:{page:['body','[data-nid="root0001"]']}}}};
 const css='[data-nid="root0001"] { background-color: #ff0000 !important; }';
 expect(screenBackgroundCss(screen,'light',css)).not.toContain('background:var(--background-page)');expect(manualBackgroundResetCss(css)).toContain('background-image:none!important');
});
test('显式同步可在运行副本降低来源内联important，源HTML不变',()=>{
 const s=useProjectStore.getState(),screen={...s.screens.source,htmlContent:'<main data-nid="root0001" style="background:green!important">内容</main>',metadata:{themeBackgrounds:{bindings:{page:['[data-nid="root0001"]']}}}};
 const html=buildScreenDocument(screen,{tokensCss:compileTokensToCss(s.designSystem.tokens),baseCss:getBaseCss('mobile'),screenOverrides:'',deviceProfile:'mobile'}),doc=new DOMParser().parseFromString(html,'text/html');
 expect((doc.querySelector('main') as HTMLElement).style.getPropertyPriority('background')).not.toBe('important');expect(screen.htmlContent).toContain('green!important');
});
test('手动L4纯色可以覆盖来源inline重要渐变图片',()=>{
 const s=useProjectStore.getState(),screen={...s.screens.source,htmlContent:'<main data-nid="root0001" style="background-image:linear-gradient(red,blue)!important">内容</main>'};
 const html=buildScreenDocument(screen,{tokensCss:compileTokensToCss(s.designSystem.tokens),baseCss:getBaseCss('mobile'),screenOverrides:'[data-nid="root0001"]{background-color:red!important}',deviceProfile:'mobile'}),doc=new DOMParser().parseFromString(html,'text/html');
 expect((doc.querySelector('main') as HTMLElement).style.getPropertyPriority('background-image')).not.toBe('important');
});
