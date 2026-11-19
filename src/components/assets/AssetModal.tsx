import {ComponentContractEditor} from './ComponentContractEditor';
import {libraryMemberLocked} from '../../services/ai/designLibraryReference';
import React, { useEffect, useState, useRef } from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { useAIConfigStore } from '../../stores/useAIConfigStore';
import {createAIEngineCore} from '../../services/ai/engine/core';
import {generateIconSvg} from '../../services/ai/iconSvgGeneration';
import {saveProjectIcon} from '../../services/ai/projectIconAsset';
import {mediaReferenceIssue} from '../../services/ai/externalMedia';
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
  Library,
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
import { listActiveBuiltinMotherMeta } from '../../reference-pages/builtinMetaIndex';
import { saveActiveScreenAsProjectMother } from '../../reference-pages/saveMother';
import { createProjectStorage } from '../../services/storage/projectStorage';
import type { MotherPageMeta } from '../../reference-pages/types';
import { useT } from '../../stores/useLocaleStore';

interface AssetModalProps {
  onClose: () => void;
}

const BUILTIN_LUCIDE_ICONS = [
  { name: 'user', labelKey: 'assets.builtinIconUser', icon: User, svg: '<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' },
  { name: 'shield', labelKey: 'assets.builtinIconShield', icon: Shield, svg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
  { name: 'star', labelKey: 'assets.builtinIconStar', icon: Star, svg: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
  { name: 'lock', labelKey: 'assets.builtinIconLock', icon: Lock, svg: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' },
  { name: 'clock', labelKey: 'assets.builtinIconClock', icon: Clock, svg: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
  { name: 'bell', labelKey: 'assets.builtinIconBell', icon: Bell, svg: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>' },
  { name: 'mail', labelKey: 'assets.builtinIconMail', icon: Mail, svg: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>' },
  { name: 'activity', labelKey: 'assets.builtinIconActivity', icon: Activity, svg: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
  { name: 'settings', labelKey: 'assets.builtinIconSettings', icon: Settings, svg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
  { name: 'database', labelKey: 'assets.builtinIconDatabase', icon: Database, svg: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>' },
  { name: 'server', labelKey: 'assets.builtinIconServer', icon: Server, svg: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>' },
  { name: 'zap', labelKey: 'assets.builtinIconZap', icon: Zap, svg: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' }
] as const;

export const AssetModal: React.FC<AssetModalProps> = ({ onClose }) => {
  const t = useT();
  const [activeTab, setActiveTab] = useState<'components' | 'images' | 'icons' | 'ai_svg' | 'mothers'>('components');
  const [iconSearch, setIconSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [builtinMothers] = useState<MotherPageMeta[]>(() => listActiveBuiltinMotherMeta());
  const [savingMother, setSavingMother] = useState(false);

  // Store Hooks
  const {
    id:projectId,
    folderPath,
    screens,
    activeScreenId,
    settings,
    components,
    designLibraryBinding,
    assets,
    selectedNode,
    createComponent,
    insertComponent,
    deleteComponent,
    syncComponentInstances,
    removeAsset,
    replaceAssetGlobally,
    cleanupUnusedAssets,
    updateScreenHtml
  } = useProjectStore();

  const { getActiveProviderForRole } = useAIConfigStore();

  // AI Image Generator State
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgStyle, setImgStyle] = useState<'3d' | 'photo' | 'vector' | 'flat'>('3d');
  const [imgRatio, setImgRatio] = useState<'1:1' | '16:9' | '4:3' | '9:16'>('16:9');
  const [generatedImgUrl, setGeneratedImgUrl] = useState<string | null>(null);
  const [isImgGenerating, setIsImgGenerating] = useState(false);

  // AI Vector Icon State
  const [aiIconPrompt, setAiIconPrompt] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null);
  const svgJob=useRef<AbortController|null>(null);
  const assetJob=useRef<AbortController|null>(null);
  useEffect(()=>{setGeneratedSvg(null);setGeneratedImgUrl(null);setIsAiGenerating(false);setImgPrompt(t('assets.defaultImagePrompt'));return()=>{svgJob.current?.abort();assetJob.current?.abort();svgJob.current=null;assetJob.current=null;};},[projectId,t]);

  // Notification / Feedback msg
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scan repeated structural components (PRD §3.7.1)
  const repeatedCandidates = ComponentDetector.detectRepeatedStructures(screens, 2);

  const showFeedback = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleSaveActiveScreenAsMother = async () => {
    if (!activeScreenId) {
      showFeedback(t('assets.toastSelectFrameFirst'));
      return;
    }
    const screen = screens[activeScreenId];
    if (!screen?.htmlContent) {
      showFeedback(t('assets.toastNoHtmlToSave'));
      return;
    }
    const device = (settings?.deviceProfile === 'mobile' ? 'mobile' : 'pc') as 'pc' | 'mobile';
    setSavingMother(true);
    try {
      const storage = createProjectStorage(projectId, folderPath);
      const result = await saveActiveScreenAsProjectMother(storage, {
        bodyHtml: screen.htmlContent,
        device,
        title: screen.name || activeScreenId
      });
      if (!result.ok) {
        const detail = result.ingest.issues[0]?.message ?? result.error ?? t('assets.toastSaveFailed');
        showFeedback(t('assets.toastMotherSaveFailed', { detail }));
        return;
      }
      showFeedback(t('assets.toastMotherSaved', { id: result.mother?.meta.id ?? '' }));
    } catch (error) {
      showFeedback(
        t('assets.toastMotherSaveFailedError', {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSavingMother(false);
    }
  };

  // Filter Lucide icons
  const filteredIcons = BUILTIN_LUCIDE_ICONS.filter((i) => {
    const q = iconSearch.toLowerCase();
  return i.name.toLowerCase().includes(q) || t(i.labelKey).toLowerCase().includes(q);
  });

  const handleCopySvg = async (svgContent: string, key: string) => {
    if(assetJob.current)return;const job=new AbortController();assetJob.current=job;
    try{
      const {reference}=await saveProjectIcon(svgContent,key==='ai-gen'?aiIconPrompt:key,key==='ai-gen'?'ai_generated':'builtin',job.signal);
      if(job.signal.aborted||useProjectStore.getState().id!==projectId)return;
      await navigator.clipboard.writeText(reference);setCopiedKey(key);showFeedback(t('assets.toastIconSavedCopied'));
      setTimeout(() => setCopiedKey(null), 2000);
    }catch(error){if(!job.signal.aborted)showFeedback(error instanceof Error?error.message:t('assets.toastIconSaveCopyFailed'));}
    finally{if(assetJob.current===job)assetJob.current=null;}
  };

  // Generate AI SVG Icon
  const handleGenerateAiSvg = async () => {
    if(!aiIconPrompt.trim()||svgJob.current)return;
    const binding=getActiveProviderForRole('code');
    if(!binding?.provider||(!binding.provider.apiKey&&binding.provider.protocol!=='ollama_native')){showFeedback(t('assets.toastConfigureCodeModel'));return;}
    const job=new AbortController();svgJob.current=job;setIsAiGenerating(true);setGeneratedSvg('');
    try {
      const svg=await generateIconSvg(createAIEngineCore(),{provider:binding.provider,model:binding.modelId},aiIconPrompt,job.signal);
      if(!job.signal.aborted&&useProjectStore.getState().id===projectId)setGeneratedSvg(svg);
    }catch(error){if(!job.signal.aborted)showFeedback(error instanceof Error?error.message:t('assets.toastIconGenerateFailed'));}
    finally{if(svgJob.current===job){svgJob.current=null;setIsAiGenerating(false);}}
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
    const state=useProjectStore.getState(),attachmentStore = state.getAttachmentStore();
    const saved = await attachmentStore.save(imgPrompt.slice(0, 16) || t('assets.aiGeneratedImageName'), generatedImgUrl);
    const current=useProjectStore.getState();
    if (saved&&current.id===projectId&&current.folderPath===state.folderPath) {
      current.addAsset({
        ...saved,
        source: 'ai_generated'
      });
      showFeedback(t('assets.toastImageSavedToLibrary', { id: saved.id }));
    }
  };

  // Apply image to currently selected element in canvas
  const handleApplyImageToSelected = async (imgUrl: string) => {
    if (!activeScreenId || !selectedNode) {
      alert(t('assets.alertSelectImageOrContainer'));
      return;
    }
    try {
      const initial=useProjectStore.getState(),source=initial.screens[activeScreenId],nid=selectedNode.nid;
      if(!source)return;
      if(imgUrl.startsWith('data:')){
        const saved=await initial.getAttachmentStore().save(imgPrompt.slice(0,16)||t('assets.generatedImageShortName'),imgUrl);
        if(!saved)throw Error(t('assets.errImageNotSaved'));
        const current=useProjectStore.getState();if(current.id!==projectId||current.folderPath!==initial.folderPath||current.screens[activeScreenId]?.htmlContent!==source.htmlContent||current.selectedNode?.nid!==nid)throw Error(t('assets.errProjectChangedNoApply'));
        if(!Object.values(current.assets).some(a=>a.relPath===saved.relPath))current.addAsset({...saved,source:'ai_generated'});
        imgUrl=saved.relPath;
      }
      if(mediaReferenceIssue(imgUrl)||imgUrl.startsWith('assets/')&&!Object.values(useProjectStore.getState().assets).some(a=>a.relPath===imgUrl))throw Error(t('assets.errUseRegisteredAsset'));
      const curScreen=useProjectStore.getState().screens[activeScreenId];
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
      showFeedback(t('assets.toastImageApplied'));
    } catch (e) {
      showFeedback(e instanceof Error?e.message:t('assets.toastImageApplyFailed'));
    }
  };

  // Handle local image file upload (MD5 命名与去重)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const initial=useProjectStore.getState(),attachmentStore = initial.getAttachmentStore();

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (loadEvent) => {
        const result = loadEvent.target?.result as string;
        if (result) {
          const saved = await attachmentStore.save(file.name, result);
          const current=useProjectStore.getState();
          if (saved&&current.id===projectId&&current.folderPath===initial.folderPath) {
            current.addAsset(saved);
            showFeedback(t('assets.toastUploadSuccess', { name: file.name }));
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
              {t('assets.title')}
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
            <span>{t('assets.tabComponents')}</span>
            {repeatedCandidates.length > 0 && (
              <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px]">
                {t('assets.suggestions', { count: repeatedCandidates.length })}
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
            <span>{t('assets.tabImages')}</span>
          </button>

          <button
            onClick={() => setActiveTab('icons')}
            className={`py-3 px-4 border-b-2 transition ${
              activeTab === 'icons'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('assets.tabIcons')}
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
            <span>{t('assets.tabAiSvg')}</span>
          </button>

          <button
            onClick={() => setActiveTab('mothers')}
            className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'mothers'
                ? 'border-emerald-500 text-emerald-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Library className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t('assets.tabMothers')}</span>
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
                        {t('assets.fingerprintTitle', { count: repeatedCandidates.length })}
                      </span>
                    </div>
                    <span className="text-[11px] text-indigo-300/70">{t('assets.fingerprintPrd')}</span>
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
                            {t('assets.repeatedAcrossFrames', { count: cand.count })}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            createComponent(cand.suggestedName, cand.templateHtml, t('assets.extractedByFingerprint'));
                            showFeedback(t('assets.toastExtractedComponent', { name: cand.suggestedName }));
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium whitespace-nowrap transition"
                        >
                          {t('assets.extractAsComponent')}
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
                    {t('assets.componentLibraryTitle', { count: Object.keys(components).length })}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {t('assets.extractViaInspectorHint')}
                  </span>
                </div>

                {Object.keys(components).length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                    <Boxes className="w-8 h-8 text-slate-600 mb-1" />
                    <span className="font-medium text-slate-400">{t('assets.emptyComponentsTitle')}</span>
                    <p className="text-[11px] max-w-sm leading-relaxed">
                      {t('assets.emptyComponentsBody')}
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
                                  showFeedback(t('assets.toastInsertedComponent', { name: comp.name }));
                                } else {
                                  alert(t('assets.alertActivatePageFirst'));
                                }
                              }}
                              className="px-2.5 py-1 bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg text-[11px] font-medium transition"
                            >
                              {t('assets.insertToActiveBoard')}
                            </button>
                            <button
                              onClick={() => {
                                const res = syncComponentInstances(comp.id);
                                if (res.skippedConflictCount > 0) {
                                  showFeedback(
                                    t('assets.toastSyncPartial', {
                                      synced: res.syncedCount,
                                      skipped: res.skippedConflictCount,
                                      detail: res.details[0] ?? t('assets.syncConflictFallback'),
                                    }),
                                  );
                                } else {
                                  showFeedback(t('assets.toastSyncSuccess', { count: res.syncedCount }));
                                }
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] transition"
                            >
                              {t('assets.syncBatch')}
                            </button>
                          </div>
                          <button
                            onClick={() => {
                              if (confirm(t('assets.deleteComponentConfirm', { name: comp.name }))) {
                                deleteComponent(comp.id);
                              }
                            }}
                            className="p-1 text-slate-500 hover:text-red-400 transition"
                            disabled={libraryMemberLocked({designLibraryBinding},'components',comp.id)}
                            title={libraryMemberLocked({designLibraryBinding},'components',comp.id)?t('assets.libraryReadonlyHint'):t('assets.deleteComponent')}
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
                    <span className="font-semibold text-blue-200">{t('assets.aiImageGeneratorTitle')}</span>
                  </div>
                  <span className="text-[11px] text-blue-300/70">{t('assets.aiImagePrd')}</span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={imgPrompt}
                      onChange={(e) => setImgPrompt(e.target.value)}
                      placeholder={t('assets.imagePromptPlaceholder')}
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
                      <span>{isImgGenerating ? t('assets.generatingImage') : t('assets.generateImage')}</span>
                    </button>
                  </div>

                  {/* Style & Aspect Ratio Controls */}
                  <div className="flex items-center gap-4 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span>{t('assets.stylePreset')}</span>
                      {(['3d', 'photo', 'vector', 'flat'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setImgStyle(st)}
                          className={`px-2 py-0.5 rounded transition ${
                            imgStyle === st ? 'bg-blue-600 text-white font-medium' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {st === '3d' ? t('assets.style3d') : st === 'photo' ? t('assets.stylePhoto') : st === 'vector' ? t('assets.styleVector') : t('assets.styleFlat')}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span>{t('assets.aspectRatio')}</span>
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
                      <span className="text-[11px] font-semibold text-slate-300">{t('assets.generatedPreview')}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{t('assets.generatedPreviewMeta')}</span>
                    </div>

                    <div className="w-full max-h-48 overflow-hidden rounded-lg border border-slate-800 flex items-center justify-center bg-slate-900">
                      <img src={generatedImgUrl} alt={t('assets.generatedAssetAlt')} className="max-h-48 object-contain" />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => handleApplyImageToSelected(generatedImgUrl)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition"
                      >
                        {t('assets.applyToSelected')}
                      </button>
                      <button
                        onClick={handleSaveImageToAssets}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg text-xs transition"
                      >
                        {t('assets.saveToLibrary')}
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
                <span className="font-semibold text-slate-300">{t('assets.uploadZoneTitle')}</span>
                <span className="text-[11px] text-slate-500 mt-1">
                  {t('assets.uploadZoneHint')}
                </span>
              </div>

              {/* Project Asset Gallery */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300 text-xs">
                    {t('assets.imageAssetListTitle', { count: Object.keys(assets).length })}
                  </span>
                  {Object.keys(assets).length > 0 && (
                    <button
                      onClick={() => {
                        const cleaned = cleanupUnusedAssets();
                        showFeedback(t('assets.toastCleanupUnused', { count: cleaned }));
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-200"
                    >
                      {t('assets.cleanupUnused')}
                    </button>
                  )}
                </div>

                {Object.keys(assets).length === 0 ? (
                  <span className="text-slate-500 block text-center py-4">{t('assets.noProjectImages')}</span>
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
                            {t('assets.useAsset')}
                          </button>
                          <button
                            onClick={() => {
                              const newUrl = prompt(t('assets.replaceGloballyPrompt'));
                              if (newUrl) {
                                try{const cnt = replaceAssetGlobally(ast.id, newUrl);showFeedback(t('assets.toastReplaceGlobally', { count: cnt }));}
                                catch(error){showFeedback(error instanceof Error?error.message:t('assets.toastReplaceAssetFailed'));}
                              }
                            }}
                            className="text-[10px] text-slate-400 hover:text-slate-200"
                          >
                            {t('assets.replaceGlobally')}
                          </button>
                          <button
                            disabled={libraryMemberLocked({designLibraryBinding},'assets',ast.id)}
                            title={libraryMemberLocked({designLibraryBinding},'assets',ast.id)?t('assets.libraryReadonlyHint'):t('assets.deleteAsset')}
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
                  placeholder={t('assets.searchIconsPlaceholder')}
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
                        <span className="text-slate-200 truncate">{t(item.labelKey)}</span>
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
                  <span className="font-semibold text-purple-200">{t('assets.aiSvgTitle')}</span>
                </div>
                <p className="text-[11px] text-purple-300/80 leading-relaxed">
                  {t('assets.aiSvgDescription')}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={aiIconPrompt}
                    onChange={(e) => setAiIconPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleGenerateAiSvg();
                    }}
                    placeholder={t('assets.aiIconPlaceholder')}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500 text-xs"
                  />
                  <button
                    onClick={handleGenerateAiSvg}
                    disabled={isAiGenerating || !aiIconPrompt.trim()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-medium rounded-xl transition shadow"
                  >
                    {isAiGenerating ? t('assets.generatingIcon') : t('assets.generateIcon')}
                  </button>
                </div>
              </div>

              {generatedSvg && (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <span className="font-semibold text-slate-300 block">{t('assets.vectorPreviewTitle')}</span>
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
                        <span>{copiedKey === 'ai-gen' ? t('assets.copiedIconRef') : t('assets.saveIconCopyRef')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: Mothers (E4c) — builtin read-only + save active screen as project-local */}
          {activeTab === 'mothers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Library className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-slate-200">{t('assets.mothersTitle')}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                    {t('assets.mothersDescription')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!activeScreenId || savingMother}
                  onClick={handleSaveActiveScreenAsMother}
                  className="shrink-0 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-xl text-[11px] font-medium transition"
                >
                  {savingMother ? t('assets.savingMother') : t('assets.saveMother')}
                </button>
              </div>

              {builtinMothers.length === 0 ? (
                <p className="text-[11px] text-slate-500 px-1 py-6 text-center">{t('assets.emptyBuiltinMothers')}</p>
              ) : (
                <div className="space-y-1.5 max-h-[48vh] overflow-y-auto pr-1">
                  {builtinMothers.map((meta) => (
                    <div
                      key={meta.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-slate-800 bg-slate-950/60"
                    >
                      <div className="min-w-0">
                        <div className="text-slate-200 font-medium truncate">{meta.id}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {meta.device} · {meta.pageKind}
                          {meta.aliases[0] ? ` · ${meta.aliases[0]}` : ''}
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-500">
                        {t('assets.readonly')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-xs transition">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
