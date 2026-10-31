import {prepareNewPageWithRepair,type PageRepairModel} from '../ai/pageCreationRepair';
import type {PageRepairRecord} from '../ai/pageRepairRecord';
import { useProjectStore } from '../../stores/useProjectStore';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { NidEngine } from '../../utils/nidEngine';
import { patchElementByNid } from '../../utils/domPatcher';
import { checkGenerationQuality, qualitySummary } from '../ai/generationQuality';
import type { DesignTaskContract } from '../ai/designWorkflow';
import {buildDesignTaskContract} from '../ai/designWorkflow';
import {knowledgeFingerprint} from '../ai/projectKnowledge';
import {pageCreationContext} from '../ai/pageCreationValidation';
import {createProjectStorage} from '../storage/projectStorage';
import type { DesignExecutionRecord } from '../ai/designExecutionRecord';
import {draftExecutionIssue} from '../ai/draftExecutionSource';
import {resolveWorkflowValidation} from '../ai/workflowValidation';

export type CanvasToolCall =
  | {
      tool: 'create_screen';
      params: {
        title: string;
        html: string;
        screenId?: string;
        referencedScreenId?: string;
        workflowContract?: DesignTaskContract;
        executionRecord?: DesignExecutionRecord;
      };
    }
    | {
      tool: 'modify_screen';
      params: {
        screenId: string;
        title?: string;
        html: string;
        forceInPlace?: boolean;
        modificationRequest?: string;
        workflowContract?: DesignTaskContract;
        executionRecord?: DesignExecutionRecord;
      };
    }
  | {
      tool: 'patch_element';
      params: {
        screenId: string;
        nid: string;
        elementHtml: string;
      };
    }
  | {
      tool: 'update_theme';
      params: {
        tokens: Record<string, any>;
        reason?: string;
      };
    };

export interface CanvasToolExecutionResult {
  success: boolean;
  tool: CanvasToolCall['tool'];
  status: 'screen_created' | 'screen_modified' | 'screen_staged' | 'element_patched' | 'theme_updated' | 'failed';
  screenId?: string;
  screenName?: string;
  candidateHtml?: string;
  createdHtml?:string;
  repair?:PageRepairRecord;
  checkpointId?: string;
  error?: string;
}

/**
 * 智能清洗与精炼页面标题 (贴切同时尽量简短，不超过 20 汉字)
 */
export function sanitizeScreenTitle(rawTitle?: string): string {
  if (!rawTitle) return '新页面';
  let t = rawTitle.trim();

  // 1. 去除常见的 AI 后缀和括号标记: (AI 方案), (AI), [新版], （测试）等
  t = t.replace(/\s*[\(（\[【](?:AI|新版|方案|候选|草稿).*?[\)）\]】]/gi, '').trim();

  // 2. 去除冗余的业务前缀，如 "页面: ", "设计: "
  t = t.replace(/^(?:页面|设计|原型)[:：\s]*/, '');

  // 3. 极端长标题截断保底（不超过 20 个字符）
  if (t.length > 20) {
    t = t.slice(0, 20);
  }

  return t.trim() || '新页面';
}

/**
 * 统一画布工具执行器 (KISS 原则 / Canvas Tools)
 *
 * 所有对画板的写操作统一经由本执行器派发，
 * 集中管理画框排布坐标、历史栈 Checkpoint 与 D17 并排比选 Staging。
 */
