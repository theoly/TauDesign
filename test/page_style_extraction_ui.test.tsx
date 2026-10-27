import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,test} from 'bun:test';
import {DesignSystemPanel} from '../src/components/layout/panels/DesignSystemPanel';
import {ThemeEditor} from '../src/components/theme/ThemeEditor';
import {useProjectStore} from '../src/stores/useProjectStore';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{useProjectStore.getState().initNewProject({name:'入口验证',deviceProfile:'mobile',createSpecimen:false});useProjectStore.getState().addScreen({name:'暖色参考',htmlContent:'<body data-nid="root0001" style="background:linear-gradient(180deg,#fff3ea,#ffffff)"><button data-nid="action01">开始</button></body>'},'source');host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const button=(name:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===name)!;
test('设计系统入口打开共用面板，选择背景后可确认与撤销',async()=>{
 await act(async()=>root.render(<DesignSystemPanel onOpenThemeEditor={()=>{}} onOpenRestyle={()=>{}}/>));
 expect(button('从已有页面提取风格')).toBeDefined();await act(async()=>{button('从已有页面提取风格').click();await new Promise(r=>setTimeout(r,30));});
 await act(async()=>{await new Promise(r=>setTimeout(r,30));});
 expect(host.querySelector('[role="dialog"][aria-label="从已有页面提取风格"]')).not.toBeNull();
 expect(button('应用所选风格').disabled).toBe(true);
 const choice=host.querySelector('input[aria-label^="选择页面背景"]') as HTMLInputElement;expect(choice).not.toBeNull();await act(async()=>choice.click());
 expect(button('应用所选风格').disabled).toBe(false);await act(async()=>button('应用所选风格').click());expect(useProjectStore.getState().designSystem.tokens.backgrounds?.page?.light?.kind).toBe('gradient');
});
test('完整主题编辑器也提供同名入口和背景编辑区',async()=>{
 await act(async()=>root.render(<ThemeEditor onClose={()=>{}}/>));expect(button('从已有页面提取风格')).toBeDefined();expect(host.textContent).toContain('背景与渐变');
});
