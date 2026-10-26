import {test,expect} from 'bun:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {PageCreationEvidencePanel} from '../src/components/inspector/PageCreationEvidencePanel';
import {useProjectStore} from '../src/stores/useProjectStore';
import {CanvasToolExecutor} from '../src/services/tools/canvasToolExecutor';
import {isPageCreationEvidence} from '../src/services/ai/pageCreationValidation';
import {stubPageCreationRender} from './helpers/pageCreation';
import {defaultTheme} from '../src/utils/themePresets';
stubPageCreationRender();
test('creation history tolerates missing/broken records and labels changed pages as historical only',async()=>{
 const s=useProjectStore.getState();s.initNewProject({name:'创建记录',deviceProfile:'pc',designSystem:defaultTheme,createSpecimen:false});
 const result=await CanvasToolExecutor.executeAsync({tool:'create_screen',params:{title:'页面',html:'<main><button class="btn btn-primary">提交</button></main>'}});
 expect(result.success).toBe(true);const page=useProjectStore.getState().screens[result.screenId!],e=page.metadata!.creationEvidence!;
 expect(isPageCreationEvidence(e)).toBe(true);expect(isPageCreationEvidence({...e,contract:{...e.contract,device:{profile:{},frameWidth:390}}})).toBe(false);
 expect(isPageCreationEvidence({...e,render:{...e.render,status:'unavailable'}})).toBe(false);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{act(()=>root.render(<PageCreationEvidencePanel screen={{...page,metadata:undefined}}/>));expect(host.textContent).toBe('');
 act(()=>root.render(<PageCreationEvidencePanel screen={{...page,metadata:{creationEvidence:{} as any}}}/>));expect(host.textContent).toContain('记录已损坏');
 act(()=>root.render(<PageCreationEvidencePanel screen={{...page,htmlContent:page.htmlContent.replace('提交','修改')}}/>));
 expect(host.textContent).toContain('仅记录创建时的检查');expect(host.textContent).toContain('页面内容已变化');expect(host.textContent).toContain('实际渲染：通过');
 }finally{act(()=>root.unmount());host.remove();}
});
