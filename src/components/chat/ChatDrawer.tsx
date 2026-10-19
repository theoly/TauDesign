import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { ModificationReviewCard } from './ModificationReviewCard';
import { useProjectStore } from '../../stores/useProjectStore';
import { useAIConfigStore } from '../../stores/useAIConfigStore';
import { supportsVision } from '../../services/ai/engine/core/multimodalGuard';
import { useQuickPromptsStore } from '../../stores/useQuickPromptsStore';
import {
  useAIEngineChat,
  parseReferencedElement,
  extractCleanUserPrompt
} from '../../services/ai/engine/react/useAIEngineChat';
import { useUsageStore, formatTokenCount } from '../../stores/useUsageStore';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Square,
  RotateCcw,
  BookmarkPlus,
  Palette,
  Check,
  Copy,
  AtSign,
  Image as ImageIcon,
  X,
  Brain,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  Pin,
  FileCode,
  ExternalLink,
  RefreshCw,
  Undo2,
  Zap,
  ArrowDown,
  Settings,
  Activity,
  Crosshair,
  ZoomIn,
  GitBranch
} from 'lucide-react';
import { LocateTarget } from '../../utils/tokenLint';
import {
  readUploadedTextFile,
  readTextPath,
  resolveTextReferences,
  validateTextReferences,
  MAX_TEXT_FILES_PER_TURN,
  type TextReference
} from '../../services/ai/textFileContext';

interface ChatDrawerProps {
  onOpenSettings?: (tab?: 'provider' | 'quick_prompts') => void;
}

interface ThinkingStep {
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'stopped' | 'error';
}

