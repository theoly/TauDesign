import React, { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useAIConfigStore } from '../../stores/useAIConfigStore';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { AIService } from '../../services/ai/aiService';
import { NidEngine } from '../../utils/nidEngine';
import { TokenLintEngine, computeScreenAuditReport } from '../../utils/tokenLint';
import { setTextByNid, uneditableHint } from '../../utils/textNode';
import { duplicateElementByNid, wrapElementByNid } from '../../utils/domPatcher';
import { LayoutInspector } from './LayoutInspector';
import { BoxModelInspector } from './BoxModelInspector';
import { PositionSizeInspector } from './PositionSizeInspector';
import { RadiusInspector } from './RadiusInspector';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Box,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Copy,
  Layers,
  RotateCcw,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  Wand2,
  Wrench
} from 'lucide-react';

/** 属性面板分组 (doc/feature/inspector-geometry-tabs/spec.md BR-INS-01) */
export type InspectorTabKey = 'layout' | 'style' | 'actions';

export const INSPECTOR_TABS: Array<{
  key: InspectorTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'layout', label: '布局', icon: Box },
  { key: 'style', label: '外观', icon: Sparkles },
  { key: 'actions', label: '操作', icon: Wrench }
];

const formatBreadcrumbClass = (rawCls: unknown): string => {
  if (typeof rawCls === 'string') {
    const trimmed = rawCls.trim();
    if (!trimmed) return '';
    return '.' + trimmed.split(/\s+/).slice(0, 2).join('.');
  }
  if (rawCls && typeof rawCls === 'object' && 'baseVal' in rawCls) {
    const base = String((rawCls as any).baseVal || '').trim();
    if (!base) return '';
    return '.' + base.split(/\s+/).slice(0, 2).join('.');
  }
  return '';
};

