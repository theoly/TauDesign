import {ComponentContractEditor} from './ComponentContractEditor';
import {libraryMemberLocked} from '../../services/ai/designLibraryReference';
import React, { useState, useRef } from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useAIConfigStore } from '../../stores/useAIConfigStore';
import { AIService } from '../../services/ai/aiService';
import { Asset, ComponentDefinition } from '../../types/project';
import { ComponentDetector, ComponentCandidate } from '../../utils/componentDetector';
import { ImageGenerator, ImageGenOptions } from '../../utils/imageGenerator';
import { parseHtmlCopy } from '../../utils/htmlDocument';
import { AssetPreviewImage } from './AssetPreviewImage';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bell,
  Box,
  Boxes,
  Briefcase,
  Check,
  Clock,
  Code,
  Copy,
  Database,
  Download,
  FileCode,
  FolderOpen,
  Heart,
  Image as ImageIcon,
  Layers,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  Upload,
  User,
  Wand2,
  Zap
} from 'lucide-react';

interface AssetModalProps {
  onClose: () => void;
}

const BUILTIN_LUCIDE_ICONS = [
  { name: 'user', label: '用户 (User)', icon: User, svg: '<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' },
  { name: 'shield', label: '安全盾牌 (Shield)', icon: Shield, svg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
  { name: 'star', label: '收藏星星 (Star)', icon: Star, svg: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
  { name: 'lock', label: '密码锁 (Lock)', icon: Lock, svg: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' },
  { name: 'clock', label: '时钟 (Clock)', icon: Clock, svg: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
  { name: 'bell', label: '通知提醒 (Bell)', icon: Bell, svg: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>' },
  { name: 'mail', label: '邮件消息 (Mail)', icon: Mail, svg: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>' },
  { name: 'activity', label: '动态走势 (Activity)', icon: Activity, svg: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
  { name: 'settings', label: '系统设置 (Settings)', icon: Settings, svg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
  { name: 'database', label: '数据库 (Database)', icon: Database, svg: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>' },
  { name: 'server', label: '服务器集群 (Server)', icon: Server, svg: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>' },
  { name: 'zap', label: '闪电效能 (Zap)', icon: Zap, svg: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' }
];

export const AssetModal: React.FC<AssetModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'components' | 'images' | 'icons' | 'ai_svg'>('components');
  const [iconSearch, setIconSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Store Hooks
  const {
    screens,
    activeScreenId,
    components,
    designLibraryBinding,
    assets,
    selectedNode,
    createComponent,
    insertComponent,
    deleteComponent,
    syncComponentInstances,
    addAsset,
    removeAsset,
    replaceAssetGlobally,
    cleanupUnusedAssets,
    updateScreenHtml
  } = useProjectStore();

  const { getActiveProviderForRole } = useAIConfigStore();

  // AI Image Generator State
  const [imgPrompt, setImgPrompt] = useState('高端科技商业仪表盘核心指标卡片');
  const [imgStyle, setImgStyle] = useState<'3d' | 'photo' | 'vector' | 'flat'>('3d');
  const [imgRatio, setImgRatio] = useState<'1:1' | '16:9' | '4:3' | '9:16'>('16:9');
  const [generatedImgUrl, setGeneratedImgUrl] = useState<string | null>(null);
  const [isImgGenerating, setIsImgGenerating] = useState(false);

  // AI Vector Icon State
  const [aiIconPrompt, setAiIconPrompt] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null);

  // Notification / Feedback msg
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scan repeated structural components (PRD §3.7.1)
  const repeatedCandidates = ComponentDetector.detectRepeatedStructures(screens, 2);

  const showFeedback = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3500);
  };

  // Filter Lucide icons
  const filteredIcons = BUILTIN_LUCIDE_ICONS.filter(
    (i) => i.name.toLowerCase().includes(iconSearch.toLowerCase()) || i.label.includes(iconSearch)
  );

  const handleCopySvg = (svgContent: string, key: string) => {
    const fullSvg = `<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg>`;
    navigator.clipboard.writeText(fullSvg);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Generate AI SVG Icon
  const handleGenerateAiSvg = async () => {
    if (!aiIconPrompt.trim() || isAiGenerating) return;
    const activeRole = getActiveProviderForRole('code');
    if (!activeRole || !activeRole.provider || !activeRole.provider.apiKey) {
      alert('请先在设置中配置 AI Provider API Key');
      return;
    }

    setIsAiGenerating(true);
    setGeneratedSvg('');

    const prompt = `You are a specialized SVG Vector Icon Designer.
User Prompt: "${aiIconPrompt}"
Generate ONLY the inner path / shape tags for a clean 24x24 monochrome vector icon.
DO NOT wrap with <svg> tags.
ONLY return valid XML path/circle/rect/polyline/polygon tags with standard attributes.
No explanations.`;

    let acc = '';
    const { promise } = AIService.stream(
      activeRole.provider,
      activeRole.modelId,
      [{ role: 'user', content: prompt }],
      (ev) => {
        if (ev.type === 'Delta') {
          acc += ev.text;
          setGeneratedSvg(acc);
        }
      }
    );

    try {
      await promise;
    } finally {
      setIsAiGenerating(false);
      const cleaned = acc.replace(/```(?:xml|svg)?/gi, '').replace(/```/g, '').trim();
      setGeneratedSvg(cleaned);
    }
  };

  // Generate AI Image (PRD §3.4.1)
  const handleGenerateAiImage = () => {
    if (!imgPrompt.trim()) return;
    setIsImgGenerating(true);

    setTimeout(() => {
      try {
        const dataUrl = ImageGenerator.generateProceduralImage({
          prompt: imgPrompt,
          style: imgStyle,
          aspectRatio: imgRatio
        });
        setGeneratedImgUrl(dataUrl);
      } finally {
        setIsImgGenerating(false);
      }
    }, 400);
  };

  // Save generated image to project assets (MD5 命名与去重)
  const handleSaveImageToAssets = async () => {
    if (!generatedImgUrl) return;
    const attachmentStore = useProjectStore.getState().getAttachmentStore();
    const saved = await attachmentStore.save(imgPrompt.slice(0, 16) || 'AI 生成图片', generatedImgUrl);
    if (saved) {
      addAsset({
        ...saved,
        source: 'ai_generated'
      });
      showFeedback(`图片素材已保存至工程资产库 (${saved.id})`);
    }
  };

  // Apply image to currently selected element in canvas
  const handleApplyImageToSelected = (imgUrl: string) => {
    if (!activeScreenId || !selectedNode) {
      alert('请先在画板中点击选中一个图片 (img) 或容器元素');
      return;
    }
    const curScreen = screens[activeScreenId];
    if (!curScreen) return;

    try {
      const parsed = parseHtmlCopy(curScreen.htmlContent), doc = parsed.doc;
      const el = doc.querySelector(`[data-nid="${selectedNode.nid}"]`);
      if (!el) return;

      if (el.tagName.toLowerCase() === 'img') {
        el.setAttribute('src', imgUrl);
      } else {
        (el as HTMLElement).style.backgroundImage = `url(${imgUrl})`;
        (el as HTMLElement).style.backgroundSize = 'cover';
        (el as HTMLElement).style.backgroundPosition = 'center';
      }

      updateScreenHtml(activeScreenId, parsed.serialize(), `应用素材图片到 #${selectedNode.nid}`);
      showFeedback('素材图片已成功应用至选中元素');
    } catch (e) {
      console.error(e);
    }
  };

  // Handle local image file upload (MD5 命名与去重)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const attachmentStore = useProjectStore.getState().getAttachmentStore();

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (loadEvent) => {
        const result = loadEvent.target?.result as string;
        if (result) {
          const saved = await attachmentStore.save(file.name, result);
          if (saved) {
            addAsset(saved);
            showFeedback(`上传成功: ${file.name}`);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-slate-100 text-sm">
              工程资源与组件中心 (Assets & Components)
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none">
            ×
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950 px-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab('components')}
            className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'components'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Boxes className="w-3.5 h-3.5 text-indigo-400" />
            <span>组件库 (Components)</span>
            {repeatedCandidates.length > 0 && (
              <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px]">
                {repeatedCandidates.length} 建议
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('images')}
            className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'images'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>图片素材与生图 (Images)</span>
          </button>

          <button
            onClick={() => setActiveTab('icons')}
            className={`py-3 px-4 border-b-2 transition ${
              activeTab === 'icons'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            内置矢量图标 (Lucide)
          </button>

          <button
            onClick={() => setActiveTab('ai_svg')}
            className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'ai_svg'
                ? 'border-purple-500 text-purple-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>AI 矢量图标设计器</span>
          </button>
        </div>

        {/* Global Status Toast */}
        {statusMsg && (
          <div className="bg-indigo-950/90 border-b border-indigo-800/60 px-4 py-2 text-indigo-300 text-xs flex items-center justify-between">
            <span>{statusMsg}</span>
            <button onClick={() => setStatusMsg(null)} className="text-indigo-400 hover:text-indigo-200">×</button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 p-6 overflow-y-auto text-xs space-y-6">
          {/* TAB 1: Components (PRD §3.7) */}
          {activeTab === 'components' && (
            <div className="space-y-5">
              {/* Repeated Structure Candidate Detection Banner */}
              {repeatedCandidates.length > 0 && (
                <div className="p-4 bg-indigo-950/30 border border-indigo-800/40 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span className="font-semibold text-indigo-200 text-xs">
                        智能结构指纹检测：发现 {repeatedCandidates.length} 处高度复用结构
                      </span>
                    </div>
                    <span className="text-[11px] text-indigo-300/70">PRD §3.7.1 自动重复识别</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {repeatedCandidates.map((cand, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-950/70 border border-indigo-800/40 rounded-xl flex items-center justify-between"
                      >
                        <div className="space-y-1 truncate pr-2">
                          <span className="font-semibold text-slate-200 block truncate">{cand.suggestedName}</span>
                          <span className="text-[10px] text-indigo-400 block font-mono">
                            跨画板重复 {cand.count} 次
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const id = createComponent(cand.suggestedName, cand.templateHtml, '由结构指纹检测自动提取');
                            showFeedback(`已将结构提取为工程组件「${cand.suggestedName}」`);
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium whitespace-nowrap transition"
                        >
                          提取为组件
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Defined Components List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300 text-xs">
                    当前工程组件库 ({Object.keys(components).length})
                  </span>
                  <span className="text-[11px] text-slate-500">
                    在检查器选中任意元素点击「提取为组件」亦可快速添加
                  </span>
                </div>

                {Object.keys(components).length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                    <Boxes className="w-8 h-8 text-slate-600 mb-1" />
                    <span className="font-medium text-slate-400">暂无已封装的工程组件</span>
                    <p className="text-[11px] max-w-sm leading-relaxed">
                      在画板中点选任何按钮、卡片或导航栏，通过右侧属性面板「提取为组件」即可建立同步组。
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.values(components).map((comp) => (
                      <div
                        key={comp.id}
                        className="p-4 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200 text-xs truncate">{comp.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">#{comp.id.slice(0, 8)}</span>
                          </div>
                          <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-400 max-h-16 overflow-hidden select-none">
                            {comp.templateHtml.slice(0, 140)}...
                          </div>
                        </div>

                        <ComponentContractEditor component={comp}/>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-900 gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                if (activeScreenId) {
                                  insertComponent(activeScreenId, comp.id);
                                  showFeedback(`已向当前画板插入组件「${comp.name}」`);
                                } else {
                                  alert('请先在画板上激活一个页面');
                                }
                              }}
                              className="px-2.5 py-1 bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg text-[11px] font-medium transition"
                            >
                              插入当前画板
                            </button>
                            <button
                              onClick={() => {
                                const res = syncComponentInstances(comp.id);
                                if (res.skippedConflictCount > 0) {
                                  showFeedback(`已同步 ${res.syncedCount} 处；跳过 ${res.skippedConflictCount} 处实例。${res.details[0]??'无法安全保留用户内容。'}`);
                                } else {
                                  showFeedback(`已成功批量同步 ${res.syncedCount} 处实例`);
                                }
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] transition"
                            >
                              批量同步
                            </button>
                          </div>
                          <button
                            onClick={() => {
                              if (confirm(`确认删除组件「${comp.name}」？已有画板实例将转为独立节点。`)) {
                                deleteComponent(comp.id);
                              }
                            }}
                            className="p-1 text-slate-500 hover:text-red-400 transition"
                            disabled={libraryMemberLocked({designLibraryBinding},'components',comp.id)}
                            title={libraryMemberLocked({designLibraryBinding},'components',comp.id)?'设计库参考只读，请先转为项目副本':'删除组件'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Images & AI Image Generator (PRD §3.4.1) */}
          {activeTab === 'images' && (
            <div className="space-y-6">
              {/* AI Image Generator Section */}
              <div className="p-4 bg-blue-950/20 border border-blue-800/40 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <span className="font-semibold text-blue-200">AI 原生高清图像生成 (Image Generator)</span>
                  </div>
                  <span className="text-[11px] text-blue-300/70">PRD §3.4.1 自动落盘与复用</span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={imgPrompt}
                      onChange={(e) => setImgPrompt(e.target.value)}
                      placeholder="描述要生成的图片概念，例如：商业数据看板背景、极简立体插图..."
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleGenerateAiImage();
                      }}
                    />
                    <button
                      onClick={handleGenerateAiImage}
                      disabled={isImgGenerating || !imgPrompt.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium rounded-xl transition shadow flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>{isImgGenerating ? '合成中...' : '生成图片'}</span>
                    </button>
                  </div>

                  {/* Style & Aspect Ratio Controls */}
                  <div className="flex items-center gap-4 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span>风格预设:</span>
                      {(['3d', 'photo', 'vector', 'flat'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setImgStyle(st)}
                          className={`px-2 py-0.5 rounded transition ${
                            imgStyle === st ? 'bg-blue-600 text-white font-medium' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {st === '3d' ? '3D 立体' : st === 'photo' ? '摄影光影' : st === 'vector' ? '矢量概念' : '扁平 UI'}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span>比例:</span>
                      {(['16:9', '1:1', '4:3', '9:16'] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => setImgRatio(r)}
                          className={`px-2 py-0.5 rounded transition ${
                            imgRatio === r ? 'bg-blue-600 text-white font-medium' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Generated Preview */}
                {generatedImgUrl && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-300">生成图片预览</span>
                      <span className="text-[10px] text-slate-500 font-mono">PNG 24bit · In-Memory DataURL</span>
                    </div>

                    <div className="w-full max-h-48 overflow-hidden rounded-lg border border-slate-800 flex items-center justify-center bg-slate-900">
                      <img src={generatedImgUrl} alt="Generated Asset" className="max-h-48 object-contain" />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => handleApplyImageToSelected(generatedImgUrl)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition"
                      >
                        应用到当前选中元素
                      </button>
                      <button
                        onClick={handleSaveImageToAssets}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg text-xs transition"
                      >
                        保存入工程素材库
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Local File Upload Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer bg-slate-950/40 transition"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  accept="image/*"
                  className="hidden"
                />
                <Upload className="w-6 h-6 text-slate-500 mb-2" />
                <span className="font-semibold text-slate-300">点击或拖拽上传本地图片 (JPG, PNG, WebP, SVG)</span>
                <span className="text-[11px] text-slate-500 mt-1">
                  自动写入工程资产库并赋予 data-asset-id，支持全画板批量更新
                </span>
              </div>

              {/* Project Asset Gallery */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300 text-xs">
                    工程图片资产列表 ({Object.keys(assets).length})
                  </span>
                  {Object.keys(assets).length > 0 && (
                    <button
                      onClick={() => {
                        const cleaned = cleanupUnusedAssets();
                        showFeedback(`已清理 ${cleaned} 个无引用图片素材`);
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-200"
                    >
                      清理未引用素材
                    </button>
                  )}
                </div>

                {Object.keys(assets).length === 0 ? (
                  <span className="text-slate-500 block text-center py-4">暂无工程图片素材</span>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.values(assets).map((ast) => (
                      <div
                        key={ast.id}
                        className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 flex flex-col justify-between"
                      >
                        <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center border border-slate-800/80">
                          {ast.relPath ? (
                            <AssetPreviewImage asset={ast} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-slate-600" />
                          )}
                        </div>
                        <div className="truncate">
                          <span className="font-medium text-slate-200 truncate block text-[11px]">{ast.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">#{ast.id.slice(0, 8)}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                          <button
                            onClick={() => handleApplyImageToSelected(ast.relPath)}
                            className="text-[10px] text-blue-400 hover:text-blue-300"
                          >
                            选用
                          </button>
                          <button
                            onClick={() => {
                              const newUrl = prompt('请输入新素材图片的 URL 或 DataURL 以执行全工程替换:');
                              if (newUrl) {
                                const cnt = replaceAssetGlobally(ast.id, newUrl);
                                showFeedback(`已全局替换 ${cnt} 处引用此素材的画板位置`);
                              }
                            }}
                            className="text-[10px] text-slate-400 hover:text-slate-200"
                          >
                            全局替换
                          </button>
                          <button
                            disabled={libraryMemberLocked({designLibraryBinding},'assets',ast.id)} title={libraryMemberLocked({designLibraryBinding},'assets',ast.id)?'设计库参考只读，请先转为项目副本':'删除素材'}
                            onClick={() => removeAsset(ast.id)}
                            className="text-slate-500 hover:text-red-400 p-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Lucide Icons */}
          {activeTab === 'icons' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="搜索图标名称（如 user, shield, star 或中文标签）..."
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                {filteredIcons.map((item) => {
                  const IconComp = item.icon;
                  const isCopied = copiedKey === item.name;
                  return (
                    <div
                      key={item.name}
                      onClick={() => handleCopySvg(item.svg, item.name)}
                      className="p-3 bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl cursor-pointer transition flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-blue-400 group-hover:text-blue-300">
                          <IconComp className="w-4 h-4" />
                        </div>
                        <span className="text-slate-200 truncate">{item.label}</span>
                      </div>
                      <button className="text-slate-500 group-hover:text-slate-300">
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: AI Vector Icon Generator */}
          {activeTab === 'ai_svg' && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-950/30 border border-purple-800/40 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="font-semibold text-purple-200">AI 原生矢量图标生成</span>
                </div>
                <p className="text-[11px] text-purple-300/80 leading-relaxed">
                  通过大模型强大的 SVG 语法能力直接生成干净的 24×24 矢量代码，颜色自动绑定当前工程 Token。
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={aiIconPrompt}
                    onChange={(e) => setAiIconPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleGenerateAiSvg();
                    }}
                    placeholder="输入图标概念，例如：量子芯片计算核心、带对勾的认证勋章..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500 text-xs"
                  />
                  <button
                    onClick={handleGenerateAiSvg}
                    disabled={isAiGenerating || !aiIconPrompt.trim()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-medium rounded-xl transition shadow"
                  >
                    {isAiGenerating ? '生成中...' : '生成图标'}
                  </button>
                </div>
              </div>

              {generatedSvg && (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <span className="font-semibold text-slate-300 block">实时矢量预览与生成代码</span>
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-purple-400 p-3 shadow-inner">
                      <svg
                        className="w-full h-full"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        dangerouslySetInnerHTML={{ __html: generatedSvg }}
                      />
                    </div>
                    <div className="flex-1 col gap-2">
                      <pre className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-400 max-h-20 overflow-auto">
                        {generatedSvg}
                      </pre>
                      <button
                        onClick={() => handleCopySvg(generatedSvg, 'ai-gen')}
                        className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                      >
                        {copiedKey === 'ai-gen' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'ai-gen' ? '已复制完整 SVG' : '复制矢量 SVG 代码'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-xs transition">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
