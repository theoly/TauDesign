import type { DesignSystem } from '../../types/designSystem';
import type { Asset, ProjectSettings, Screen, StyleOverride } from '../../types/project';
import type { ProjectStorage } from '../storage/projectStorage';
import { resolveImportedResources } from '../import/importResources';
import { buildScreenDocument } from '../../utils/screenDocument';
import { compileTokensToCss } from '../../utils/cssCompiler';
import { getBaseCss } from '../../styles/baseCss';
import { resolveProjectViewport } from '../../utils/referenceDevice';
import { observeRenderedQuality, type RenderedQualityReport } from '../../utils/renderedQuality';
import {createRenderResourceSnapshot,type RenderResourceFile} from '../storage/renderResourceSnapshot';

export interface PageRenderRequest {
  screen: Screen; designSystem: DesignSystem; settings: ProjectSettings;
  assets: Asset[]; overrides: Record<string, StyleOverride>;
}

/** Separate same-origin srcdoc surface. It neither mounts authored DOM into the host nor alters the current candidate. */
export const PageRenderCheck = {
  async inspect(request: PageRenderRequest, storage: ProjectStorage, deps: {
    signal?: AbortSignal; timeoutMs?: number; observe?: typeof observeRenderedQuality;
  } = {}): Promise<RenderedQualityReport> {
    let iframe: HTMLIFrameElement | undefined;
    let dispose = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort = () => {};
    let stopped = false;
    let resourceFiles:RenderResourceFile[]|undefined;
    return new Promise<RenderedQualityReport>(resolve => {
      const finish = (report: RenderedQualityReport) => {
        if (stopped) return;stopped = true;
        clearTimeout(timer);deps.signal?.removeEventListener('abort', abort);dispose();iframe?.remove();resolve({...report,...(resourceFiles?{resourceFiles}:{})});
      };
      abort = () => finish({status:'unavailable',findings:[],inspected:0,reason:'渲染检查已取消。'});
      if (deps.signal?.aborted) {abort();return;}
      deps.signal?.addEventListener('abort', abort, {once:true});
      let latest: RenderedQualityReport | undefined;
      timer = setTimeout(() => finish({status:latest?.status === 'incomplete' ? 'incomplete' : 'unavailable',
        findings:latest?.findings ?? [],inspected:latest?.inspected ?? 0,reason:latest?.reason ?? '渲染或资源检查超时。'}), deps.timeoutMs ?? 8_000);
      void (async () => {
        try {
          if (!document.body || !document.documentElement.clientWidth) throw new Error('当前环境没有可用的实际渲染视口。');
          const allowed = new Set(request.assets.map(asset => asset.relPath));
          const css = Object.values(request.overrides).map(ov => `[data-nid="${ov.nid}"] { ${Object.entries(ov.declarations)
            .filter(([,value]) => value !== '' && value !== null && value !== undefined)
            .map(([key,value]) => `${key}: ${value.replace(/\s*!important\s*$/i, '')} !important;`).join(' ')} }`).join('\n');
          const snapshot=createRenderResourceSnapshot(storage);
          const resources = await resolveImportedResources(request.screen.htmlContent, request.screen.scopedCss, snapshot.storage, allowed);
          const overrides = await resolveImportedResources('<body></body>', css, snapshot.storage, allowed);
          resourceFiles=await snapshot.files();
          if (stopped) return;
          const viewport = resolveProjectViewport(request.settings);
          if (viewport.width * viewport.height > 6_000_000) throw new Error('参考设备尺寸超出检查上限。');
          const srcdoc = buildScreenDocument({...request.screen,...resources}, {
            baseCss:getBaseCss(request.settings.deviceProfile),tokensCss:compileTokensToCss(request.designSystem.tokens,request.settings.colorMode),
            screenOverrides:overrides.scopedCss ?? '',deviceProfile:request.settings.deviceProfile,useCustomNavigation:request.settings.useCustomNavigation,
            includeMobileChrome:true,viewportHeight:viewport.height,viewportWidth:viewport.width
          });
          const doc = new DOMParser().parseFromString(srcdoc,'text/html'), marker = doc.createElement('meta'), id = crypto.randomUUID();
          // Offscreen and below-fold images must load before quality checks; authored HTML remains unchanged.
          doc.querySelectorAll('img').forEach(img => img.setAttribute('loading', 'eager'));
          marker.name = 'taudesign-render-check';marker.content = id;doc.head.append(marker);
          iframe = document.createElement('iframe');iframe.title = `重塑核验：${request.screen.name}`;iframe.tabIndex = -1;iframe.setAttribute('aria-hidden','true');
          iframe.style.cssText = `position:fixed;left:-100000px;top:0;width:${viewport.width}px;height:${viewport.height}px;border:0;pointer-events:none;`;
          let boundDoc: Document | null | undefined;
          iframe.addEventListener('load', () => {
            if (stopped || iframe?.contentDocument?.querySelector('meta[name="taudesign-render-check"]')?.getAttribute('content') !== id) return;
            if (boundDoc === iframe.contentDocument) return;
            boundDoc = iframe.contentDocument;
            dispose();
            // A dependency may publish synchronously; still dispose its observer after finish.
            const cleanup = (deps.observe ?? observeRenderedQuality)(iframe, report => {
              latest = report;
              if (report.status === 'complete') finish(report);
            });
            if (stopped) cleanup(); else dispose = cleanup;
          });
          iframe.srcdoc = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
          document.body.append(iframe);
        } catch (error) { finish({status:'unavailable',findings:[],inspected:0,reason:error instanceof Error ? error.message : '渲染检查失败。'}); }
      })();
    });
  }
};
