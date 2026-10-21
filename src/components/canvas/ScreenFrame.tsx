import { resolveProjectViewport } from '../../utils/referenceDevice';
import { normalizeMobileNavigation } from '../../utils/mobileNavigation';
import { measureImportedFrame, observeImportedFrame, resolveViewportCss } from '../../utils/importViewport';
import { resolveThemeColors } from '../../utils/semanticColors';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observeRenderedQuality, type RenderedQualityReport } from '../../utils/renderedQuality';
import { Screen } from '../../types/project';
import { compileTokensToCss } from '../../utils/cssCompiler';
import { getBaseCss } from '../../styles/baseCss';
import { NidEngine } from '../../utils/nidEngine';
import { buildScreenDocument, projectCssForScreen, runtimeStyle } from '../../utils/screenDocument';
import { useScreenResources } from '../../hooks/useScreenResources';
import { inspectText, setDirectText, setTextByNid } from '../../utils/textNode';
import { useProjectStore } from '../../stores/useProjectStore';
import { handleHistoryShortcut } from '../../utils/historyShortcuts';
import { resolveOverlapAfterManualMove, calculateDragSnap } from '../../utils/canvasLayout';
import { captureScreenSnippetAsDataUrl } from '../../utils/screenCapture';
import { Copy, Edit2, Smartphone, Monitor, Image as ImageIcon, Check } from 'lucide-react';

interface ScreenFrameProps {
  screen: Screen;
  lodLevel: 0 | 1 | 2; // 0=bitmap proxy, 1=frozen iframe, 2=active iframe
  isStaged?: boolean;
  isComparisonTarget?: boolean;
  isComparisonBackground?: boolean;
  overrideSourceScreenId?: string;
  renderQualityKey?: string;
  onRenderQuality?: (id: string, key: string, report: RenderedQualityReport) => void;
  qualityFocusNid?: string;
  /** T-AE-26: 触发单画框 AI 质感润色 */
  onPolish?: (screenId: string) => void;
}