export const PropertyInspector: React.FC = () => {
  const {
    activeScreenId,
    selectedNid,
    selectedNode,
    screens,
    settings,
    overrides,
    designSystem,
    components,
    setOverride,
    clearNodeOverrides,
    selectNode,
    updateScreenHtml,
    deleteNode,
    extractComponentFromNode,
    detachComponentInstance,
    syncComponentInstances,
    selectNodeByNid,
    postAuditReport
  } = useProjectStore();

  const { getActiveProviderForRole } = useAIConfigStore();
  const { addCheckpoint } = useHistoryStore();

  // 当前分组。切换选中元素时刻意不重置——连续调同类属性是主要工作流 (BR-INS-08)
  const [activeTab, setActiveTab] = useState<InspectorTabKey>('layout');

  // Point-and-Edit AI state
  const [pointPrompt, setPointPrompt] = useState('');
  const [isPointGenerating, setIsPointGenerating] = useState(false);

  // Component states
  const [compNameInput, setCompNameInput] = useState('');
  const [showExtractInput, setShowExtractInput] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // 文本字段：受控输入。此前用 defaultValue 且 <input> 无 key，React 复用同一
  // DOM 节点，切换选中元素时字段仍显示上一个元素的文本 (doc/issues.md ISSUE-001)
  const [textDraft, setTextDraft] = useState('');
  useEffect(() => {
    setTextDraft(selectedNode?.textContent ?? '');
  }, [selectedNid, selectedNode?.textContent]);


  if (!activeScreenId || !selectedNid || !selectedNode) {
    const curScreen = activeScreenId ? screens[activeScreenId] : null;
    const lint = curScreen ? TokenLintEngine.scan(curScreen.htmlContent, designSystem) : null;

    return (
      <div className="w-full min-w-0 h-full bg-slate-900 p-5 flex flex-col justify-between text-xs select-none">
        <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500">
          <Sliders className="w-8 h-8 text-slate-600 mb-3" />
          <span className="font-medium text-slate-400">未选中任何元素</span>
          <p className="mt-1 text-[11px] leading-relaxed">
            在中间画板内点击任意按钮、卡片或文本即可进行精准微调与局部 AI 重构。
          </p>
        </div>

        {/* Screen Health & Token Lint Widget (PRD §3.5.4) */}
        {lint && curScreen && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">当前页面 Token 合规度</span>
              <span className={`font-mono font-bold ${lint.complianceRate >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {lint.complianceRate}%
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  lint.complianceRate >= 95 ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${lint.complianceRate}%` }}
              />
            </div>
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] text-slate-400 block">
                {lint.issues.length > 0 ? `检测到 ${lint.issues.length} 处风格逃逸` : '未检测到风格逃逸，规范度达标'}
              </span>
              <button
                type="button"
                onClick={() => {
                  const report = computeScreenAuditReport(curScreen, designSystem, settings.deviceProfile);
                  postAuditReport(report);
                }}
                className="w-full py-1.5 px-2 bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg text-[11px] font-medium transition flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.99]"
                title="一键评测当前页面规范逃逸点并输出到对话列表（不修改原代码）"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>一键评测</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const currentScreen = screens[activeScreenId];
  const overrideKey = `${activeScreenId}:${selectedNid}`;
  const currentOverride = overrides[overrideKey] || { nid: selectedNid, declarations: {} };
  const decs = currentOverride.declarations;

  const handleStyleChange = (prop: string, val: string, isCustom = false) => {
    setOverride(activeScreenId, selectedNid, { [prop]: val }, isCustom, `微调样式: ${prop} -> ${val}`);
  };

  const handleTextChange = (newText: string) => {
    if (selectedNode.textEditable === false) return;
    const trimmed = newText.trim();
    // 正则匹配 HTML 会在嵌套元素处截断产出非法结构、对空元素静默失效，
    // 统一走 DOMParser (doc/issues.md ISSUE-004)
    const updatedHtml = setTextByNid(currentScreen.htmlContent, selectedNid, trimmed);
    if (updatedHtml) {
      updateScreenHtml(activeScreenId, updatedHtml, `修改文案: ${trimmed.slice(0, 10)}`);
      selectNode({ ...selectedNode, textContent: trimmed });
    }
  };

  // --- Point-and-Edit: 局部 AI 微调 (T-P2-01 / PRD §3.6.2) ---
  const handlePointAndEdit = async () => {
    if (!pointPrompt.trim() || isPointGenerating) return;
    const activeRole = getActiveProviderForRole('code');
    if (!activeRole || !activeRole.provider || !activeRole.provider.apiKey) {
      alert('请先在右上角【设置】中配置 AI Provider API Key');
      return;
    }

    setIsPointGenerating(true);

    // Extract target subtree
    const targetRegex = new RegExp(`(<([a-zA-Z0-9-]+)[^>]*data-nid=["']${selectedNid}["'][^>]*>[\\s\\S]*?<\\/\\2>)`, 'i');
    const match = currentScreen.htmlContent.match(targetRegex);
    const targetSubtree = match ? match[1] : '';

    const prompt = `You are performing a scoped Point-and-Edit refactoring on an existing HTML element.
Target element:
\`\`\`html
${targetSubtree}
\`\`\`

User Instruction: "${pointPrompt}"
Requirements:
1. Return ONLY the modified element HTML.
2. Keep the data-nid="${selectedNid}" on the root element.
3. Use white-listed CSS utility classes (row, col, card, btn, etc.) and CSS variables.
4. Do NOT output markdown explanations outside the code block.`;

    let acc = '';
    const { promise } = AIService.stream(
      activeRole.provider,
      activeRole.modelId,
      [{ role: 'user', content: prompt }],
      (ev) => {
        if (ev.type === 'Delta') acc += ev.text;
      }
    );

    try {
      await promise;
    } finally {
      setIsPointGenerating(false);
      setPointPrompt('');

      let cleanSubtree = acc.replace(/```(?:html)?/gi, '').replace(/```/g, '').trim();
      if (cleanSubtree && targetSubtree) {
        addCheckpoint(`局部微调前备份: #${selectedNid}`, {
          screenId: activeScreenId,
          htmlContent: currentScreen.htmlContent
        });

        // Ensure data-nids are maintained
        const updatedHtml = currentScreen.htmlContent.replace(targetSubtree, cleanSubtree);
        const finalHtml = NidEngine.injectNids(updatedHtml);
        updateScreenHtml(activeScreenId, finalHtml, `局部 AI 微调: #${selectedNid}`);
      }
    }
  };

  // --- Structural Operations (T-P2-07 / PRD §3.6.3 / ISSUE-021) ---
  const handleDuplicateNode = () => {
    const res = duplicateElementByNid(currentScreen.htmlContent, selectedNid);
    if (!res.success) return;
    updateScreenHtml(activeScreenId, res.html, `复制元素: #${selectedNid}`);
    if (res.newNid) {
      selectNodeByNid(activeScreenId, res.newNid);
    }
  };

  const handleDeleteNode = () => {
    deleteNode(activeScreenId, selectedNid);
  };

  const handleWrapInContainer = (containerType: 'row' | 'col' | 'card') => {
    const res = wrapElementByNid(currentScreen.htmlContent, selectedNid, containerType);
    if (!res.success) return;
    updateScreenHtml(activeScreenId, res.html, `包裹为 ${containerType}: #${selectedNid}`);
    if (res.containerNid) {
      selectNodeByNid(activeScreenId, res.containerNid);
    }
  };

  const handleExtractComponent = () => {
    if (!compNameInput.trim()) return;
    const compId = extractComponentFromNode(activeScreenId, selectedNid, compNameInput.trim());
    if (compId) {
      setShowExtractInput(false);
      setCompNameInput('');
      setSyncStatusMsg(`成功提取为组件「${compNameInput.trim()}」`);
      setTimeout(() => setSyncStatusMsg(null), 3000);
    }
  };

  const handleSyncComponent = () => {
    if (!selectedNode.componentId) return;
    const res = syncComponentInstances(selectedNode.componentId);
    if (res.skippedConflictCount > 0) {
      setSyncStatusMsg(`已同步 ${res.syncedCount} 处；跳过 ${res.skippedConflictCount} 处冲突实例 (已受保护)`);
    } else {
      setSyncStatusMsg(`成功同步全部 ${res.syncedCount} 处实例`);
    }
    setTimeout(() => setSyncStatusMsg(null), 3500);
  };

  return (
    <div className="w-full min-w-0 h-full bg-slate-900 flex flex-col z-20 text-xs select-none">
      {/* Header & Breadcrumb (PRD §3.6.1) */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-1 text-slate-400 text-[11px] mb-2 font-mono overflow-x-auto whitespace-nowrap pb-1">
          <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="truncate max-w-[70px] text-slate-500" title={currentScreen?.name}>{currentScreen?.name}</span>
          {selectedNode.parentChain && selectedNode.parentChain.map((p) => (
            <React.Fragment key={p.nid}>
              <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
              <button
                onClick={() => selectNodeByNid(activeScreenId, p.nid)}
                className="hover:text-blue-400 hover:underline transition truncate max-w-[60px]"
                title={`${p.tagName}${formatBreadcrumbClass(p.className)}`}
              >
                {p.tagName}
              </button>
            </React.Fragment>
          ))}
          <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
          <span className="text-blue-400 font-semibold">{selectedNode.tagName}</span>
          <span className="text-slate-500 font-mono text-[10px]">#{selectedNid}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>尺寸: {selectedNode.computedBox?.width ?? 0} × {selectedNode.computedBox?.height ?? 0}px</span>
          {currentOverride.escaped && (
            <span className="flex items-center gap-1 text-amber-400 bg-amber-950/60 border border-amber-800/40 px-1.5 py-0.5 rounded text-[10px]">
              <AlertTriangle className="w-3 h-3" />
              <span>Token 逃逸</span>
            </span>
          )}
        </div>
      </div>

      {/* 常驻：局部定向 AI 微调。它是跨场景高频入口，不该藏进任一 Tab (BR-INS-01) */}
      <div className="px-3 pt-3">
        {/* Point-and-Edit: 局部定向 AI 微调 (PRD §3.6.2) */}
        <div className="p-3 bg-purple-950/40 border border-purple-800/50 rounded-xl space-y-2">
          <div className="flex items-center gap-1.5 text-purple-300 font-semibold text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>局部 AI 定向微调 (Point-and-Edit)</span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={pointPrompt}
              onChange={(e) => setPointPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePointAndEdit();
              }}
              placeholder="对当前选中元素提需求，如：加微光动画..."
              className="w-full bg-slate-950 border border-purple-800/60 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500 pr-8"
            />
            <button
              onClick={handlePointAndEdit}
              disabled={isPointGenerating || !pointPrompt.trim()}
              className="absolute right-1.5 top-1.5 p-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded transition"
            >
              <Wand2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 常驻：文本内容。ISSUE-002 的教训——字段时有时无会让用户以为功能损坏，
          因此它不进任何 Tab，始终可见 (BR-INS-01) */}
      <div className="px-3 pt-3">
        {/* Text Content —— 常驻渲染：字段时有时无会让用户以为功能损坏 (ISSUE-002) */}
        {(() => {
          const editable = selectedNode.textEditable !== false;
          const hint = selectedNode.textReason ? uneditableHint(selectedNode.textReason) : null;
          return (
            <div className="space-y-1.5 pt-2 border-t border-slate-800">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Type className="w-3.5 h-3.5 text-slate-400" />
                <span>文本内容</span>
              </label>
              <input
                type="text"
                value={textDraft}
                disabled={!editable}
                placeholder={editable ? '（空）' : ''}
                onChange={(e) => setTextDraft(e.target.value)}
                onBlur={(e) => handleTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className={`w-full bg-slate-950 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none ${
                  editable
                    ? 'border-slate-700 text-slate-200 focus:border-blue-500'
                    : 'border-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              />
              {hint && <p className="text-[10px] text-slate-500 leading-tight">{hint}</p>}
            </div>
          );
        })()}
      </div>

      {/* Tab 分组 (BR-INS-01) */}
      <div className="flex items-center gap-1 px-3 pt-3 border-b border-slate-800">
        {INSPECTOR_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            data-testid={`inspector-tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] rounded-t-lg border-b-2 transition ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-300 bg-slate-800/60 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'layout' && (
          <>
            {/* 定位与尺寸 (BR-INS-03/04) */}
            <PositionSizeInspector
              computedBox={selectedNode.computedBox}
              computedLayout={selectedNode.computedLayout}
              declarations={decs}
              onStyleChange={handleStyleChange}
            />

        {/* Layout & Alignment (PRD §3.6.1) */}
        <LayoutInspector
          computedLayout={selectedNode.computedLayout}
          declarations={decs}
          onStyleChange={handleStyleChange}
        />

        {/* Box Model & Spacing (PRD §3.6.1) */}
        <BoxModelInspector
          computedBox={selectedNode.computedBox}
          declarations={decs}
          onStyleChange={handleStyleChange}
        />
          </>
        )}

        {activeTab === 'style' && (
          <>
            {/* 圆角 (BR-INS-05) */}
            <RadiusInspector
              key={selectedNid}
              computedLayout={selectedNode.computedLayout}
              declarations={decs}
              onStyleChange={handleStyleChange}
            />

        {/* 阴影层级 */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">阴影 (SHADOW)</span>
          <select
            value={decs['box-shadow'] || ''}
            onChange={(e) => handleStyleChange('box-shadow', e.target.value)}
            aria-label="阴影层级"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-slate-200 text-xs"
          >
            <option value="">默认</option>
            <option value="none">无阴影</option>
            <option value="var(--shadow-sm)">平滑阴影 (SM)</option>
            <option value="var(--shadow-md)">中等阴影 (MD)</option>
            <option value="var(--shadow-lg)">浮层阴影 (LG)</option>
          </select>
        </div>

        {/* Typography */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">排版与字号</span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-slate-500 block mb-1">字号阶梯</span>
              <select
                value={decs['font-size'] || ''}
                onChange={(e) => handleStyleChange('font-size', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-slate-200 text-xs"
              >
                <option value="">默认</option>
                <option value="var(--font-size-xs)">XS (12px)</option>
                <option value="var(--font-size-sm)">SM (14px)</option>
                <option value="var(--font-size-md)">MD (16px)</option>
                <option value="var(--font-size-lg)">LG (18px)</option>
                <option value="var(--font-size-xl)">XL (20px)</option>
                <option value="var(--font-size-2xl)">2XL (24px)</option>
                <option value="var(--font-size-3xl)">3XL (30px)</option>
              </select>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block mb-1">字重</span>
              <select
                value={decs['font-weight'] || ''}
                onChange={(e) => handleStyleChange('font-weight', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-slate-200 text-xs"
              >
                <option value="">默认</option>
                <option value="400">Regular 400</option>
                <option value="500">Medium 500</option>
                <option value="600">Semibold 600</option>
                <option value="700">Bold 700</option>
              </select>
            </div>
          </div>
        </div>

          </>
        )}

        {activeTab === 'actions' && (
          <>
        {/* Component Instance or Extract Banner (PRD §3.7 / D6) */}
        {selectedNode.componentId ? (
          <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-indigo-300 font-semibold text-[11px]">
                <Boxes className="w-3.5 h-3.5 text-indigo-400" />
                <span>组件实例: {components[selectedNode.componentId]?.name || '已封装组件'}</span>
              </div>
              <span className="text-[10px] text-indigo-400/70 font-mono">#{selectedNode.componentInstanceId?.slice(0, 8)}</span>
            </div>
            <p className="text-[10px] text-indigo-300/70 leading-tight">
              该元素属于工程组件同步组。结构与样式修改将保留插槽内容并同步。
            </p>
            {syncStatusMsg && (
              <div className="p-1.5 bg-indigo-900/60 text-indigo-200 rounded text-[10px] leading-tight">
                {syncStatusMsg}
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                onClick={handleSyncComponent}
                className="py-1 px-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium transition"
              >
                批量同步全画板
              </button>
              <button
                onClick={() => detachComponentInstance(activeScreenId, selectedNid)}
                className="py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition"
              >
                从组件分离
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-[11px]">
                <Boxes className="w-3.5 h-3.5 text-blue-400" />
                <span>组件化复用 (Component)</span>
              </div>
              <button
                onClick={() => setShowExtractInput(!showExtractInput)}
                className="text-[10px] text-blue-400 hover:text-blue-300 transition"
              >
                {showExtractInput ? '收起' : '+ 提取为组件'}
              </button>
            </div>
            {showExtractInput && (
              <div className="space-y-1.5 pt-1">
                <input
                  type="text"
                  value={compNameInput}
                  onChange={(e) => setCompNameInput(e.target.value)}
                  placeholder="组件名称，如：概览指标卡..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleExtractComponent();
                  }}
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => setShowExtractInput(false)}
                    className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px]"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleExtractComponent}
                    disabled={!compNameInput.trim()}
                    className="px-2.5 py-0.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-[10px] font-medium transition"
                  >
                    确认封装
                  </button>
                </div>
              </div>
            )}
            {syncStatusMsg && (
              <div className="p-1.5 bg-blue-950 text-blue-300 rounded text-[10px]">
                {syncStatusMsg}
              </div>
            )}
          </div>
        )}

        {/* Structural Operations (PRD §3.6.3) */}
        <div className="space-y-2 pt-1 border-t border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">结构与容器操作</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={handleDuplicateNode}
              className="flex items-center justify-center gap-1.5 py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition text-[11px]"
            >
              <Copy className="w-3 h-3" />
              <span>复制此节点</span>
            </button>
            <button
              onClick={handleDeleteNode}
              className="flex items-center justify-center gap-1.5 py-1 px-2 bg-slate-800 hover:bg-red-950 text-red-400 rounded-lg border border-slate-700 hover:border-red-800 transition text-[11px]"
            >
              <Trash2 className="w-3 h-3" />
              <span>删除此节点</span>
            </button>
          </div>
          <div className="flex items-center gap-1 pt-1">
            <span className="text-[10px] text-slate-500">包裹为容器:</span>
            {(['row', 'col', 'card'] as const).map((t) => (
              <button
                key={t}
                onClick={() => handleWrapInContainer(t)}
                className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-300 transition"
              >
                .{t}
              </button>
            ))}
          </div>
        </div>

        {/* Reset L4 */}
        {Object.keys(decs).length > 0 && (
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={() => {
                clearNodeOverrides(activeScreenId, selectedNid);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-xs transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>还原为 AI 基线样式</span>
            </button>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
};