const pendingCreations=new Set<string>();
export class CanvasToolExecutor {
  /** The only AI creation entry. Low-level blank/specimen/duplicate store actions remain synchronous. */
  static async executeAsync(call:CanvasToolCall,options:{signal?:AbortSignal;isCurrent?:()=>boolean;repair?:PageRepairModel}={}):Promise<CanvasToolExecutionResult> {
    if(call.tool!=='create_screen')return this.execute(call);
    const params=structuredClone(call.params),state=useProjectStore.getState();
    const contract=params.workflowContract===undefined?buildDesignTaskContract({intent:'create_screen',request:params.title||'创建新页面',
      deviceProfile:state.settings.deviceProfile,frameWidth:state.settings.frameWidth,designSystem:state.designSystem,
      designSystemOrigin:state.designSystemOrigin,designLibraryBinding:state.designLibraryBinding,knowledgeFingerprint:knowledgeFingerprint(state)}):params.workflowContract;
    const task=resolveWorkflowValidation(contract,'create');
    const localSourceIssue=draftExecutionIssue(params.executionRecord,params.html);
    if(!task.ok||localSourceIssue)return {success:false,tool:'create_screen',status:'failed',error:!task.ok?task.message:localSourceIssue};
    if(contract.multiPage)return {success:false,tool:'create_screen',status:'failed',error:'计划内页面必须经完整批次验收后统一交付，不能单独加入画布。'};
    const key=`${state.id}:${contract.taskId}`,context=pageCreationContext(state);
    const failed=(error:string):CanvasToolExecutionResult=>({success:false,tool:'create_screen',status:'failed',error});
    if(pendingCreations.has(key)||Object.values(state.screens).some(screen=>screen.metadata?.creationEvidence?.contract?.taskId===contract.taskId))return failed('同一新建任务正在处理或已经应用。');
    const current=()=>!options.signal?.aborted&&(options.isCurrent?.()??true)&&pageCreationContext(useProjectStore.getState())===context;
    pendingCreations.add(key);
    try {
      const snapshot=structuredClone({id:state.id,folderPath:state.folderPath,screens:state.screens,settings:state.settings,assets:state.assets,
        designSystem:state.designSystem,designSystemOrigin:state.designSystemOrigin,designLibraryBinding:state.designLibraryBinding,
        components:state.components,decisions:state.decisions,projectDocuments:state.projectDocuments,overrides:state.overrides});
      const id=params.screenId&&!state.screens[params.screenId]?params.screenId:crypto.randomUUID();
      const name=sanitizeScreenTitle(params.title?.trim()||`画框 ${state.screenOrder.length+1}`);
      const prepared=await prepareNewPageWithRepair(snapshot,{id,name,htmlContent:params.html,position:{x:0,y:0}},contract,
        createProjectStorage(state.id,state.folderPath),{isCurrent:current,signal:options.signal,repair:options.repair});
      if(prepared.status!=='ready')return {...failed(prepared.message),repair:prepared.repair};
      if(!current())return failed('应用前工程已变化或创建已取消。');
      const {position:_position,...screen}=prepared.screen;
      const creationEvidence={...prepared.evidence,...(params.executionRecord?.sectioned||params.executionRecord?.draftRepair?{execution:{...structuredClone(params.executionRecord),completeHtml:prepared.screen.htmlContent}}:{})};
      const newId=useProjectStore.getState().addScreen({...screen,metadata:{...screen.metadata,creationEvidence}},id,{referencedScreenId:params.referencedScreenId});
      const checkpointId=useHistoryStore.getState().addCheckpoint(`AI 新建页面: ${name}`,{screenId:newId,htmlContent:prepared.screen.htmlContent});
      useProjectStore.getState().panToScreen(newId);
      return {success:true,tool:'create_screen',status:'screen_created',screenId:newId,screenName:name,checkpointId,createdHtml:prepared.screen.htmlContent,repair:prepared.evidence.repair};
    }catch(error){return failed(error instanceof Error?error.message:'新建页面失败。');}
    finally{pendingCreations.delete(key);}
  }
  /**
   * 执行指定的画布工具动作
   */
  static execute(call: CanvasToolCall): CanvasToolExecutionResult {
    const store = useProjectStore.getState();
    const history = useHistoryStore.getState();

    try {
      switch (call.tool) {
        case 'create_screen': {
          return {success:false,tool:'create_screen',status:'failed',error:'AI 新建页面必须等待异步资源与实际渲染校验，请使用 executeAsync。'};
        }

        case 'modify_screen': {
          const { screenId, title, html, forceInPlace, modificationRequest, workflowContract, executionRecord } = call.params;
          const target = store.screens[screenId];
          if (!target) {
            return {
              success: false,
              tool: 'modify_screen',
              status: 'failed',
              error: `目标画框不存在: ${screenId}`
            };
          }

          const formattedHtml = NidEngine.injectNids(html);
          const quality = checkGenerationQuality(html, { deviceProfile: store.settings.deviceProfile, designSystem: store.designSystem,
            baselineHtml: target.htmlContent, protectedNids: store.getProtectedNids(screenId), modificationRequest });
          if (!quality.passed) return { success: false, tool: 'modify_screen', status: 'failed', error: qualitySummary(quality) };
          if (forceInPlace && store.stagedScreen?.targetScreenId === screenId && store.stagedScreen.newHtml === formattedHtml && store.stagedRenderQuality) {
            const rendered = store.stagedRenderQuality;
            if (rendered.key !== store.getStagedRenderContextKey() || rendered.report.status === 'pending' || rendered.report.findings.some(f => f.severity === 'error')) {
              return { success: false, tool: 'modify_screen', status: 'failed', error: '候选页面渲染检查未完成或存在严重问题，不能强制覆盖原页。' };
            }
          }
          const isGenericTitle =
            !title ||
            ['画框', '新页面', '新设计页', '未命名', '新画框'].includes(title.trim()) ||
            title.trim().startsWith('画框 ');
          const finalTitle = isGenericTitle ? target.name : (title || target.name);

          // 自动建立历史检查点备份，保障随时一键回退
          const checkpointId = history.addCheckpoint(`AI 修改画框: ${target.name}`, {
            screenId: target.id,
            htmlContent: target.htmlContent
          });

          if (forceInPlace) {
            store.updateScreenHtml(target.id, formattedHtml, `AI 修改页面: ${finalTitle}`);
            if (title && title !== target.name && !isGenericTitle) {
              store.renameScreen(target.id, title);
            }
            if (store.stagedScreen) {
              store.discardStagedChange();
            }
            store.panToScreen(target.id);

            return {
              success: true,
              tool: 'modify_screen',
              status: 'screen_modified',
              screenId: target.id,
              screenName: finalTitle,
              checkpointId
            };
          }

          // D17 & BR-SSR-01: 页面修改统一在原画框右侧暂存候选新页面，供用户直观观测与比选替换
          store.stageScreenChange(target.id, formattedHtml, `${finalTitle} (AI 调整候选)`, modificationRequest, workflowContract, executionRecord);
          store.panToScreen(target.id);

          return {
            success: true,
            tool: 'modify_screen',
            status: 'screen_staged',
            screenId: target.id,
            screenName: finalTitle,
            candidateHtml: formattedHtml,
            checkpointId
          };
        }

        case 'patch_element': {
          const { screenId, nid, elementHtml } = call.params;
          const target = store.screens[screenId];
          if (!target) {
            return {
              success: false,
              tool: 'patch_element',
              status: 'failed',
              error: `目标画框不存在: ${screenId}`
            };
          }

          // 必须先检查原始片段，DOMParser会吞掉半截标签，事后序列化无法发现截断。
          const fragmentQuality = checkGenerationQuality(elementHtml, { deviceProfile: store.settings.deviceProfile, designSystem: store.designSystem });
          if (!fragmentQuality.passed) return { success: false, tool: 'patch_element', status: 'failed', error: qualitySummary(fragmentQuality) };
          // 外科手术式局部 DOM 补丁
          const patchResult = patchElementByNid(target.htmlContent, nid, elementHtml);
          if (!patchResult.success) {
            return {
              success: false,
              tool: 'patch_element',
              status: 'failed',
              error: patchResult.error || '局部元素补丁失败'
            };
          }

          const tagLabel = patchResult.replacedTagName || nid;
          const quality = checkGenerationQuality(patchResult.html, { deviceProfile: store.settings.deviceProfile,
            designSystem: store.designSystem, baselineHtml: target.htmlContent, protectedNids: store.getProtectedNids(screenId) });
          if (!quality.passed) return { success: false, tool: 'patch_element', status: 'failed', error: qualitySummary(quality) };
          const checkpointId = history.addCheckpoint(`修改元素 <${tagLabel}>: ${target.name}`, {
            screenId: target.id,
            htmlContent: target.htmlContent
          });

          // 直接原地更新画框内容
          store.updateScreenHtml(
            target.id,
            patchResult.html,
            `局部修改元素 <${tagLabel}>`
          );

          if (store.stagedScreen) {
            store.discardStagedChange();
          }

          store.panToScreen(target.id);
          store.selectNodeByNid(target.id, nid);

          return {
            success: true,
            tool: 'patch_element',
            status: 'element_patched',
            screenId: target.id,
            screenName: target.name,
            checkpointId
          };
        }

        case 'update_theme': {
          const { tokens, reason } = call.params;
          // 合并设计系统 Tokens
          store.setDesignSystem({
            ...store.designSystem,
            tokens: {
              ...store.designSystem.tokens,
              ...tokens
            }
          });

          const activeScreen = store.activeScreenId
            ? store.screens[store.activeScreenId]
            : Object.values(store.screens)[0];

          const checkpointId = history.addCheckpoint(
            `AI 调整主题: ${reason || 'Token 预设更新'}`,
            {
              screenId: activeScreen?.id || 'global_theme',
              htmlContent: activeScreen?.htmlContent || ''
            }
          );

          return {
            success: true,
            tool: 'update_theme',
            status: 'theme_updated',
            checkpointId
          };
        }

        default:
          return {
            success: false,
            tool: (call as any).tool,
            status: 'failed',
            error: `未知工具类型: ${(call as any).tool}`
          };
      }
    } catch (err: any) {
      return {
        success: false,
        tool: call.tool,
        status: 'failed',
        error: err?.message || '画布工具执行异常'
      };
    }
  }
}