export const ScreenFrame: React.FC<ScreenFrameProps> = ({ screen, lodLevel, isStaged, isComparisonTarget, isComparisonBackground, overrideSourceScreenId, renderQualityKey, onRenderQuality, qualityFocusNid, onPolish }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number>(screen.measuredHeight || 800);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [nameInput, setNameInput] = useState(screen.name);

  const {
    settings,
    designSystem,
    activeScreenId,
    selectedNid,
    hoveredNid,
    overrides,
    setActiveScreen,
    selectNode,
    setHoveredNid,
    updateScreen,
    updateScreenHtml,
    removeScreen,
    renameScreen,
    duplicateScreen,
    setCoverImage,
    coverImage
  } = useProjectStore();

  const [isCoverSetting, setIsCoverSetting] = useState(false);
  const [coverSetSuccess, setCoverSetSuccess] = useState(false);

  const isActive = activeScreenId === screen.id;
  const frameWidth = settings.frameWidth;
  const showGuide = settings.showViewportGuide;

  const { screen: renderScreen, error: resourceError } = useScreenResources(screen);
  const imported = !!screen.metadata?.importedHtml;
  const viewport = resolveProjectViewport(settings);
  const viewportHeight = viewport.height;
  // The fold guide is a view of the selected reference device, rather than an
  // independent cached number. This also keeps legacy projects deterministic.
  const guideHeight = viewport.height;
  const viewportCss = (css: string) => resolveViewportCss(css, viewport.contentHeight, viewport.width);
  const tokensCss = viewportCss(projectCssForScreen(screen, compileTokensToCss(designSystem.tokens, settings.colorMode)));
  const isLight = settings.colorMode === 'light';

  /**
   * 画框壳与 L0 占位层的底色必须跟随当前明暗模式 (ISSUE-014)。
   * 此前二者写死 #ffffff / bg-slate-100，深色模式下画框在 iframe 绘制完成前
   * 以及整个 L0 降级档位都是一块白板，用户直观看到的就是「新建页面不遵循主题」。
   */
  const resolvedColors = resolveThemeColors(designSystem.tokens, settings.colorMode).values;
  const frameBg = resolvedColors.background;
  const frameFg = resolvedColors.textSecondary;

  // Compile L4 Overrides for this screen
  const screenOverrides = viewportCss(projectCssForScreen(screen, Object.entries(overrides)
    .filter(([key]) => key.startsWith(`${overrideSourceScreenId || screen.id}:`))
    .map(([key, ov]) => {
      const declarationsStr = Object.entries(ov.declarations)
        .filter(([_, val]) => val !== '' && val !== undefined && val !== null)
        .map(([prop, val]) => `${prop}: ${val} !important;`)
        .join(' ');
      return `[data-nid="${ov.nid}"] { ${declarationsStr} }`;
    })
    .join('\n')));

  // load可能晚于样式热更新；回调始终读取当前值，避免把新版样式回滚。
  const scopedCss = viewportCss(renderScreen?.scopedCss || '');
  const runtimeStylesRef = useRef({ scopedCss, tokensCss, screenOverrides });
  runtimeStylesRef.current = { scopedCss, tokensCss, screenOverrides };

  /**
   * 编辑器 chrome 样式：选中/悬浮描边。
   * 刻意**不放入 base.css**——它不是设计系统的一部分，
   * 进入权威源会污染类名白名单并泄漏到导出产物 (T-AE-02)。
   */
  const editorChromeCss = `
    .aidesign-quality-target { outline: 3px solid #f59e0b !important; outline-offset: 3px; }
    .aidesign-hovered {
      outline: 2px dashed #3b82f6 !important;
      outline-offset: 1px;
    }
    .aidesign-selected {
      outline: 2px solid #2563eb !important;
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.2) !important;
    }
  `;

  // Construct full frame document (preserve existing nids if already injected)
  const htmlWithNids = useMemo(() => screen.htmlContent.includes('data-nid=')
    ? screen.htmlContent
    : NidEngine.injectNids(screen.htmlContent), [screen.htmlContent]);

  useEffect(() => {
    if (!isStaged && !screen.htmlContent.includes('data-nid=')) {
      updateScreen(screen.id, { htmlContent: htmlWithNids });
    }
  }, [screen.htmlContent, screen.id, htmlWithNids, updateScreen, isStaged]);

  /**
   * 画框静态骨架文档 (D2 / D13)。
   *
   * 必须通过 useMemo 锁定在 [htmlWithNids, settings.deviceProfile]！
   * 绝对不得将 screenOverrides 与 tokensCss 包含进依赖列表 (ISSUE-019)！
   *
   * 根因：L4 样式覆盖（包括布局 Flex/Block、主轴 Row/Col、对齐方式、Gap、Padding/Margin）
   * 属于高频热更新操作。此前 fullSrcDoc 每次 render 都全量拼入 ${screenOverrides}，
   * 导致任何样式微调都会让 React 重新赋值 iframe.srcdoc。
   * 浏览器因此触发 iframe 网页全量重载，把 DOM 树完全抹除并重新构建，
   * 导致元素上的 .aidesign-selected 高亮类名被瞬时清除；且由于 selectedNid 未变，
   * 选区同步 effect 不会触发，用户看到的现象就是「点击布局按钮后蓝色选框丢失」。
   *
   * 修复方式：
   * 1. fullSrcDoc 仅在 HTML 结构改变或设备切片改变时才重新构造；
   * 2. tokensCss 与 screenOverrides 统一走内联 <style> 的 textContent 热更新（0ms，无 DOM 重建）；
   * 3. handleLoad 与 overrides effect 双重守卫当前选区的 .aidesign-selected 高亮。
   */
  const navigationTitle = useMemo(() => screen.metadata?.navigationTitle ?? screen.metadata?.importedHtml?.navigationTitle
    ?? normalizeMobileNavigation(htmlWithNids, settings).title ?? screen.name,
    [htmlWithNids, screen.name, screen.metadata?.navigationTitle, screen.metadata?.importedHtml?.navigationTitle, settings.deviceProfile, settings.useCustomNavigation]);
  const runtimeTitleRef = useRef({ title: navigationTitle, name: screen.name });
  runtimeTitleRef.current = { title: navigationTitle, name: screen.name };
  const syncRuntimeTitle = (doc: Document) => {
    doc.title = runtimeTitleRef.current.name;
    const title = doc.querySelector('.td-mini-title');
    if (title) setDirectText(title, runtimeTitleRef.current.title);
  };
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (doc) syncRuntimeTitle(doc);
  }, [screen.name, navigationTitle]);

  const fullSrcDoc = useMemo(() => {
    return buildScreenDocument({ ...screen, ...renderScreen, htmlContent: renderScreen?.htmlContent === screen.htmlContent ? htmlWithNids : renderScreen?.htmlContent ?? htmlWithNids }, {
      baseCss: getBaseCss(settings.deviceProfile), editorCss: editorChromeCss,
      tokensCss, screenOverrides, deviceProfile: settings.deviceProfile, useCustomNavigation: settings.useCustomNavigation, includeMobileChrome: true, viewportHeight, viewportWidth: frameWidth
    });
  }, [htmlWithNids, renderScreen?.htmlContent, imported, settings.deviceProfile, settings.useCustomNavigation, viewportHeight]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !onRenderQuality || !renderQualityKey || !(isStaged || isActive) || lodLevel === 0) return;
    return observeRenderedQuality(iframe, report => onRenderQuality(screen.id, renderQualityKey, report));
  }, [screen.id, fullSrcDoc, renderQualityKey, onRenderQuality, isStaged, isActive, lodLevel]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const focus = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.querySelectorAll('.aidesign-quality-target').forEach(el => el.classList.remove('aidesign-quality-target'));
      if (!qualityFocusNid) return;
      const target = Array.from(doc.querySelectorAll('[data-nid]')).find(el => el.getAttribute('data-nid') === qualityFocusNid);
      target?.classList.add('aidesign-quality-target');
      target?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    };
    focus(); iframe.addEventListener('load', focus);
    return () => iframe.removeEventListener('load', focus);
  }, [qualityFocusNid, fullSrcDoc, lodLevel]);

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    const style = doc && runtimeStyle(doc, 'scoped-css');
    if (style) style.textContent = scopedCss;
  }, [scopedCss, lodLevel]);

  // Hot update Tokens when theme changes (under 100ms, no DOM rebuild)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;
    const tokensEl = runtimeStyle(iframe.contentDocument, 'tokens');
    if (tokensEl) {
      tokensEl.textContent = tokensCss;
    }
  }, [tokensCss]);

  // Hot update Overrides
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;
    const overridesEl = runtimeStyle(iframe.contentDocument, 'overrides');
    if (overridesEl) {
      overridesEl.textContent = screenOverrides;
    }

    // 样式覆盖更新后，立即确保选中元素的 .aidesign-selected 高亮不丢失 (ISSUE-019)
    if (isActive && selectedNid) {
      const selectedEl = iframe.contentDocument.querySelector(`[data-nid="${selectedNid}"]`);
      if (selectedEl && !selectedEl.classList.contains('aidesign-selected')) {
        selectedEl.classList.add('aidesign-selected');
      }
    }

    if (selectedNid && screen.id === activeScreenId) {
      const target = iframe.contentDocument.querySelector(`[data-nid="${selectedNid}"]`) as HTMLElement | null;
      if (target) {
        const rect = target.getBoundingClientRect();
        const win = target.ownerDocument?.defaultView || iframe.contentWindow || window;
        let style: CSSStyleDeclaration | null = null;
        try {
          style = win ? win.getComputedStyle(target) : null;
        } catch {
          style = null;
        }
        const cur = useProjectStore.getState().selectedNode;
        if (cur && cur.nid === selectedNid) {
          useProjectStore.getState().selectNode({
            ...cur,
            screenId: cur.screenId || screen.id,
            computedBox: {
              width: Math.round(rect.width) || 0,
              height: Math.round(rect.height) || 0,
              top: Math.round(rect.top) || 0,
              left: Math.round(rect.left) || 0,
              padding: {
                top: (style && parseInt(style.paddingTop, 10)) || 0,
                right: (style && parseInt(style.paddingRight, 10)) || 0,
                bottom: (style && parseInt(style.paddingBottom, 10)) || 0,
                left: (style && parseInt(style.paddingLeft, 10)) || 0
              },
              margin: {
                top: (style && parseInt(style.marginTop, 10)) || 0,
                right: (style && parseInt(style.marginRight, 10)) || 0,
                bottom: (style && parseInt(style.marginBottom, 10)) || 0,
                left: (style && parseInt(style.marginLeft, 10)) || 0
              }
            },
            computedLayout: {
              display: style?.display || 'block',
              flexDirection: style?.flexDirection || 'row',
              alignItems: style?.alignItems || 'stretch',
              justifyContent: style?.justifyContent || 'flex-start',
              flexWrap: style?.flexWrap || 'nowrap',
              gap: style?.gap || '0px',
              rowGap: style?.rowGap,
              columnGap: style?.columnGap,
              position: style?.position,
              top: style?.top,
              right: style?.right,
              bottom: style?.bottom,
              left: style?.left,
              zIndex: style?.zIndex,
              width: style?.width,
              height: style?.height,
              borderRadius: style?.borderRadius,
              borderTopLeftRadius: style?.borderTopLeftRadius,
              borderTopRightRadius: style?.borderTopRightRadius,
              borderBottomRightRadius: style?.borderBottomRightRadius,
              borderBottomLeftRadius: style?.borderBottomLeftRadius
            }
          });
        }
      }
    }
  }, [screenOverrides, selectedNid, activeScreenId]);

  /**
   * 宿主直接绑定同源 iframe 的 DOM 事件。
   *
   * 画框**不得**带 `sandbox` 属性 (ISSUE-017)：WebKit (Tauri macOS WKWebView)
   * 对「脚本被禁用」的文档不执行任何事件监听器——连宿主 realm 注册的都不执行，
   * 画框因此完全丧失点选、悬浮与行内编辑能力。Chromium 无此行为，所以
   * happy-dom 单测与浏览器 dev 环境都抓不到，只有桌面端复现。
   * 脚本隔离改由 srcDoc 头部的 CSP `script-src 'none'` 承担——实测在
   * WebKit 与 Chromium 下均能拦下 `<script>` 与内联 `on*` 处理器。
   */
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cleanupListeners: (() => void) | null = null;

    const handleLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return;

      if (cleanupListeners) {
        cleanupListeners();
      }

      syncRuntimeTitle(doc);
      // 同步初始/重载后的动态样式与选中高亮 (ISSUE-019)
      const scopedEl = runtimeStyle(doc, 'scoped-css');
      if (scopedEl) scopedEl.textContent = runtimeStylesRef.current.scopedCss;
      const tokensEl = runtimeStyle(doc, 'tokens');
      if (tokensEl) tokensEl.textContent = runtimeStylesRef.current.tokensCss;
      const overridesEl = runtimeStyle(doc, 'overrides');
      if (overridesEl) overridesEl.textContent = runtimeStylesRef.current.screenOverrides;

      doc.querySelectorAll('.aidesign-selected').forEach(el => el.classList.remove('aidesign-selected'));
      doc.querySelectorAll('.aidesign-hovered').forEach(el => el.classList.remove('aidesign-hovered'));
      if (isActive && selectedNid) {
        const selectedEl = doc.querySelector(`[data-nid="${selectedNid}"]`);
        if (selectedEl) selectedEl.classList.add('aidesign-selected');
      }
      if (isActive && hoveredNid && hoveredNid !== selectedNid) {
        const hoveredEl = doc.querySelector(`[data-nid="${hoveredNid}"]`);
        if (hoveredEl) hoveredEl.classList.add('aidesign-hovered');
      }

      // Measure content height (D13)
      const measure = () => {
        const h = measureImportedFrame(iframe, Math.min(700, viewportHeight));
        setMeasuredHeight(h);
        if (!isStaged && h !== useProjectStore.getState().screens[screen.id]?.measuredHeight) updateScreen(screen.id, { measuredHeight: h });
      };
      measure();
      const cleanupHeight = observeImportedFrame(iframe, measure);

      // Mouse Hover listener
      const onMouseOver = (e: MouseEvent) => {
        if ((e.target as Element).closest('[data-taudesign-mobile-chrome]')) { e.preventDefault(); e.stopPropagation(); return; }
        e.stopPropagation();
        const target = (e.target as HTMLElement).closest('[data-nid]');
        if (target) {
          const nid = target.getAttribute('data-nid');
          setHoveredNid(nid);
        }
      };

      const onMouseOut = () => {
        setHoveredNid(null);
      };

      // Mouse Click listener
      const onClick = (e: MouseEvent) => {
        if ((e.target as Element).closest('[data-taudesign-mobile-chrome]')) { e.preventDefault(); e.stopPropagation(); return; }
        e.preventDefault();
        e.stopPropagation();
        setActiveScreen(screen.id);

        const target = (e.target as HTMLElement).closest('[data-nid]') as HTMLElement;
        if (target) {
          const nid = target.getAttribute('data-nid') || '';
          const compEl = target.closest('[data-component-id]') as HTMLElement | null;
          const componentId = compEl ? compEl.getAttribute('data-component-id') || undefined : undefined;
          const componentInstanceId = compEl ? compEl.getAttribute('data-component-instance') || undefined : undefined;

          // Collect parent chain for breadcrumb navigation (PRD §3.6.1)
          const parentChain: { nid: string; tagName: string; className?: string }[] = [];
          let cur = target.parentElement;
          while (cur && cur !== doc.body) {
            const pNid = cur.getAttribute('data-nid');
            if (pNid) {
              const clsAttr = cur.getAttribute('class');
              const cls = clsAttr || (typeof cur.className === 'string' ? cur.className : (cur.className && typeof cur.className === 'object' && 'baseVal' in cur.className ? String((cur.className as any).baseVal) : ''));
              parentChain.unshift({
                nid: pNid,
                tagName: cur.tagName.toLowerCase(),
                className: cls
              });
            }
            cur = cur.parentElement;
          }

          const rect = target.getBoundingClientRect();
          const win = target.ownerDocument?.defaultView || iframe.contentWindow || window;
          let style: CSSStyleDeclaration | null = null;
          try {
            style = win ? win.getComputedStyle(target) : null;
          } catch {
            style = null;
          }

          selectNode({
            screenId: screen.id,
            nid,
            tagName: target.tagName.toLowerCase(),
            ...(() => {
              const t = inspectText(target);
              return { textContent: t.text, textEditable: t.editable, textReason: t.reason };
            })(),
            classNames: Array.from(target.classList),
            parentChain,
            componentId,
            componentInstanceId,
            computedBox: {
              width: Math.round(rect.width) || 0,
              height: Math.round(rect.height) || 0,
              top: Math.round(rect.top) || 0,
              left: Math.round(rect.left) || 0,
              padding: {
                top: (style && parseInt(style.paddingTop, 10)) || 0,
                right: (style && parseInt(style.paddingRight, 10)) || 0,
                bottom: (style && parseInt(style.paddingBottom, 10)) || 0,
                left: (style && parseInt(style.paddingLeft, 10)) || 0
              },
              margin: {
                top: (style && parseInt(style.marginTop, 10)) || 0,
                right: (style && parseInt(style.marginRight, 10)) || 0,
                bottom: (style && parseInt(style.marginBottom, 10)) || 0,
                left: (style && parseInt(style.marginLeft, 10)) || 0
              }
            },
            computedLayout: {
              display: style?.display || 'block',
              flexDirection: style?.flexDirection || 'row',
              alignItems: style?.alignItems || 'stretch',
              justifyContent: style?.justifyContent || 'flex-start',
              flexWrap: style?.flexWrap || 'nowrap',
              gap: style?.gap || '0px',
              rowGap: style?.rowGap,
              columnGap: style?.columnGap,
              position: style?.position,
              top: style?.top,
              right: style?.right,
              bottom: style?.bottom,
              left: style?.left,
              zIndex: style?.zIndex,
              width: style?.width,
              height: style?.height,
              borderRadius: style?.borderRadius,
              borderTopLeftRadius: style?.borderTopLeftRadius,
              borderTopRightRadius: style?.borderTopRightRadius,
              borderBottomRightRadius: style?.borderBottomRightRadius,
              borderBottomLeftRadius: style?.borderBottomLeftRadius
            }
          });
        }
      };

      // Double-click listener for inline text editing (PRD §3.6.1)
      const onDblClick = (e: MouseEvent) => {
        if ((e.target as Element).closest('[data-taudesign-mobile-chrome]')) { e.preventDefault(); e.stopPropagation(); return; }
        const target = (e.target as HTMLElement).closest('[data-nid]') as HTMLElement;
        if (!target) return;
        if (inspectText(target).editable) {
          e.preventDefault();
          e.stopPropagation();
          target.contentEditable = 'true';
          target.focus();

          const finishEditing = () => {
            target.contentEditable = 'false';
            const newText = (target.textContent ?? '').trim();
            const nid = target.getAttribute('data-nid');
            if (nid && newText) {
              const nextHtml = setTextByNid(screen.htmlContent, nid, newText);
              if (nextHtml) {
                updateScreenHtml(screen.id, nextHtml, `行内编辑: ${newText.slice(0, 10)}`);
              }
            }
          };

          target.addEventListener('blur', finishEditing, { once: true });
          target.addEventListener('keydown', (ke: KeyboardEvent) => {
            if (ke.key === 'Enter') {
              ke.preventDefault();
              target.blur();
            } else if (ke.key === 'Escape') {
              ke.preventDefault();
              target.contentEditable = 'false';
            }
          });
        }
      };

      const onKeyDown = (ke: KeyboardEvent) => {
        // iframe 内的键盘事件不冒泡到父文档，撤销/重做需在此转发 (BR-HIS-10)
        if (handleHistoryShortcut(ke)) return;

        if ((ke.key === 'Delete' || ke.key === 'Backspace') && !ke.metaKey && !ke.ctrlKey) {
          const target = ke.target as HTMLElement | null;
          const isEditing = target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
          const currentSel = useProjectStore.getState().selectedNid;
          const currentActive = useProjectStore.getState().activeScreenId;
          if (!isEditing && currentSel && screen.id === currentActive) {
            ke.preventDefault();
            useProjectStore.getState().deleteNode(screen.id, currentSel);
          }
        }
      };

      doc.body.addEventListener('mouseover', onMouseOver);
      doc.body.addEventListener('mouseout', onMouseOut);
      doc.body.addEventListener('click', onClick);
      doc.body.addEventListener('dblclick', onDblClick);
      doc.body.addEventListener('keydown', onKeyDown);

      cleanupListeners = () => {
        cleanupHeight();
        if (doc && doc.body) {
          doc.body.removeEventListener('mouseover', onMouseOver);
          doc.body.removeEventListener('mouseout', onMouseOut);
          doc.body.removeEventListener('click', onClick);
          doc.body.removeEventListener('dblclick', onDblClick);
          doc.body.removeEventListener('keydown', onKeyDown);
        }
      };
    };

    if (iframe.contentDocument && iframe.contentDocument.body) {
      handleLoad();
    }

    iframe.addEventListener('load', handleLoad);
    return () => {
      iframe.removeEventListener('load', handleLoad);
      if (cleanupListeners) {
        cleanupListeners();
      }
    };
    // lodLevel 必须在依赖内 (ISSUE-014)：L0 档位根本不渲染 iframe，
    // 从 L0 回到 L1/L2 时 React 挂载的是一个**全新的 iframe 元素**，
    // 而旧元素上的监听器随之消失。若不在此重新绑定，画框将永久失去
    // 点选/悬浮/行内编辑能力，表现为「点了没反应、检查器显示未选中任何元素」。
  }, [screen.htmlContent, screen.id, lodLevel, imported, viewportHeight]);

  // Synchronize selection & hover highlights inside iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;
    const doc = iframe.contentDocument;

    // Clear old classes
    doc.querySelectorAll('.aidesign-selected').forEach(el => el.classList.remove('aidesign-selected'));
    doc.querySelectorAll('.aidesign-hovered').forEach(el => el.classList.remove('aidesign-hovered'));

    if (isActive && selectedNid) {
      const selectedEl = doc.querySelector(`[data-nid="${selectedNid}"]`);
      if (selectedEl) selectedEl.classList.add('aidesign-selected');
    }

    if (isActive && hoveredNid && hoveredNid !== selectedNid) {
      const hoveredEl = doc.querySelector(`[data-nid="${hoveredNid}"]`);
      if (hoveredEl) hoveredEl.classList.add('aidesign-hovered');
    }
  }, [selectedNid, hoveredNid, isActive, lodLevel, screenOverrides]);

  // 按住画框顶栏拖动位置 (PRD §3.3.2)。世界坐标位移 = 屏幕位移 / 画板缩放比
  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isEditingName) return;
    e.stopPropagation(); // 避免触发画板自身的平移
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: screen.position.x,
      originY: screen.position.y
    };
    setIsDragging(true);

    // 用 getState 读取而非订阅 viewportTransform——订阅会让每次平移缩放
    // 都重渲染全部画框，直接抵消 LOD 调度的收益
    const scale = useProjectStore.getState().viewportTransform.scale || 1;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (ev.clientX - d.startX) / scale;
      const dy = (ev.clientY - d.startY) / scale;
      if (!moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return; // 容忍点击时的微小抖动
      moved = true;

      const rawX = Math.round(d.originX + dx);
      const rawY = Math.round(d.originY + dy);
      const store = useProjectStore.getState();

      const snapResult = calculateDragSnap(
        screen.id,
        { x: rawX, y: rawY },
        store.screens,
        store.settings.frameWidth
      );

      store.setSnapGuides(snapResult.guides);

      updateScreen(screen.id, {
        position: snapResult.snappedPosition
      });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const d = dragRef.current;
      dragRef.current = null;
      setIsDragging(false);

      useProjectStore.getState().clearSnapGuides();

      if (moved && d) {
        const store = useProjectStore.getState();
        const curScreen = store.screens[screen.id];
        if (curScreen && curScreen.position) {
          const layoutResult = resolveOverlapAfterManualMove({
            movedScreenId: screen.id,
            newPosition: curScreen.position,
            screens: store.screens,
            screenOrder: store.screenOrder,
            frameWidth: store.settings.frameWidth,
            viewportGuideHeight: store.settings.viewportGuideHeight
          });

          const positions: Record<string, { x: number; y: number }> = {};
          const originalPositions: Record<string, { x: number; y: number }> = {
            [screen.id]: { x: d.originX, y: d.originY }
          };

          // 被拖动画框最终坐标（可能经过左侧防重叠校正）
          positions[screen.id] = layoutResult.position;

          // 右侧受影响被推开的画框
          for (const s of layoutResult.shiftedScreens) {
            const orig = store.screens[s.id]?.position;
            if (orig) {
              positions[s.id] = { x: s.newX, y: orig.y };
              originalPositions[s.id] = orig;
            }
          }

          const hasShifted = layoutResult.shiftedScreens.length > 0;
          const label = hasShifted ? '移动画框并自动避让' : '移动画框';

          store.updateScreenPositions(positions, label, originalPositions);
        }
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // 截取当前画框上部分作为工程封面 (T-PCI-03)
  const handleSetAsCover = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCoverSetting) return;
    setIsCoverSetting(true);
    try {
      const dataUrl = await captureScreenSnippetAsDataUrl(screen, {
        frameWidth: settings.frameWidth,
        viewportHeight,
        useCustomNavigation: settings.useCustomNavigation,
        deviceProfile: settings.deviceProfile,
        tokensCss,
        baseCss: getBaseCss(settings.deviceProfile),
        screenOverrides,
        colorMode: settings.colorMode,
        targetWidth: 480,
        targetHeight: 240
      });
      setCoverImage(dataUrl);
      setCoverSetSuccess(true);
      setTimeout(() => setCoverSetSuccess(false), 1800);
    } catch (err) {
      console.error('[cover] 设置工程封面失败', err);
    } finally {
      setIsCoverSetting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      id={`screen-frame-${screen.id}`}
      data-testid={`screen-frame-${screen.id}`}
      data-comparison-focus={isStaged || isComparisonTarget ? 'true' : undefined}
      className="absolute select-none group"
      style={{
        left: `${screen.position.x}px`,
        top: `${screen.position.y}px`,
        width: `${frameWidth}px`,
        zIndex: isStaged || isComparisonTarget ? 30 : isComparisonBackground ? 0 : undefined
      }}
      onClick={() => setActiveScreen(screen.id)}
    >
      {/* 浮动在画框上方的纯净标题栏 (参考 Trae 风格，取消黑条无多余图标，仅激活时展示动作按钮) */}
      <div
        onMouseDown={handleTitleMouseDown}
        className={`min-h-[26px] mb-2 px-0.5 flex items-center justify-between text-xs select-none transition-colors ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        } ${
          isActive
            ? 'text-blue-400 font-semibold'
            : 'text-slate-300 hover:text-white font-medium'
        }`}
        title="按住拖动可调整画框位置"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2 flex-wrap">
          {isEditingName ? (
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={() => {
                setIsEditingName(false);
                if (nameInput.trim() && nameInput !== screen.name) {
                  renameScreen(screen.id, nameInput.trim());
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setIsEditingName(false);
                  if (nameInput.trim() && nameInput !== screen.name) {
                    renameScreen(screen.id, nameInput.trim());
                  }
                } else if (e.key === 'Escape') {
                  setIsEditingName(false);
                  setNameInput(screen.name);
                }
              }}
              className="border border-blue-500 rounded px-1.5 py-0.5 text-xs outline-none min-w-0 flex-1 max-w-[280px] bg-slate-900 text-white shadow-sm"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingName(true);
              }}
              className="cursor-pointer break-words max-w-full leading-snug tracking-wide"
              title={`${screen.name} (双击重命名)`}
            >
              {screen.name}
            </span>
          )}
          {isStaged && (
            <span className="bg-purple-900/60 text-purple-300 border border-purple-500/40 px-1.5 py-0.5 rounded text-[10px] flex-shrink-0">
              AI 新方案比选
            </span>
          )}
        </div>

        {/* 仅在激活的页面展示动作按钮 (Trae 规范) */}
        {!isStaged && isActive && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={handleSetAsCover}
              disabled={isCoverSetting}
              className={`p-1 rounded transition flex items-center gap-1 ${
                coverSetSuccess
                  ? 'text-emerald-400 bg-emerald-950/60'
                  : 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'
              }`}
              title={coverSetSuccess ? '已设为工程封面！' : '设为工程封面'}
              data-testid="set-as-cover-btn"
            >
              {coverSetSuccess ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                duplicateScreen(screen.id);
              }}
              className="p-1 rounded transition text-slate-400 hover:text-blue-400 hover:bg-slate-800"
              title="复制画框"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingName(true);
              }}
              className="p-1 rounded transition text-slate-400 hover:text-blue-400 hover:bg-slate-800"
              title="重命名画框"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`确定删除画框 "${screen.name}" 吗？此操作不可恢复。`)) {
                  removeScreen(screen.id);
                }
              }}
              className="p-1 rounded transition text-sm leading-none text-slate-400 hover:text-red-400 hover:bg-slate-800"
              title="删除画框"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* 原型画框卡片主体 (圆角无内嵌顶栏) */}
      {resourceError && <p role="alert" className="mb-2 rounded-lg border border-red-800 bg-red-950 p-2 text-xs text-red-200">{resourceError}</p>}
      <div
        className={`relative w-full overflow-hidden transition-shadow duration-200 ${
          isStaged
            ? 'ring-4 ring-purple-500 shadow-2xl rounded-2xl'
            : isActive
            ? 'ring-2 ring-blue-500 shadow-2xl rounded-2xl'
            : 'ring-1 ring-slate-800 hover:ring-slate-700 shadow-xl rounded-2xl'
        }`}
        style={{
          width: `${frameWidth}px`,
          height: `${measuredHeight}px`,
          background: frameBg
        }}
      >
        {lodLevel === 0 && screen.thumbnail ? (
          // L0 Bitmap Proxy (有缩略图时渲染)
          <img
            src={screen.thumbnail}
            alt={screen.name}
            className="w-full h-full object-cover block select-none pointer-events-none"
          />
        ) : lodLevel === 0 ? (
          // L0 降级占位（无缩略图且强制指定 L0 时）
          <div
            className="w-full h-full flex flex-col items-center justify-center text-sm font-mono select-none"
            style={{ background: frameBg, color: frameFg }}
          >
            <span>[L0 位图降级缩略视图]</span>
            <span className="text-xs opacity-70">{screen.name}</span>
          </div>
        ) : (
          // L1 (Frozen) or L2 (Active) Iframe: 保持完整高保真视觉渲染
          <iframe
            ref={iframeRef}
            srcDoc={fullSrcDoc}
            className="w-full h-full border-none block"
            style={{
              pointerEvents: lodLevel === 2 ? 'auto' : 'none'
            }}
            title={screen.name}
          />
        )}

        {/* Device Viewport Guide (D13): quiet auxiliary annotation */}
        {showGuide && guideHeight < measuredHeight && (
          <div
            className="absolute left-0 right-0 border-b border-dashed border-slate-400/20 pointer-events-none z-30 flex items-center justify-end px-3"
            style={{ top: `${guideHeight}px` }}
            data-testid="first-viewport-guide"
          >
            <span
              className="text-[9px] font-normal leading-none text-slate-500/55 bg-slate-950/35 px-1.5 py-1 rounded-sm backdrop-blur-[1px]"
              title={`首屏参考线 · ${viewport.reference.name} · ${guideHeight}px`}
            >
              首屏 · {guideHeight}px
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