function getThinkingSteps(stage?: number, isGenerating?: boolean, isStopped?: boolean): ThinkingStep[] {
  const s = stage || 0;
  return [
    {
      title: '意图推理与多模态反推',
      description: '解析用户诉求与设计规范，提取关键组件与意图',
      status: s > 1 ? 'completed' : s === 1 ? (isStopped ? 'stopped' : 'active') : 'pending'
    },
    {
      title: '检索设计规范与工程约定',
      description: '匹配主题 Tokens (主色、字阶、间距) 与工程约定约束',
      status: s > 2 ? 'completed' : s === 2 ? (isStopped ? 'stopped' : 'active') : 'pending'
    },
    {
      title: '构建组件语义树与响应式布局',
      description: '规划画框容器结构与响应式视口',
      status: s > 3 ? 'completed' : s === 3 ? (isStopped ? 'stopped' : 'active') : 'pending'
    },
    {
      title: '高保真代码生成与画布同步',
      description: '流式编写高保真 HTML / CSS 样式并同步至设计画板...',
      status: s >= 4 && !isGenerating ? (isStopped ? 'stopped' : 'completed') : s >= 4 ? 'active' : 'pending'
    }
  ];
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({ onOpenSettings }) => {
  const [input, setInput] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ name: string; dataUrl: string } | null>(null);
  const [attachedTextFiles, setAttachedTextFiles] = useState<TextReference[]>([]);
  const [textFileError, setTextFileError] = useState<string | null>(null);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { globalPrompts } = useQuickPromptsStore();
  const projectPrompts = useProjectStore((state) => state.quickPrompts) || [];
  const allQuickPrompts = [...projectPrompts, ...globalPrompts];

  const handleInsertQuickPrompt = (content: string) => {
    setInput((prev) => {
      if (!prev.trim()) {
        return content;
      }
      return prev.endsWith(' ') || prev.endsWith('\n') ? `${prev}${content}` : `${prev} ${content}`;
    });
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<Record<string, boolean>>({});
  const [expandedCodeIds, setExpandedCodeIds] = useState<Record<string, boolean>>({});
  const [showUsageDetails, setShowUsageDetails] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!previewImageUrl) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewImageUrl(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImageUrl]);

  const {
    sessionCalls,
    sessionInputTokens,
    sessionOutputTokens,
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    activeRequests,
    lastRequest,
    resetSessionUsage
  } = useUsageStore();
  const currentUsage = Object.values(activeRequests).slice(-1)[0] || lastRequest;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const shouldAutoScrollRef = useRef(true);

  const toggleCodeExpand = (msgId: string) => {
    setExpandedCodeIds((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const {
    screens,
    settings,
    stagedScreen,
    activeScreenId,
    selectedNode,
    setActiveScreen,
    panToScreen,
    pendingNodeRef,
    clearPendingNodeRef,
    setPendingNodeRef,
    pendingAuditReport,
    clearPendingAuditReport
  } = useProjectStore();
  const { providers, bindings } = useAIConfigStore();
  const engine = useAIEngineChat();

  // 消息/附件异步恢复并渲染后再定位；不依赖消息条数，避免等长会话切换失效。
  useLayoutEffect(() => {
    if (!engine.restoredHistoryKey) return;
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    shouldAutoScrollRef.current = true;
    setIsAtBottom(true);
  }, [engine.restoredHistoryKey]);

  const latestReviewStatus = engine.messages[engine.messages.length - 1]?.modificationReview?.status;
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (el && shouldAutoScrollRef.current && (latestReviewStatus === 'ready' || latestReviewStatus === 'error')) {
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      setIsAtBottom(true);
    }
  }, [latestReviewStatus]);

  // 监听并接收来自属性面板等的「一键评测」推送报告
  useEffect(() => {
    if (pendingAuditReport) {
      engine.postAuditMessage(pendingAuditReport);
      clearPendingAuditReport();
    }
  }, [pendingAuditReport, clearPendingAuditReport, engine]);

  // 定位评测目标（单元素/最小包含父区块/整页，联动视口平移聚焦）
  const handleLocateAuditTarget = (target: LocateTarget) => {
    useProjectStore.getState().panToScreen(target.screenId);
    if (target.type === 'element' || target.type === 'block') {
      if (target.nid) {
        useProjectStore.getState().selectNodeByNid(target.screenId, target.nid);
      }
    } else {
      useProjectStore.getState().selectNode(null);
    }
  };

  const activeCodeProv = providers.find((p) => p.id === bindings.code.providerId);
  const activeVisionProv = providers.find((p) => p.id === bindings.vision.providerId);
  const codeSupportsVision = supportsVision(activeCodeProv, bindings.code.modelId);
  const visionReady = Boolean(activeVisionProv && (activeVisionProv.apiKey || activeVisionProv.protocol === 'ollama_native'));

  const activeScreen = activeScreenId ? screens[activeScreenId] : null;

  // 页面与元素引用状态（默认非启用，点击页面不自动引用）
  const [isPageReferenced, setIsPageReferenced] = useState(false);
  const [isElementReferenced, setIsElementReferenced] = useState(false);

  // 画布切换选中画框时，重置引用状态为非启用，并清理孤立元素引用
  const prevActiveScreenIdRef = useRef<string | null>(activeScreenId);
  useEffect(() => {
    if (prevActiveScreenIdRef.current !== activeScreenId) {
      prevActiveScreenIdRef.current = activeScreenId;
      setIsPageReferenced(false);
      setIsElementReferenced(false);
      if (pendingNodeRef) {
        clearPendingNodeRef();
      }
    }
  }, [activeScreenId, pendingNodeRef, clearPendingNodeRef]);

  // 当外部设置 pendingNodeRef（如属性面板添加到对话）时，自动同步点亮元素与页面引用
  useEffect(() => {
    if (pendingNodeRef) {
      setIsElementReferenced(true);
      setIsPageReferenced(true);
    }
  }, [pendingNodeRef]);

  // 当 pendingNodeRef 被清除时，同步关闭元素引用
  useEffect(() => {
    if (!pendingNodeRef && isElementReferenced) {
      setIsElementReferenced(false);
    }
  }, [pendingNodeRef, isElementReferenced]);

  // 切换页面引用状态
  const handleTogglePageRef = () => {
    if (!activeScreen) return;
    setIsPageReferenced((prev) => {
      const next = !prev;
      // 若关闭页面引用，一并关闭元素引用
      if (!next && isElementReferenced) {
        setIsElementReferenced(false);
        clearPendingNodeRef();
      }
      return next;
    });
  };

  // 切换元素引用状态
  const handleToggleElementRef = () => {
    if (!selectedNode || !activeScreen) return;
    if (isElementReferenced) {
      setIsElementReferenced(false);
      clearPendingNodeRef();
    } else {
      const parser = new DOMParser();
      const doc = parser.parseFromString(activeScreen.htmlContent, 'text/html');
      const el = doc.querySelector(`[data-nid="${selectedNode.nid}"]`);
      const raw = el?.outerHTML ?? `<${selectedNode.tagName}>`;
      const htmlSnippet = raw.length > 300 ? raw.slice(0, 300) + '…' : raw;
      setPendingNodeRef({
        screenId: selectedNode.screenId,
        screenName: activeScreen.name,
        nid: selectedNode.nid,
        tagName: selectedNode.tagName,
        htmlSnippet
      });
      setIsElementReferenced(true);
      setIsPageReferenced(true);
    }
  };

  const handleDisableElementRef = () => {
    setIsElementReferenced(false);
    clearPendingNodeRef();
  };

  const addTextFiles = async (files: File[], source: 'upload' | 'paste') => {
    setIsReadingFiles(true);
    setTextFileError(null);
    try {
      if (attachedTextFiles.length + files.length > MAX_TEXT_FILES_PER_TURN) {
        throw new Error(`每轮最多读取 ${MAX_TEXT_FILES_PER_TURN} 个文本文件`);
      }
      const incoming: TextReference[] = [];
      for (const file of files) incoming.push(await readUploadedTextFile(file, source));
      const combined = [...attachedTextFiles];
      for (const item of incoming) {
        if (!combined.some((existing) => existing.name === item.name && existing.content === item.content)) {
          combined.push(item);
        }
      }
      validateTextReferences(combined);
      setAttachedTextFiles(combined);
    } catch (error) {
      setTextFileError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsReadingFiles(false);
    }
  };

  // 剪切板图片与文本文件；普通文本由 textarea 的浏览器默认行为粘贴。
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || []);
    const files = Array.from(e.clipboardData?.files || []);
    if (items.length === 0 && files.length === 0) return;

    const imageFromItem = items.find((item) => item.type.startsWith('image/') && item.getAsFile());
    const imageFile = imageFromItem?.getAsFile() || files.find((file) => file.type.startsWith('image/'));
    if (imageFile) {
      e.preventDefault();
      e.stopPropagation?.();
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          const ext = imageFile.type.split('/')[1] || 'png';
          const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
          const fileName = imageFile.name && imageFile.name !== 'image.png' ? imageFile.name : `剪切板截图_${timeStr}.${ext}`;
          setAttachedImage({ name: fileName, dataUrl: ev.target.result as string });
        }
      };
      reader.readAsDataURL(imageFile);
    }
    const textItems = items
      .filter((item) => item.kind === 'file' && !item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const textFiles = textItems.length > 0 ? textItems : files.filter((file) => !file.type.startsWith('image/'));
    if (textFiles.length > 0) {
      e.preventDefault();
      e.stopPropagation?.();
      void addTextFiles(textFiles, 'paste');
    }
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.endsWith('@')) {
      setShowMentionMenu(true);
    } else if (!val.includes('@')) {
      setShowMentionMenu(false);
    }
  };

  const handleInsertMention = (screenName: string) => {
    setInput((prev) => prev.replace(/@$/, `@${screenName} `));
    setShowMentionMenu(false);
  };

  const toggleThinkingExpand = (msgId: string) => {
    setExpandedThinkingIds((prev) => {
      const current = prev[msgId] !== undefined ? prev[msgId] : false;
      return {
        ...prev,
        [msgId]: !current
      };
    });
  };

  const handleStopGenerating = () => {
    engine.abort();
  };

  const handleSendMessage = async (rawPrompt?: string) => {
    let textToSend = rawPrompt || input.trim() ||
      (attachedTextFiles.length > 0 ? '请根据附加文本资料完成本轮设计需求。' : attachedImage ? '请根据参考图片生成页面。' : '');
    if (!textToSend || engine.isGenerating || isReadingFiles) return;

    let textReferences: TextReference[];
    setTextFileError(null);
    setIsReadingFiles(true);
    try {
      const { id, folderPath } = useProjectStore.getState();
      textReferences = await resolveTextReferences(
        textToSend,
        attachedTextFiles,
        (path) => readTextPath(path, id, folderPath)
      );
    } catch (error) {
      setTextFileError(error instanceof Error ? error.message : String(error));
      setIsReadingFiles(false);
      return;
    }
    setIsReadingFiles(false);

    // 注入元素引用上下文（仅当元素引用启用时）
    const nodeRef = isElementReferenced ? pendingNodeRef : null;
    if (nodeRef) {
      textToSend =
        `[引用元素 nid="${nodeRef.nid}" 画框="${nodeRef.screenName}" 标签=<${nodeRef.tagName}>]\n` +
        `元素片段:\n${nodeRef.htmlSnippet}\n\n` +
        textToSend;
    }

    setInput('');
    const currentAttachment = attachedImage
      ? { name: attachedImage.name, dataUrl: attachedImage.dataUrl }
      : undefined;
    setAttachedImage(null);
    setAttachedTextFiles([]);

    // 清除元素引用（单次修改后不保留）
    if (pendingNodeRef) {
      clearPendingNodeRef();
      setIsElementReferenced(false);
    }

    // 发送新消息时重置自动跟随并滚到底部
    shouldAutoScrollRef.current = true;
    setIsAtBottom(true);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }, 50);

    // 引用与否只由用户显式操作决定：开关点亮 / @提及 / 元素引用。
    // 「命中修改词就偷偷把活跃画框当引用」是误改现有页面的根源，已移除 (BR-GT-02)。
    const referencedScreenId = isPageReferenced ? activeScreenId : null;

    const referencedElementInfo = nodeRef
      ? {
          nid: nodeRef.nid,
          tagName: nodeRef.tagName,
          screenName: nodeRef.screenName
        }
      : undefined;

    await engine.sendMessage(textToSend, currentAttachment, {
      referencedScreenId,
      // 活跃画框单独传递：仅当用户明确说「修改」时才作为落点 (BR-GT-03)
      activeScreenId,
      referencedElement: referencedElementInfo,
      displayText: rawPrompt || input.trim(),
      textReferences
    });
  };

  const activeGeneratingMsg = engine.messages.find((m) => m.isGenerating);
  const activeStreamText = activeGeneratingMsg?.text || '';
  let streamingArtifactStatus: string | null = null;
  if (engine.isGenerating) {
    if (activeStreamText.includes('</artifact>')) {
      streamingArtifactStatus = '构筑完成，正在执行结构守卫与安全规则验证';
    } else if (activeStreamText.includes('<artifact')) {
      streamingArtifactStatus = '正在构筑页面结构...';
    }
  }

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current?.scrollIntoView) {
      messagesEndRef.current.scrollIntoView({ behavior });
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
    shouldAutoScrollRef.current = true;
    setIsAtBottom(true);
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 35;
    setIsAtBottom(atBottom);
    if (atBottom) {
      shouldAutoScrollRef.current = true;
    } else {
      shouldAutoScrollRef.current = false;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // 向上滑动滚轮时，立即打断自动跟随
    if (e.deltaY < 0) {
      shouldAutoScrollRef.current = false;
    }
  };

  // 仅在 AI 输出时才自动滚动到底部；若用户向上滚动取消跟随则暂停滚动
  useEffect(() => {
    if (engine.isGenerating) {
      shouldAutoScrollRef.current = true;
      setIsAtBottom(true);
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [engine.isGenerating]);

  useEffect(() => {
    if (engine.isGenerating && shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [activeStreamText]);

  return (
    <div className="w-[340px] shrink-0 h-full bg-slate-900 border-r border-slate-800 flex flex-col z-20 select-text">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200 flex-shrink-0">
            <Bot className="w-4 h-4 text-blue-400" />
            <span>AI 原生助手</span>
          </div>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono truncate max-w-[100px]"
            title={`当前主力模型: ${activeCodeProv?.name || 'DeepSeek'} (${bindings.code.modelId})`}
          >
            {bindings.code.modelId}
          </span>
        </div>
        <button onClick={() => onOpenSettings?.('provider')} className="text-blue-400 hover:underline text-[11px] flex-shrink-0">
          Provider 配置
        </button>
      </div>

      {/* Token Usage Stats Bar */}
      <div className="px-3 py-1.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
        <button
          type="button"
          onClick={() => setShowUsageDetails(!showUsageDetails)}
          className="flex items-center gap-1 hover:text-slate-200 transition cursor-pointer"
          title="点击查看 Token 消耗明细与历史总计"
        >
          <Zap className="w-3 h-3 text-amber-400 shrink-0" />
          <span>本轮: <strong className="text-slate-200 font-mono font-medium">{formatTokenCount(sessionInputTokens + sessionOutputTokens)}</strong></span>
          <span className="text-slate-700">·</span>
          <span>历史: <strong className="text-slate-300 font-mono font-medium">{formatTokenCount(totalInputTokens + totalOutputTokens)}</strong></span>
          <ChevronDown className={`w-3 h-3 transition-transform ${showUsageDetails ? 'rotate-180 text-blue-400' : 'text-slate-500'}`} />
        </button>
        {sessionCalls > 0 && (
          <button
            type="button"
            onClick={resetSessionUsage}
            className="text-slate-500 hover:text-slate-300 transition text-[9px] cursor-pointer"
            title="重置本轮会话计数"
          >
            重置本轮
          </button>
        )}
      </div>

      {/* Token Usage Details Dropdown */}
      {currentUsage && (
        <div className="px-3 py-1 bg-slate-950/70 border-b border-slate-800/80 flex items-center gap-1.5 text-[10px] text-slate-400" aria-live="polite">
          <Zap className="w-3 h-3 text-amber-400 shrink-0" />
          <span>{currentUsage.status === 'running' ? '本次请求' : '最近请求'}:</span>
          <strong className="font-mono text-slate-200">{formatTokenCount(currentUsage.inputTokens + currentUsage.outputTokens)}</strong>
          <span className="text-slate-500">入 {formatTokenCount(currentUsage.inputTokens)} / 出 {formatTokenCount(currentUsage.outputTokens)}</span>
          <span className="ml-auto shrink-0 text-amber-300/80">
            {currentUsage.source === 'provider' ? '实际' : currentUsage.source === 'unknown' ? '未知' : '估算'}
          </span>
        </div>
      )}
      {showUsageDetails && (
        <div className="p-3 bg-slate-950 border-b border-slate-800 space-y-2 text-[11px] select-text">
          <div className="flex items-center justify-between font-medium text-slate-300">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Token 消耗明细</span>
            </div>
            <button
              onClick={() => setShowUsageDetails(false)}
              className="text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {/* 本轮会话 */}
            <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800 space-y-1">
              <div className="text-slate-400 font-medium">本轮会话</div>
              <div className="text-sm font-semibold font-mono text-amber-300">
                {formatTokenCount(sessionInputTokens + sessionOutputTokens)}
              </div>
              <div className="text-slate-500 flex justify-between pt-0.5">
                <span>入: {formatTokenCount(sessionInputTokens)}</span>
                <span>出: {formatTokenCount(sessionOutputTokens)}</span>
              </div>
              <div className="text-slate-500 text-[9px]">调用: {sessionCalls} 次</div>
            </div>

            {/* 历史累计 */}
            <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800 space-y-1">
              <div className="text-slate-400 font-medium">历史累计</div>
              <div className="text-sm font-semibold font-mono text-blue-300">
                {formatTokenCount(totalInputTokens + totalOutputTokens)}
              </div>
              <div className="text-slate-500 flex justify-between pt-0.5">
                <span>入: {formatTokenCount(totalInputTokens)}</span>
                <span>出: {formatTokenCount(totalOutputTokens)}</span>
              </div>
              <div className="text-slate-500 text-[9px]">调用: {totalCalls} 次</div>
            </div>
          </div>
        </div>
      )}

      {/* Streaming Artifact Status Badge (REQ-OD-01 / T-OD-17 / CHK-OD-21) */}
      {streamingArtifactStatus && (
        <div className="px-3 py-1.5 bg-blue-950/80 border-b border-blue-800/60 flex items-center gap-2 text-[11px] text-blue-300 font-medium animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 flex-shrink-0" />
          <span className="truncate">{streamingArtifactStatus}</span>
        </div>
      )}

      {/* Message List Container & Scroll Control */}
      <div className="flex-1 relative min-h-0 flex flex-col">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onLoadCapture={() => {
            // 历史图片解码后可能撑高列表；用户正在读旧消息时不抢回底部。
            const el = scrollContainerRef.current;
            if (el && shouldAutoScrollRef.current) {
              el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
            }
          }}
          className="flex-1 overflow-y-auto p-4 space-y-4 text-xs"
        >
        {/* Side-by-Side Floating / Inline Bar (D17) */}
        {stagedScreen && (
          <div className="p-3 bg-purple-950/50 border border-purple-800/60 rounded-xl space-y-2 text-purple-200 shadow-md">
            <div className="flex items-center justify-between gap-1 border-b border-purple-900/40 pb-2">
              <div className="flex items-center gap-1.5 font-semibold text-[11px] text-purple-200 min-w-0">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping shrink-0" />
                <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">AI 新方案候选已就绪</span>
              </div>
              <span className="shrink-0 text-[10px] font-medium text-purple-300 bg-purple-900/70 border border-purple-700/60 px-2 py-0.5 rounded-full whitespace-nowrap">
                并排比选中
              </span>
            </div>
            <p className="text-[11px] text-purple-300/90 leading-relaxed">
              新方案已在右侧画框并排就绪，针对「{screens[stagedScreen.targetScreenId]?.name || '目标画框'}」请观测对比并选择：
            </p>
            <div className="space-y-1.5 pt-0.5">
              <button
                type="button"
                onClick={engine.adoptCandidate}
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-blue-900/30 transition cursor-pointer whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
                <span>采纳新版 (替换原版)</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={engine.keepBothCandidates}
                  className="w-full px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 border border-slate-700/70 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer whitespace-nowrap"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>两版都留</span>
                </button>
                <button
                  type="button"
                  onClick={engine.discardCandidate}
                  className="w-full px-2.5 py-1.5 bg-slate-900/60 hover:bg-red-950/40 text-slate-400 hover:text-red-300 border border-slate-800 hover:border-red-900/50 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-400 shrink-0" />
                  <span>保留原版</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Structure Guard Interception Alert (ISSUE-011) */}
        {engine.lastGuardOutput && (
          <div className="p-3 bg-amber-950/50 border border-amber-800/60 rounded-xl space-y-2 text-amber-200 shadow-md">
            <div className="flex items-center gap-1.5 font-semibold text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>结构守卫拦截保护 (ISSUE-011)</span>
            </div>
            <p className="text-[11px] text-amber-300/90 leading-relaxed">
              检测到新生成的画框存在关键结构变更或删除。若确认本次调整属于重构，可点击放行。
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => engine.forceApply()}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg text-[10px] transition"
              >
                强制并排放行应用
              </button>
            </div>
          </div>
        )}

        {engine.messages.map((m) => {
          const isCurrentGenerating = engine.isGenerating && m.isGenerating;
          const isExpanded = expandedThinkingIds[m.id] !== undefined
            ? expandedThinkingIds[m.id]
            : isCurrentGenerating;
          const thinkingSteps = getThinkingSteps(m.thinkingStage, m.isGenerating, m.isStopped);

          return (
            <div key={m.id} className="space-y-2">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                {m.sender === 'user' ? (
                  <>
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>您</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>TauDesign</span>
                  </>
                )}
              </div>

              {/* Collapsible Thinking & Feedback Accordion (PRD §3.2) */}
              {m.sender === 'assistant' && (m.thinkingStage !== undefined && m.thinkingStage > 0) && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden text-xs transition-all shadow-sm">
                  {/* Summary Header */}
                  <button
                    type="button"
                    onClick={() => toggleThinkingExpand(m.id)}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-900/80 transition text-left cursor-pointer group select-none"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                        {isCurrentGenerating ? (
                          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                        ) : m.isStopped ? (
                          <Square className="w-2.5 h-2.5 text-amber-400 fill-current" />
                        ) : (
                          <Brain className="w-3 h-3 text-blue-400" />
                        )}
                      </div>

                      <div className="flex items-center gap-2 truncate">
                        <span className="font-semibold text-slate-200 text-[11px]">
                          {isCurrentGenerating
                            ? 'AI 正在深度推理与规划...'
                            : m.isStopped
                            ? 'AI 思考过程 (已中止)'
                            : 'AI 思考与反馈过程'}
                        </span>
                        {m.elapsedSeconds !== undefined && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {m.elapsedSeconds}s
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-slate-500 group-hover:text-slate-300 transition flex-shrink-0">
                      <span className="text-[10px]">
                        {isExpanded ? '收起' : '展开'}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </button>

                  {/* Collapsed Brief Preview */}
                  {!isExpanded && (
                    <div className="px-3 pb-2 pt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400 overflow-hidden">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                      <span className="truncate">
                        {m.text ? '已完成设计推理并输出结果' : '正在规划布局与 Design Tokens...'}
                      </span>
                    </div>
                  )}

                  {/* Expanded Detailed Steps & Feedback */}
                  {isExpanded && (
                    <div className="p-3 pt-1 border-t border-slate-800/80 space-y-2.5 bg-slate-900/40">
                      <div className="space-y-2">
                        {thinkingSteps.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-[11px]">
                            <div className="mt-0.5 flex-shrink-0">
                              {step.status === 'completed' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              ) : step.status === 'active' ? (
                                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                              ) : step.status === 'stopped' ? (
                                <Square className="w-3.5 h-3.5 text-amber-400 fill-current" />
                              ) : step.status === 'error' ? (
                                <XCircle className="w-3.5 h-3.5 text-red-400" />
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full border border-slate-700 flex items-center justify-center text-[9px] text-slate-600">
                                  {idx + 1}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span
                                className={`font-medium block ${
                                  step.status === 'completed'
                                    ? 'text-slate-300'
                                    : step.status === 'active'
                                    ? 'text-blue-300'
                                    : step.status === 'stopped'
                                    ? 'text-amber-300'
                                    : step.status === 'error'
                                    ? 'text-red-300'
                                    : 'text-slate-500'
                                }`}
                              >
                                {step.title}
                              </span>
                              <p className="text-[10px] text-slate-500 leading-normal mt-0.5">
                                {step.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Feedback Badges */}
                      <div className="pt-2 border-t border-slate-800/60 flex flex-wrap gap-1.5 text-[10px]">
                        {m.checkpointId && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                            快照: #{m.checkpointId.slice(0, 12)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Token 变更提案卡片 (T-AE-25 / T-AE-34) */}
              {m.pendingProposal && (
                <div className="p-3 bg-sky-950/40 border border-sky-800/50 rounded-xl space-y-2 text-sky-200">
                  <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                    <Palette className="w-3.5 h-3.5 text-sky-400" />
                    <span>识别到设计 Token 调整诉求</span>
                  </div>
                  <p className="text-[11px] text-sky-300/90 leading-relaxed">{m.pendingProposal.label || 'Token 预设调整'}</p>
                  {m.pendingProposal.resolved ? (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 pt-1">
                      <Check className="w-3 h-3" />
                      <span>
                        {m.pendingProposal.resolved === 'applied'
                          ? '已应用至全工程，所有画框实时联动（可撤销）'
                          : m.pendingProposal.resolved === 'once'
                          ? '仅本次生效，工程设计系统未改动'
                          : '已忽略'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        onClick={() => engine.resolveProposal(m.id, 'applied')}
                        className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg text-[10px] transition"
                      >
                        应用到全工程
                      </button>
                      <button
                        onClick={() => engine.resolveProposal(m.id, 'once')}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] transition"
                      >
                        仅本次
                      </button>
                      <button
                        onClick={() => engine.resolveProposal(m.id, 'ignored')}
                        className="px-2 py-1 text-slate-400 hover:text-slate-200 text-[10px] transition"
                      >
                        忽略
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Candidate Decision Confirmation Card (PRD D20 / §3.2.8) */}
              {m.candidateDecision && (
                <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl space-y-2 text-amber-200">
                  <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                    <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
                    <span>自动提取候选设计约定 (D20)</span>
                  </div>
                  <p className="text-[11px] text-amber-300/90 leading-relaxed">
                    “{m.candidateDecision}”
                  </p>
                  {m.decisionConfirmed ? (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 pt-1">
                      <Check className="w-3 h-3" />
                      <span>已永久沉淀为工程设计约定，未来生成将自动遵从</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => engine.confirmDecision(m.id, m.candidateDecision!)}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg text-[10px] transition"
                      >
                        沉淀为工程约定
                      </button>
                      <button
                        onClick={() => engine.dismissDecision(m.id)}
                        className="text-slate-400 hover:text-slate-200 text-[10px]"
                      >
                        忽略
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 设计取舍披露卡片 (doc/feature/deviation-note/spec.md) */}
              {m.deviationNote && (
                <div className="p-3 bg-violet-950/40 border border-violet-800/50 rounded-xl space-y-2 text-violet-200">
                  <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                    <GitBranch className="w-3.5 h-3.5 text-violet-400" />
                    <span>检测到设计取舍</span>
                  </div>
                  <p className="text-[11px] text-violet-300/90 leading-relaxed">{m.deviationNote.conflict}</p>
                  <p className="text-[11px] text-violet-300/70 leading-relaxed">当前方案：{m.deviationNote.chosen}</p>
                  {m.deviationChoice ? (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 pt-1">
                      <Check className="w-3 h-3" />
                      <span>{m.deviationChoice === 'switch' ? '已把参考图方案指令填入输入框，可编辑后发送' : '已保持当前方案'}</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        onClick={() => engine.resolveDeviationChoice(m.id, 'keep')}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] transition"
                      >
                        保持当前方案
                      </button>
                      <button
                        onClick={() => {
                          engine.resolveDeviationChoice(m.id, 'switch');
                          handleInsertQuickPrompt(m.deviationNote!.alternativeInstruction);
                        }}
                        className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg text-[10px] transition"
                      >
                        换成参考图方案（{m.deviationNote.alternative}）
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Token 规范评测报告卡片 (Audit Report Card) */}
              {m.auditReport && (
                <div
                  data-testid="audit-report-card"
                  className="p-3 bg-slate-900 border border-slate-700/80 rounded-xl space-y-2.5 text-xs shadow-md"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                      <Activity className="w-4 h-4 text-amber-400" />
                      <span>Token 规范评测报告</span>
                      <span className="text-slate-400 font-normal">(@{m.auditReport.screenName})</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                        m.auditReport.complianceRate >= 95
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                          : 'bg-amber-950 text-amber-300 border border-amber-800/60'
                      }`}
                    >
                      合规度 {m.auditReport.complianceRate}%
                    </span>
                  </div>

                  {/* 进度条 */}
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        m.auditReport.complianceRate >= 95 ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${m.auditReport.complianceRate}%` }}
                    />
                  </div>

                  {/* 一键定位目标操作栏 (如一个页面有多个元素则只定位该页面或包含多个元素的父区块) */}
                  <div className="pt-0.5">
                    <button
                      type="button"
                      data-testid="locate-audit-target-btn"
                      onClick={() => handleLocateAuditTarget(m.auditReport!.targetToLocate)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 hover:border-blue-400/60 rounded-lg text-blue-300 transition text-[11px] group cursor-pointer"
                      title="点击在画布中定位目标元素/父区块/页面"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <Crosshair className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform flex-shrink-0" />
                        <span className="font-medium truncate">{m.auditReport.targetToLocate.label}</span>
                      </div>
                      <span className="text-[10px] text-blue-400/90 font-mono ml-2 flex-shrink-0">点击定位 →</span>
                    </button>
                  </div>

                  {/* 待优化逃逸点列表 (展示但不要主动修复) */}
                  {m.auditReport.issues.length > 0 ? (
                    <div className="space-y-1.5 pt-1 border-t border-slate-800">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>待优化逃逸清单 ({m.auditReport.issues.length} 处)</span>
                        <span className="text-[10px] text-slate-500">（已禁用自动修复，请核实后微调）</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                        {m.auditReport.issues.map((issue, idx) => (
                          <div
                            key={idx}
                            onClick={() => handleLocateAuditTarget(m.auditReport!.targetToLocate)}
                            className="p-2 bg-slate-950/70 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 rounded-lg text-[11px] space-y-1 cursor-pointer transition"
                            title="点击定位包含该问题的区域"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-4 h-4 rounded-full bg-amber-500/10 text-amber-400 font-mono text-[10px] flex items-center justify-center flex-shrink-0">
                                  {idx + 1}
                                </span>
                                <span className="text-slate-300 font-medium truncate">{issue.description}</span>
                              </div>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono flex-shrink-0">
                                &lt;{issue.tagName}&gt; #{issue.nid.slice(0, 6)}
                              </span>
                            </div>
                            {issue.rawSnippet && (
                              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono bg-slate-900/80 px-1.5 py-0.5 rounded truncate">
                                <span className="text-red-400 flex-shrink-0">逃逸值:</span>
                                <span className="truncate">{issue.rawSnippet}</span>
                                {issue.suggestedFix && (
                                  <>
                                    <span className="text-slate-600 flex-shrink-0">→</span>
                                    <span className="text-emerald-400 truncate">{issue.suggestedFix}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 bg-emerald-950/30 border border-emerald-800/40 rounded-lg text-emerald-300 text-[11px] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span>当前画框规范度 100%，所有类名与样式完全符合设计系统标准！</span>
                    </div>
                  )}
                </div>
              )}

              {m.sender === 'assistant' && m.imageUrl && (
                <div
                  onClick={() => setPreviewImageUrl(m.imageUrl!)}
                  className="mb-2 max-w-[220px] rounded-lg overflow-hidden border border-slate-700 shadow-md cursor-pointer group relative"
                  title="点击放大查看"
                >
                  <img src={m.imageUrl} alt="Reference Screenshot" className="w-full h-auto object-cover transition duration-200 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-[11px] text-white font-medium backdrop-blur-[1px]">
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>点击放大</span>
                  </div>
                </div>
              )}

              {m.modificationReview && <ModificationReviewCard review={m.modificationReview} disabled={engine.isGenerating}
                onConfirm={(selected, extra, mode) => engine.confirmModification(m.id, selected, extra, mode)}
                onCancel={() => engine.cancelModification(m.id)} onRetry={() => engine.retryModificationAnalysis(m.id)} />}

              {/* Text / Result Bubble */}
              {(m.text || m.htmlOutput || m.isStopped || isCurrentGenerating) && (
                <div
                  className={`p-3 rounded-xl leading-relaxed whitespace-pre-wrap break-words max-h-72 overflow-y-auto ${
                    m.sender === 'user'
                      ? 'bg-blue-600 text-white ml-4 shadow-sm'
                      : 'bg-slate-800 text-slate-200 mr-2 border border-slate-700/60'
                  }`}
                >
                  {m.sender === 'user' ? (
                    (() => {
                      const refElem = m.referencedElement || parseReferencedElement(m.text);
                      const displayPrompt = m.displayText || extractCleanUserPrompt(m.text);
                      return (
                        <div className="space-y-2">
                          {refElem ? (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-700/80 border border-blue-400/40 rounded-lg text-[11px] text-blue-100 font-medium select-none shadow-xs">
                              <Pin className="w-3 h-3 text-blue-200 flex-shrink-0" />
                              <span>
                                引用元素: <code className="font-mono bg-blue-800/90 px-1 py-0.5 rounded text-blue-100 font-semibold">{'<'}{refElem.tagName}#{refElem.nid}{'>'}</code>
                              </span>
                              {refElem.screenName && (
                                <span className="text-blue-200/80 text-[10px]">(@{refElem.screenName})</span>
                              )}
                            </div>
                          ) : m.referencedScreen ? (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-700/80 border border-blue-400/40 rounded-lg text-[11px] text-blue-100 font-medium select-none shadow-xs">
                              <AtSign className="w-3 h-3 text-blue-200 flex-shrink-0" />
                              {m.referencedScreen.viaActiveScreen ? (
                                <span>作用于当前画框: <span className="font-semibold text-white">{m.referencedScreen.name}</span></span>
                              ) : (
                                <span>引用画框: <span className="font-semibold text-white">@{m.referencedScreen.name}</span></span>
                              )}
                            </div>
                          ) : null}

                          {/* 附件图片缩略图，点击可放大 */}
                          {m.imageUrl && (
                            <div
                              onClick={() => setPreviewImageUrl(m.imageUrl!)}
                              className="relative group cursor-pointer overflow-hidden rounded-lg border border-blue-400/40 max-w-[210px] max-h-[140px] bg-blue-950/50 shadow-xs hover:border-blue-300 transition"
                              title="点击放大查看原图"
                            >
                              <img
                                src={m.imageUrl}
                                alt="附件参考图"
                                className="w-full h-auto max-h-[140px] object-cover transition duration-200 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-[11px] text-white font-medium backdrop-blur-[1px]">
                                <ZoomIn className="w-3.5 h-3.5" />
                                <span>点击放大</span>
                              </div>
                            </div>
                          )}

                          {m.textFileNames?.map((name, index) => (
                            <div key={`${name}-${index}`} className="inline-flex items-center gap-1.5 px-2 py-1 mr-1 rounded-lg border border-blue-300/40 bg-blue-700/60 text-[11px] text-blue-50 max-w-full">
                              <FileCode className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate" title={name}>{name}</span>
                            </div>
                          ))}

                          <div className="text-sm leading-relaxed text-white select-text">{displayPrompt}</div>
                        </div>
                      );
                    })()
                  ) : m.isStopped ? (
                    <div className="flex items-center gap-1.5 text-amber-300 text-xs">
                      <Square className="w-3.5 h-3.5 flex-shrink-0 fill-current" />
                      <span>{m.text || '本次生成已由用户手动停止。'}</span>
                    </div>
                  ) : isCurrentGenerating && !m.text ? (
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                      <span>正在分析设计规范并流式编写页面代码...</span>
                    </div>
                  ) : m.htmlOutput ? (
                    (() => {
                      const mountedScreenId =
                        (m.screenId && screens[m.screenId] ? m.screenId : undefined) ||
                        Object.keys(screens).find((sid) => screens[sid]?.htmlContent === m.htmlOutput);
                      const isMounted = Boolean(mountedScreenId);
                      const isModified = m.toolAction === 'modified' || m.toolAction === 'patched';
                      const displayTitle = m.screenName || (mountedScreenId ? screens[mountedScreenId]?.name : '画框');

                      const isStagedNow = Boolean(
                        stagedScreen &&
                          (stagedScreen.targetScreenId === m.screenId ||
                            stagedScreen.newHtml === m.htmlOutput ||
                            stagedScreen.targetScreenId === m.preActionSnapshot?.screenId)
                      );

                      return (
                        <div className="space-y-2">
                          {isStagedNow ? (
                            <div className="space-y-2 p-2.5 bg-purple-950/40 border border-purple-800/60 rounded-xl text-purple-200 shadow-sm">
                              <div className="flex items-center justify-between gap-1 border-b border-purple-900/40 pb-2">
                                <div className="flex items-center gap-1.5 font-semibold text-[11px] text-purple-200 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping shrink-0" />
                                  <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                  <span className="truncate">
                                    {m.isGuardRejected
                                      ? '结构守卫已拦截本次覆盖'
                                      : 'AI 新方案候选已就绪'}
                                  </span>
                                </div>
                                <span className="shrink-0 text-[10px] font-medium text-purple-300 bg-purple-900/70 border border-purple-700/60 px-2 py-0.5 rounded-full whitespace-nowrap">
                                  并排比选中
                                </span>
                              </div>
                              {m.isGuardRejected && (
                                <div className="text-[11px] text-amber-300/90 leading-relaxed bg-amber-950/40 border border-amber-800/50 p-2 rounded-lg flex items-start gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                  <span>⚠️ 结构守卫提醒：检测到节点变动较大，已在右侧呈现新方案供直观对比观测。</span>
                                </div>
                              )}
                              <p className="text-[11px] text-purple-300/90 leading-relaxed">
                                新方案已在右侧画框并排就绪，针对「{displayTitle}」请观测对比并选择：
                              </p>
                              <div className="space-y-1.5 pt-0.5">
                                <button
                                  type="button"
                                  onClick={engine.adoptCandidate}
                                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-blue-900/30 transition cursor-pointer whitespace-nowrap active:scale-[0.98]"
                                >
                                  <Check className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
                                  <span>
                                    {m.isGuardRejected
                                      ? '强制放行并覆盖更新原画框'
                                      : '采纳新版 (替换原版)'}
                                  </span>
                                </button>
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={engine.keepBothCandidates}
                                    className="w-full px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 border border-slate-700/70 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer whitespace-nowrap active:scale-[0.98]"
                                    title="保留原画框，同时将新方案作为新画框添加到画板"
                                  >
                                    <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>两版都留</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={engine.discardCandidate}
                                    className="w-full px-2.5 py-1.5 bg-slate-900/60 hover:bg-red-950/40 text-slate-400 hover:text-red-300 border border-slate-800 hover:border-red-900/50 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap active:scale-[0.98]"
                                    title="放弃新方案，保留原画框不变"
                                  >
                                    <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-400 shrink-0" />
                                    <span>保留原版</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : isMounted ? (
                            <div className="flex items-center justify-between">
                              {isModified ? (
                                <div className="flex items-center gap-1.5 text-blue-400 font-medium text-[11px]">
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>已更新画框「{displayTitle}」</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-[11px]">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>设计画框已挂载至画板</span>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => panToScreen(mountedScreenId!)}
                                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition cursor-pointer ${
                                  isModified
                                    ? 'bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 border border-blue-700/50'
                                    : 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                                }`}
                              >
                                <span>定位画框</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : m.isGuardRejected ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5 text-amber-400 font-medium text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>结构守卫已拦截本次覆盖，尚未写入画框</span>
                              </div>
                              <div className="text-[11px] text-amber-300/80 leading-relaxed">
                                {m.text || '检测到原有结构存在较大变动，为防止误删已暂缓覆盖。'}
                              </div>
                              <button
                                type="button"
                                onClick={() => engine.forceApply(m.htmlOutput, m.id)}
                                className="w-full px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                                title={`放行并直接覆盖更新「${m.preActionSnapshot?.screenName || displayTitle}」`}
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>强制放行并覆盖更新原画框</span>
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5 text-amber-400 font-medium text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>页面设计代码已就绪，尚未挂载至画板</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => engine.mountMessageHtml(m.id)}
                                className="w-full px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>一键挂载至画板</span>
                              </button>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                            <span>规格: {settings.frameWidth}px · {m.htmlOutput.length} 字符</span>
                            {isStagedNow ? (
                              <span className="text-purple-400/90 font-sans">并排比选中</span>
                            ) : mountedScreenId && (
                              <span className={isModified ? 'text-blue-400/90 font-sans' : 'text-emerald-400/80 font-sans'}>
                                {isModified ? '已就绪 (内容已覆盖更新)' : '已在画板就绪'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : m.text && m.text.includes('<artifact') ? (
                    (() => {
                      const artifactRegex = /<artifact(?:\s+([^>]*))?>([\s\S]*?)(?:<\/artifact>|$)/i;
                      const match = m.text.match(artifactRegex);
                      const attrStr = match ? match[1] || '' : '';
                      const titleMatch = attrStr.match(/title=["']([^"']+)["']/i);
                      const title = titleMatch ? titleMatch[1] : (m.screenName || '页面设计代码');
                      const codeSnippet = match ? match[2].trim() : '';
                      const preText = m.text.slice(0, match ? match.index : undefined).trim();
                      const isCodeExpanded = Boolean(expandedCodeIds[m.id]);
                      const targetScreen = m.screenId ? screens[m.screenId] : activeScreenId ? screens[activeScreenId] : null;

                      return (
                        <div className="space-y-2">
                          {preText && <div className="text-slate-300 text-xs">{preText}</div>}
                          <div className="p-2.5 bg-slate-950/90 border border-slate-700/80 rounded-xl space-y-2">
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <FileCode className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                <span className="font-medium text-slate-200 text-xs truncate" title={title}>
                                  {title}
                                </span>
                              </div>
                              {targetScreen && (
                                <button
                                  type="button"
                                  onClick={() => panToScreen(targetScreen.id)}
                                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 rounded transition"
                                >
                                  <span>定位画框</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                              <span>{settings.frameWidth}px 规格 · {codeSnippet.length} 字符</span>
                              <button
                                type="button"
                                onClick={() => toggleCodeExpand(m.id)}
                                className="text-blue-400 hover:text-blue-300 transition cursor-pointer"
                              >
                                {isCodeExpanded ? '收起代码' : '查看代码'}
                              </button>
                            </div>
                            {isCodeExpanded && (
                              <pre className="max-h-48 overflow-y-auto p-2 bg-slate-900 rounded-lg text-[10px] font-mono text-slate-300 whitespace-pre overflow-x-auto select-text border border-slate-800">
                                {codeSnippet}
                              </pre>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : m.text && m.text.includes('[SSRF_BLOCKED]') ? (
                    (() => {
                      const isRuleF = m.text.includes('[SSRF_BLOCKED] F:');
                      const reason = m.text.replace(/\[SSRF_BLOCKED\]\s*[A-Z]:\s*/, '').trim();
                      return (
                        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl space-y-2 text-red-200 shadow-sm">
                          <div className="flex items-center gap-1.5 font-semibold text-xs text-red-400">
                            <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
                            <span>请求被安全护栏拦截</span>
                          </div>
                          <p className="text-[11px] text-red-300/90 leading-relaxed">
                            {isRuleF ? (
                              <>
                                目标端点属于私有局域网或受保护网段。如需连接自建内网模型（如 Ollama / vLLM），请在模型设置中开启<strong>“允许访问局域网/内网端点”</strong>。
                              </>
                            ) : (
                              <>
                                目标端点触发不可豁免的安全防护规则（{reason}）。为保护云凭证与网络环境安全，该请求已被阻断。
                              </>
                            )}
                          </p>
                          {isRuleF && onOpenSettings && (
                            <div className="pt-1">
                              <button
                                onClick={() => onOpenSettings?.('provider')}
                                className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg text-[10px] transition shadow"
                              >
                                打开模型设置开启权限
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : m.isError || m.text?.startsWith('生成失败:') || m.text?.startsWith('请求异常:') ? (
                    <div className="space-y-2.5 p-2 bg-red-950/40 border border-red-800/60 rounded-xl text-red-200">
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-red-400">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>操作未成功完成</span>
                      </div>
                      <div className="text-[11px] text-red-300/90 whitespace-pre-wrap leading-relaxed">
                        {m.text}
                      </div>
                      {m.text.includes('读取流数据异常') && (
                        <div className="text-[10px] text-red-400/80 bg-red-950/60 p-1.5 rounded border border-red-900/60">
                          💡 提示：响应流在传输中断开；若完整页面尚未到达，可直接重试。
                        </div>
                      )}
                      {!isCurrentGenerating && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-red-900/40">
                          <button
                            type="button"
                            onClick={() => engine.retryTurn(m.id)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[11px] font-medium transition cursor-pointer shadow-sm"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>直接重试</span>
                          </button>
                          {m.preActionSnapshot && (
                            <button
                              type="button"
                              onClick={() => engine.rollbackAndRetryTurn(m.id)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] transition cursor-pointer"
                              title={`回退「${m.preActionSnapshot.screenName}」至修改前版本并重新执行`}
                            >
                              <Undo2 className="w-3 h-3 text-amber-400" />
                              <span>回退修改前版本并重新操作</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-slate-300 text-xs whitespace-pre-wrap">{m.text}</div>
                      {m.structureDiff ? (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => engine.forceApply(m.htmlOutput, m.id)}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg text-[11px] flex items-center gap-1 transition cursor-pointer shadow"
                            title="放行并直接合入本次生成的页面或元素修改"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>强制放行并应用修改</span>
                          </button>
                        </div>
                      ) : !isCurrentGenerating && (
                        <button
                          type="button"
                          onClick={() => {
                            let prevUserPrompt =
                              engine.messages
                                .slice(0, engine.messages.findIndex((item) => item.id === m.id))
                                .reverse()
                                .find((item) => item.sender === 'user')?.text || '';
                            // 消除递归嵌套包装
                            prevUserPrompt = prevUserPrompt
                              .replace(/^请针对之前的页面设计诉求：“([\s\S]*?)”，直接且仅输出.*$/, '$1')
                              .trim();
                            handleSendMessage(
                              prevUserPrompt
                                ? `请针对之前的页面设计诉求：“${prevUserPrompt}”，直接且仅输出被 <artifact identifier="screen_new" type="screen" title="新页面设计"> 与 </artifact> 包裹的完整页面代码块，严禁输出任何多余解释`
                                : '请直接输出被 <artifact identifier="screen_new" type="screen" title="新页面设计"> 与 </artifact> 包裹的完整页面代码块'
                            );
                          }}
                          className="mt-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-[11px] flex items-center gap-1 transition cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>一键生成完整页面 HTML</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1 pl-1 text-[11px] text-slate-400">
                {m.checkpointId && (
                  <button
                    onClick={() => alert(`已锁定 Checkpoint [${m.checkpointId}]，可在历史记录中安全撤回。`)}
                    className="flex items-center gap-1 hover:text-blue-400 transition cursor-pointer"
                    title="回到生成前状态"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>回到这里 (快照)</span>
                  </button>
                )}
                {m.preActionSnapshot && !isCurrentGenerating && !m.isError && (
                  <button
                    onClick={() => engine.rollbackAndRetryTurn(m.id)}
                    className="flex items-center gap-1 hover:text-amber-400 transition cursor-pointer"
                    title={`回退「${m.preActionSnapshot.screenName}」至本次生成前的原始版本并重新生成`}
                  >
                    <Undo2 className="w-3 h-3" />
                    <span>回退原版并重新调整</span>
                  </button>
                )}
              </div>

              {/* Single Message Token Usage */}
              {m.streamRecovered && (
                <div className="pl-1 pt-1 text-[10px] text-amber-300" role="status">
                  连接中断；已使用完整接收的页面结果，请检查生成内容。
                </div>
              )}
              {m.usage && m.sender === 'assistant' && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono pl-1 pt-0.5">
                  <Zap className="w-2.5 h-2.5 text-amber-400/80" />
                  <span>{m.usage.totalTokens.toLocaleString()} tokens</span>
                  <span className="text-slate-600">({m.usage.promptTokens.toLocaleString()} in / {m.usage.completionTokens.toLocaleString()} out)</span>
                  {m.elapsedSeconds && (
                    <>
                      <span className="text-slate-700">·</span>
                      <span>{m.elapsedSeconds}s</span>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {/* 自动滚动锚点 */}
        <div ref={messagesEndRef} />
      </div>

      {/* 浮动按钮：最新内容 */}
      {!isAtBottom && (
        <button
          type="button"
          data-testid="scroll-to-bottom-btn"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-slate-850/95 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700/80 rounded-full shadow-lg backdrop-blur-sm text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group select-none"
          title="滚动到最新内容"
        >
          {engine.isGenerating && (
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping flex-shrink-0" />
          )}
          <ArrowDown className="w-3.5 h-3.5 text-blue-400 group-hover:translate-y-0.5 transition-transform" />
          <span>最新内容</span>
        </button>
      )}
    </div>

      {/* Mention Auto-complete Menu (PRD D18 / §3.2.7) */}
      {showMentionMenu && (
        <div className="p-2 bg-slate-950 border-t border-slate-800 max-h-32 overflow-y-auto space-y-1">
          <div className="text-[10px] text-slate-500 px-2 py-0.5 flex items-center gap-1 font-semibold uppercase tracking-wider">
            <AtSign className="w-3 h-3 text-blue-400" />
            <span>引用工程页面上下文 (D18)</span>
          </div>
          {Object.values(screens).map((s) => (
            <div
              key={s.id}
              onClick={() => handleInsertMention(s.name)}
              className="px-2.5 py-1.5 hover:bg-slate-800 rounded-lg cursor-pointer text-slate-300 text-[11px] flex items-center justify-between"
            >
              <span>@{s.name}</span>
              <span className="text-[10px] text-slate-500 font-mono">{settings.frameWidth}px</span>
            </div>
          ))}
        </div>
      )}

      {/* 上下文引用控制栏（卡片/按钮双态：启用 / 非启用）*/}
      {(activeScreen || selectedNode) && (
        <div className="px-3 py-2 border-t border-slate-800 bg-slate-900/60 flex items-center flex-wrap gap-2">
          <span className="text-[10px] text-slate-500 mr-0.5 flex-shrink-0">引用</span>
          {activeScreen && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border transition select-none ${
                isPageReferenced
                  ? 'bg-blue-600/20 border-blue-500/80 text-blue-300 shadow-sm shadow-blue-500/10'
                  : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/70 hover:border-slate-600 text-slate-400 hover:text-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={handleTogglePageRef}
                disabled={engine.isGenerating}
                className="flex items-center gap-1.5 transition disabled:opacity-40"
                title={
                  isPageReferenced
                    ? `已引用「${activeScreen.name}」，AI 将基于该画框进行修改（点击可停用）`
                    : `未引用「${activeScreen.name}」，点击启用引用后 AI 将针对该画框修改`
                }
              >
                {isPageReferenced ? (
                  <Check className="w-3 h-3 text-blue-400" />
                ) : (
                  <AtSign className="w-3 h-3 text-slate-500" />
                )}
                <span className="truncate max-w-[100px] font-medium">{activeScreen.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                    isPageReferenced
                      ? 'bg-blue-500/30 text-blue-200 font-semibold border border-blue-400/40'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/60'
                  }`}
                >
                  {isPageReferenced ? '已启用' : '未启用'}
                </span>
              </button>
              {isPageReferenced && (
                <button
                  type="button"
                  onClick={() => setIsPageReferenced(false)}
                  disabled={engine.isGenerating}
                  className="p-0.5 text-blue-400/60 hover:text-blue-100 hover:bg-blue-500/20 rounded transition"
                  title="停用页面引用"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {selectedNode && activeScreen && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border transition select-none ${
                isElementReferenced
                  ? 'bg-indigo-600/20 border-indigo-500/80 text-indigo-300 shadow-sm shadow-indigo-500/10'
                  : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/70 hover:border-slate-600 text-slate-400 hover:text-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={handleToggleElementRef}
                disabled={engine.isGenerating}
                className="flex items-center gap-1.5 transition disabled:opacity-40"
                title={
                  isElementReferenced
                    ? `已引用元素 <${selectedNode.tagName}> (nid: ${selectedNode.nid})，点击可停用`
                    : `未引用元素 <${selectedNode.tagName}>，点击启用后将精准定位修改该元素`
                }
              >
                {isElementReferenced ? (
                  <Check className="w-3 h-3 text-indigo-400" />
                ) : (
                  <Pin className="w-3 h-3 text-slate-500" />
                )}
                <span className="font-mono">{'<'}{selectedNode.tagName}{'>'}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                    isElementReferenced
                      ? 'bg-indigo-500/30 text-indigo-200 font-semibold border border-indigo-400/40'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/60'
                  }`}
                >
                  {isElementReferenced ? '已启用' : '未启用'}
                </span>
              </button>
              {isElementReferenced && (
                <button
                  type="button"
                  onClick={handleDisableElementRef}
                  disabled={engine.isGenerating}
                  className="p-0.5 text-indigo-400/60 hover:text-indigo-100 hover:bg-indigo-500/20 rounded transition"
                  title="停用元素引用"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Input Form */}
      <div className="p-3 border-t border-slate-800 bg-slate-900" onPaste={handlePaste}>
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,.md,.markdown,.txt,.json,.yaml,.yml,.csv,.tsv,.xml,.html,.css,.js,.jsx,.ts,.tsx,.log,.sql,.ini,.toml,.sh,.py,.rs,text/plain"
          multiple
          className="hidden"
          disabled={engine.isGenerating || isReadingFiles}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            const images = files.filter((file) => file.type.startsWith('image/'));
            const texts = files.filter((file) => !file.type.startsWith('image/'));
            if (images.length > 0) {
              const image = images[0];
              const reader = new FileReader();
              reader.onload = (ev) => {
                if (ev.target?.result) setAttachedImage({ name: image.name, dataUrl: ev.target.result as string });
              };
              reader.readAsDataURL(image);
            }
            if (texts.length > 0) void addTextFiles(texts, 'upload');
          }}
        />

        {(attachedTextFiles.length > 0 || textFileError || isReadingFiles) && (
          <div className="mb-2 space-y-1" aria-live="polite">
            {attachedTextFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center gap-2 p-2 rounded-lg border border-blue-800/60 bg-blue-950/30 text-[11px] text-blue-200">
                <FileCode className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate flex-1" title={file.name}>{file.name}</span>
                <span className="text-blue-300/60">{file.content.length} 字</span>
                <button type="button" onClick={() => setAttachedTextFiles((prev) => prev.filter((_, i) => i !== index))} title={`移除 ${file.name}`} disabled={engine.isGenerating}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {isReadingFiles && <div className="text-[11px] text-blue-300">正在读取文本文件...</div>}
            {textFileError && <div role="alert" className="text-[11px] text-red-300">文件读取失败：{textFileError}</div>}
          </div>
        )}

        {attachedImage && (
          <div className="space-y-1 mb-2">
            <div
              className={`flex items-center gap-2 p-1.5 px-2.5 bg-slate-950 border rounded-xl text-[11px] text-slate-300 ${
                codeSupportsVision || visionReady ? 'border-blue-900/60' : 'border-amber-700/60 bg-amber-950/20'
              }`}
            >
              <img
                src={attachedImage.dataUrl}
                alt="Ref"
                className="w-7 h-7 object-cover rounded-md border border-slate-700 flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <span className="truncate block font-medium text-blue-300">
                  {attachedImage.name}
                </span>
                <span className="text-[10px] text-slate-400 truncate block">
                  {codeSupportsVision
                    ? `主力模型 [${activeCodeProv?.name || 'Code'}] 原生识图`
                    : visionReady
                    ? `将由 Vision 档 [${activeVisionProv?.name || 'Gemini'}] 识别`
                    : `⚠️ 主力为纯文本，且 Vision 档未配 Key`}
                </span>
              </div>
              <button
                onClick={() => setAttachedImage(null)}
                disabled={engine.isGenerating}
                className="text-slate-400 hover:text-slate-200 p-0.5 disabled:opacity-40 flex-shrink-0"
                title="移除参考图"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {!codeSupportsVision && !visionReady && (
              <div className="p-2 bg-amber-950/40 border border-amber-800/40 rounded-xl text-[10px] text-amber-300/90 leading-relaxed flex items-start gap-1.5">
                <span className="flex-shrink-0">⚠️</span>
                <span>
                  当前主力【{activeCodeProv?.name || 'DeepSeek'}】不支持图片。请点击
                  <button
                    type="button"
                    onClick={() => onOpenSettings?.('provider')}
                    className="underline text-amber-200 mx-1 font-medium hover:text-white"
                  >
                    Provider 配置
                  </button>
                  为 Vision 档配置 Key，或移除图片仅发送文字。
                </span>
              </div>
            )}
          </div>
        )}

        {/* 元素引用 Chip（Add to Chat 功能 - spec: element-add-to-chat） */}
        {pendingNodeRef && (
          <div className="flex items-center gap-1.5 mb-2 p-2 bg-blue-950/40 border border-blue-500/40 border-dashed rounded-xl">
            <Pin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] text-blue-300 font-medium">
                {'<'}{pendingNodeRef.tagName}{'>'}&nbsp;
                <span className="text-blue-400/70">@&nbsp;{pendingNodeRef.screenName}</span>
              </span>
              <span className="block text-[10px] text-blue-400/50 font-mono truncate">
                nid: {pendingNodeRef.nid}
              </span>
            </div>
            <button
              type="button"
              onClick={() => clearPendingNodeRef()}
              className="p-0.5 text-blue-400/60 hover:text-blue-200 transition flex-shrink-0"
              title="取消引用"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 快捷输入 (Quick Prompts) —— 点击快速插入到输入框（不提交）*/}
        <div className="mb-2">
          {/* Header row: title and settings config button */}
          <div className="flex items-center justify-between pb-1 text-[10px] text-slate-400 font-medium">
            <div className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>快捷输入</span>
              <span className="text-[9px] text-slate-500 font-normal">（点击快速插入）</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenSettings?.('quick_prompts')}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-blue-300 hover:bg-slate-800 rounded border border-dashed border-slate-700 hover:border-blue-500/50 transition"
              title="自定义与配置快捷输入"
            >
              <Settings className="w-2.5 h-2.5" />
              <span>配置</span>
            </button>
          </div>

          {/* Multi-row chips container: wrap enabled, max-height 4 rows (~118px), vertical scroll only, no horizontal scroll */}
          <div
            data-testid="quick-prompts-container"
            className="flex flex-wrap items-center gap-1.5 overflow-y-auto overflow-x-hidden max-h-[118px] py-0.5 pr-0.5"
          >
            {allQuickPrompts.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleInsertQuickPrompt(item.content)}
                title={`${item.content}\n[点击快速插入，不自动提交] · ${item.scope === 'project' ? '当前工程' : '全局通用'}`}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] border transition bg-slate-800/80 hover:bg-slate-800 border-slate-700/70 hover:border-slate-500 text-slate-300 hover:text-white"
              >
                <span>{item.title}</span>
                {item.scope === 'project' && (
                  <span className="text-[9px] px-1 py-0.2 bg-blue-500/20 text-blue-300 rounded font-mono">项目</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={engine.isGenerating || isReadingFiles}
            className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800 disabled:opacity-40 rounded-xl transition"
            title="上传图片或 Markdown、TXT 等文本文件；也可粘贴文件或在对话中写本地路径"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (engine.isGenerating) {
                  handleStopGenerating();
                } else {
                  handleSendMessage();
                }
              }
            }}
            placeholder={
              engine.isGenerating
                ? 'AI 正在生成中，点击右侧按钮可立即停止...'
                : '输入设计诉求，可上传/粘贴图片或文本文件，也可引用本地文本路径...'
            }
            rows={2}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 pr-20 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />

          {/* Submit / Stop Action Button */}
          {engine.isGenerating ? (
            <button
              type="button"
              onClick={handleStopGenerating}
              className="absolute right-2.5 top-2.5 px-2.5 py-1.5 bg-blue-600/20 hover:bg-red-600/30 text-blue-400 hover:text-red-300 border border-blue-500/40 hover:border-red-500/50 rounded-xl transition-all flex items-center gap-1.5 group cursor-pointer shadow-sm select-none"
              title="AI 正在生成中，点击可立即停止 (Stop)"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin group-hover:hidden text-blue-400" />
              <Square className="w-3.5 h-3.5 hidden group-hover:block fill-current text-red-400" />
              <span className="text-[11px] font-medium transition">
                <span className="group-hover:hidden animate-pulse">思考中</span>
                <span className="hidden group-hover:inline text-red-300 font-semibold">停止</span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={(!input.trim() && !attachedImage && attachedTextFiles.length === 0) || isReadingFiles}
              className="absolute right-2.5 top-2.5 p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl transition shadow"
              title="发送设计诉求 (Enter)"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 附件大图全屏预览弹窗 (Lightbox Modal) */}
      {previewImageUrl && (
        <div
          data-testid="image-lightbox-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150 select-none"
          onClick={() => setPreviewImageUrl(null)}
        >
          {/* Close button */}
          <button
            type="button"
            data-testid="close-lightbox-btn"
            onClick={() => setPreviewImageUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition shadow-lg cursor-pointer z-10"
            title="关闭预览 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Enlarge image container */}
          <div
            className="relative max-w-[90vw] max-h-[88vh] flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImageUrl}
              alt="附件高清大图预览"
              data-testid="lightbox-preview-img"
              className="max-w-full max-h-[82vh] object-contain rounded-xl border border-slate-700 shadow-2xl bg-slate-950"
            />
            <div className="mt-2.5 px-3 py-1 bg-slate-900/90 border border-slate-800 rounded-full text-xs text-slate-400 flex items-center gap-2 shadow">
              <span>附件参考图预览</span>
              <span className="text-slate-600">·</span>
              <button
                type="button"
                onClick={() => {
                  const w = window.open('');
                  w?.document.write(`<body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${previewImageUrl}" style="max-width:100%;max-height:100%;" /></body>`);
                }}
                className="text-blue-400 hover:underline cursor-pointer"
              >
                在新标签打开
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
