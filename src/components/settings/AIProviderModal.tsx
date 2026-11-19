import {ModelCapacitySettings} from './ModelCapacitySettings';
import React, { useState } from 'react';
import { useAIConfigStore, THIRD_PARTY_PRESETS } from '../../stores/useAIConfigStore';
import { useUsageStore } from '../../stores/useUsageStore';
import { AIProviderConfig, ProviderProtocol, ThirdPartyPreset } from '../../types/provider';
import { AIService } from '../../services/ai/aiService';
import { ModelDiscoveryService } from '../../services/ai/modelDiscoveryService';
import { inferKnownModelCapability } from '../../services/ai/modelCapabilities';
import { supportsVision, detectModelCapabilities, DiscoveredModel } from '../../services/ai/engine/core/multimodalGuard';
import {
  BarChart3,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Eye,
  EyeOff,
  MessageSquare,
  Plus,
  RefreshCw,
  Server,
  FolderOpen,
  ShieldAlert,
  Sparkles,
  Trash2,
  XCircle
} from 'lucide-react';
import { QuickPromptsConfigPanel } from './QuickPromptsConfigPanel';
import { ProjectSettingsPanel } from './ProjectSettingsPanel';
import { useT } from '../../stores/useLocaleStore';

interface AIProviderModalProps {
  onClose: () => void;
  initialTab?: 'provider' | 'quick_prompts' | 'project';
}

export const AIProviderModal: React.FC<AIProviderModalProps> = ({ onClose, initialTab = 'provider' }) => {
  const t = useT();
  const [activeTab, setActiveTab] = useState<'provider' | 'quick_prompts' | 'project'>(initialTab);
  const { providers, bindings, addProvider, updateProvider, deleteProvider, setRoleBinding, setModelCapability, autoReferenceDesignRules, setAutoReferenceDesignRules } =
    useAIConfigStore();
  const { totalCalls, totalInputTokens, totalOutputTokens, totalEstimatedCostUsd, clearUsage } =
    useUsageStore();

  const [selectedProviderId, setSelectedProviderId] = useState<string>(providers[0]?.id || '');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<{ testing: boolean; success?: boolean; message?: string }>({
    testing: false
  });
  const [discoveredModelsMap, setDiscoveredModelsMap] = useState<Record<string, DiscoveredModel[]>>({});
  const [isDiscovering, setIsDiscovering] = useState(false);

  const curProvider = providers.find((p) => p.id === selectedProviderId) || providers[0];

  const getProviderModelId = (prov?: AIProviderConfig): string => {
    if (!prov) return 'deepseek-chat';
    if (prov.defaultModel) return prov.defaultModel;
    if (bindings.code.providerId === prov.id) return bindings.code.modelId;
    if (bindings.chat.providerId === prov.id) return bindings.chat.modelId;
    if (bindings.vision.providerId === prov.id) return bindings.vision.modelId;
    switch (prov.protocol) {
      case 'anthropic':
        return 'claude-3-5-sonnet-20241022';
      case 'gemini':
        return 'gemini-2.0-flash';
      case 'ollama_native':
        return 'qwen2.5-coder';
      case 'openai_compatible':
      default:
        return prov.id === 'prov-deepseek' ? 'deepseek-chat' : 'gpt-4o';
    }
  };

  const curModelId = getProviderModelId(curProvider);
  const isCurCode = bindings.code.providerId === curProvider?.id && bindings.code.modelId === curModelId;
  const isCurChat = bindings.chat.providerId === curProvider?.id && bindings.chat.modelId === curModelId;
  const isCurVision = bindings.vision.providerId === curProvider?.id && bindings.vision.modelId === curModelId;

  const handleModelChange = (newModelId: string) => {
    if (!curProvider) return;
    updateProvider(curProvider.id, { defaultModel: newModelId });
  };

  const handleSetAsCode = (modelIdToSet = curModelId.trim()) => {
    if (!curProvider || !modelIdToSet) return;
    setRoleBinding('code', {
      role: 'code',
      providerId: curProvider.id,
      modelId: modelIdToSet
    });
  };

  const handleSetAsChat = (modelIdToSet = curModelId.trim()) => {
    if (!curProvider || !modelIdToSet) return;
    setRoleBinding('chat', {
      role: 'chat',
      providerId: curProvider.id,
      modelId: modelIdToSet
    });
  };

  const handleSetAsVision = (modelIdToSet = curModelId.trim()) => {
    if (!curProvider || !modelIdToSet) return;
    setRoleBinding('vision', {
      role: 'vision',
      providerId: curProvider.id,
      modelId: modelIdToSet
    });
    try {
      const existing = curProvider.modelCapabilities?.[modelIdToSet];
      if (!existing || existing.mediaInput !== 'unsupported') {
        const inferred = inferKnownModelCapability(curProvider, modelIdToSet);
        setModelCapability(curProvider.id, modelIdToSet, {
          ...(inferred ? { contextWindow: inferred.contextWindow, maxOutputTokens: inferred.maxOutputTokens } : {}),
          ...existing,
          mediaInput: 'native-part'
        });
      }
    } catch {
      // 容错处理：若 baseUrl 无效或端点错误不中断 UI 交互
    }
  };

  const handleSetAsBoth = (modelIdToSet = curModelId.trim()) => {
    if (!curProvider || !modelIdToSet) return;
    handleSetAsCode(modelIdToSet);
    handleSetAsChat(modelIdToSet);
  };

  const handleTestConnection = async () => {
    if (!curProvider) return;
    const modelToTest = curModelId.trim();
    if (!modelToTest) {
      setTestStatus({ testing: false, success: false, message: t('settings.testNeedModelId') });
      return;
    }
    if (!curProvider.apiKey && curProvider.protocol !== 'ollama_native') {
      setTestStatus({ testing: false, success: false, message: t('settings.testNeedApiKey') });
      return;
    }

    setTestStatus({ testing: true, message: t('settings.testingConnection') });
    const res = await AIService.testConnection(curProvider, modelToTest);
    setTestStatus({ testing: false, success: res.success, message: res.message });

    if (res.success) {
      // 连通成功后自动联动探测模型列表与能力标签
      fetchModels(curProvider).catch(() => {});
    }
  };

  const fetchModels = async (prov: AIProviderConfig, isManual = false) => {
    setIsDiscovering(true);
    if (isManual) {
      setTestStatus({ testing: true, message: t('settings.testDiscoveringModels') });
    }
    try {
      const res = await ModelDiscoveryService.discoverModels(prov);
      const visionCount = res.models.filter((m) => m.capabilities.includes('vision')).length;
      if (res.models.length > 0) {
        setDiscoveredModelsMap((prev) => ({
          ...prev,
          [prov.id]: res.models
        }));
        updateProvider(prov.id, {
          customModels: res.models.map((m) => m.id)
        });
        setTestStatus((prev) => ({
          testing: false,
          success: true,
          message: `${prev.message || t('settings.testConnectionSuccessFallback')}${t('settings.testDiscoverModelsAppend', { total: res.models.length, vision: visionCount })}`
        }));
      } else if (isManual) {
        setTestStatus({ testing: false, success: res.success, message: res.message });
      }
    } catch (e: any) {
      if (isManual) {
        setTestStatus({ testing: false, success: false, message: e.message || t('settings.testDiscoverModelsFailed') });
      }
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleDiscoverModels = async () => {
    if (!curProvider) return;
    if (!curProvider.apiKey && curProvider.protocol !== 'ollama_native') {
      setTestStatus({ testing: false, success: false, message: t('settings.testNeedApiKeyForDiscover') });
      return;
    }
    await fetchModels(curProvider, true);
  };

  const handleAddPreset = (preset: ThirdPartyPreset) => {
    const newId = `prov-custom-${Date.now()}`;
    const newProvider: AIProviderConfig = {
      id: newId,
      name: preset.name,
      protocol: preset.protocol,
      baseUrl: preset.baseUrl,
      apiKey: '',
      isEnabled: true,
      defaultModel: preset.defaultModel,
      isCustom: true
    };
    addProvider(newProvider);
    setSelectedProviderId(newId);
    setShowAddMenu(false);
    setTestStatus({ testing: false });
  };

  const handleDeleteProvider = (provId: string) => {
    if (!confirm(t('settings.confirmDeleteProvider'))) return;
    const remaining = providers.filter((p) => p.id !== provId);
    deleteProvider(provId);
    if (selectedProviderId === provId && remaining[0]) {
      setSelectedProviderId(remaining[0].id);
    }
    setTestStatus({ testing: false });
  };

  // Get suggested models for the current provider
  const getSuggestedModels = (): string[] => {
    if (!curProvider) return [];
    if (curProvider.id === 'prov-deepseek') {
      return ['deepseek-chat', 'deepseek-flash', 'deepseek-reasoner'];
    }
    if (curProvider.id === 'prov-openai') {
      return ['gpt-4o', 'gpt-4o-mini', 'o3-mini'];
    }
    if (curProvider.protocol === 'anthropic') {
      return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-7-sonnet-20250219'];
    }
    if (curProvider.protocol === 'gemini') {
      return ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    }
    if (curProvider.protocol === 'ollama_native') {
      return ['qwen2.5-coder', 'llama3.3', 'deepseek-r1:8b'];
    }
    // Check if matches any preset
    const preset = THIRD_PARTY_PRESETS.find((p) => p.name === curProvider.name);
    if (preset?.suggestedModels?.length) {
      return preset.suggestedModels;
    }
    return ['deepseek-chat', 'gpt-4o', 'claude-3-5-sonnet-20241022'];
  };

  const protocolTitle = (proto: ProviderProtocol): string => {
    switch (proto) {
      case 'openai_compatible':
        return t('settings.protocolOpenaiTitle');
      case 'anthropic':
        return t('settings.protocolAnthropicTitle');
      case 'gemini':
        return t('settings.protocolGeminiTitle');
      case 'ollama_native':
        return t('settings.protocolOllamaTitle');
    }
  };

  const protocolBlurb = (proto: ProviderProtocol): string => {
    switch (proto) {
      case 'openai_compatible':
        return t('settings.protocolOpenaiBlurb');
      case 'anthropic':
        return t('settings.protocolAnthropicBlurb');
      case 'gemini':
        return t('settings.protocolGeminiBlurb');
      case 'ollama_native':
        return t('settings.protocolOllamaBlurb');
    }
  };

  const activeCodeProv = providers.find((p) => p.id === bindings.code.providerId);
  const activeChatProv = providers.find((p) => p.id === bindings.chat.providerId);
  const activeVisionProv = providers.find((p) => p.id === bindings.vision.providerId);

  const currentDiscovered = discoveredModelsMap[curProvider?.id || ''];
  const displayModels: DiscoveredModel[] =
    currentDiscovered && currentDiscovered.length > 0
      ? currentDiscovered
      : curProvider?.customModels && curProvider.customModels.length > 0
      ? curProvider.customModels.map((id) => ({
          id,
          name: id,
          capabilities: detectModelCapabilities(curProvider, id)
        }))
      : getSuggestedModels().map((id) => ({
          id,
          name: id,
          capabilities: detectModelCapabilities(curProvider, id)
        }));

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <span className="font-semibold text-slate-100 text-sm hidden sm:inline">
              {t('header.settings')}
            </span>
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button type="button" onClick={() => setActiveTab('project')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${activeTab === 'project'
                  ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'}`}>
                <FolderOpen className="w-3.5 h-3.5" />
                <span>{t('settings.title')}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('provider')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === 'provider'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>{t('settings.tabProvider')}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('quick_prompts')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === 'quick_prompts'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('settings.tabQuickPrompts')}</span>
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none p-1" aria-label={t('common.close')}>
            ×
          </button>
        </div>

        {activeTab==='provider'&&<label className="mx-4 my-3 flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
          <input type="checkbox" aria-label={t('settings.autoDesignRulesAria')} className="mt-0.5 shrink-0 accent-blue-500" checked={autoReferenceDesignRules} onChange={event=>setAutoReferenceDesignRules(event.target.checked)} />
          <span className="min-w-0"><span className="font-medium">{t('settings.autoDesignRules')}</span>
            <span className="mt-1 block leading-relaxed text-slate-400">{t('settings.autoDesignRulesHint')}</span></span>
        </label>}
        {activeTab === 'project' ? (
          <ProjectSettingsPanel />
        ) : activeTab === 'quick_prompts' ? (
          <QuickPromptsConfigPanel />
        ) : (
          /* Content Layout */
          <div className="flex-1 flex overflow-hidden text-xs">
          {/* Provider Sidebar List */}
          <div className="w-72 border-r border-slate-800 bg-slate-950 p-3 flex flex-col overflow-hidden flex-shrink-0">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {t('settings.providerList')}
              </span>
              <div className="relative">
                <button
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-medium text-[11px] border border-blue-500/30 transition shrink-0"
                  title={t('settings.addThirdPartyTitle')}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('settings.addThirdParty')}</span>
                </button>

                {/* Add Preset Dropdown Menu */}
                {showAddMenu && (
                  <div className="absolute right-0 top-7 z-20 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 px-2 py-1 block">
                      {t('settings.pickPreset')}
                    </span>
                    {THIRD_PARTY_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleAddPreset(p)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-800 transition flex flex-col gap-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[11px] text-blue-300">{p.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0 whitespace-nowrap">
                            {p.protocol === 'anthropic' ? 'Claude' : 'OpenAI'}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 line-clamp-1">{p.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Provider Buttons Scroll Area */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {providers.map((prov) => {
                const isCode = bindings.code.providerId === prov.id;
                const isChat = bindings.chat.providerId === prov.id;
                const isVision = bindings.vision.providerId === prov.id;
                const isSelected = curProvider?.id === prov.id;

                return (
                  <button
                    key={prov.id}
                    onClick={() => {
                      setSelectedProviderId(prov.id);
                      setTestStatus({ testing: false });
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between gap-2 group ${
                      isSelected
                        ? 'bg-blue-600 text-white font-medium shadow'
                        : 'text-slate-300 hover:bg-slate-850 hover:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="truncate text-xs">{prov.name}</span>
                      {prov.isCustom && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0 whitespace-nowrap ${
                            isSelected
                              ? 'bg-blue-700 text-blue-100 border border-blue-400/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700/60'
                          }`}
                        >
                          {t('settings.thirdPartyBadge')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isCode && isChat ? (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap ${
                            isSelected ? 'bg-blue-700 text-white' : 'bg-blue-500/20 text-blue-300'
                          }`}
                          title={t('settings.primaryBothRolesTitle')}
                        >
                          {t('settings.primaryBadge')}
                        </span>
                      ) : (
                        <>
                          {isCode && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap ${
                                isSelected ? 'bg-blue-700 text-white' : 'bg-blue-500/20 text-blue-300'
                              }`}
                              title={t('settings.roleCode')}
                            >
                              {t('settings.roleCodeShort')}
                            </span>
                          )}
                          {isChat && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap ${
                                isSelected ? 'bg-emerald-700 text-white' : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                              title={t('settings.roleChat')}
                            >
                              {t('settings.roleChatShort')}
                            </span>
                          )}
                        </>
                      )}
                      {isVision && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap ${
                            isSelected ? 'bg-purple-700 text-white' : 'bg-purple-500/20 text-purple-300'
                          }`}
                          title={t('settings.roleVision')}
                        >
                          Vision
                        </span>
                      )}
                      {prov.apiKey && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Model Role Bindings Summary & Quick Assignment */}
            <div className="pt-3 mt-3 border-t border-slate-800 space-y-1.5 flex-shrink-0">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 block">
                {t('settings.capacityAssign')}
              </span>
              <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                {/* Code generation slot */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Code2 className="w-3 h-3 text-blue-400" />
                      <span>{t('settings.roleCode')}</span>
                    </span>
                    {isCurCode ? (
                      <span className="text-[9px] text-blue-400 font-medium bg-blue-500/10 px-1 py-0.2 rounded">{t('settings.currentlySelected')}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetAsCode()}
                        className="text-[9px] text-blue-400 hover:text-blue-300 underline font-medium"
                        title={t('settings.assignCurrentCodeTitle')}
                      >
                        {t('settings.assignCurrent')}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-blue-400 truncate block font-mono text-xs max-w-[130px]">
                      {bindings.code.modelId}
                    </span>
                    <span className="text-slate-500 font-mono text-[9px] truncate max-w-[80px]">
                      {activeCodeProv?.name || t('settings.unspecified')}
                    </span>
                  </div>
                </div>

                {/* Chat & reasoning slot */}
                <div className="border-t border-slate-800/60 pt-1.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-emerald-400" />
                      <span>{t('settings.roleChat')}</span>
                    </span>
                    {isCurChat ? (
                      <span className="text-[9px] text-emerald-400 font-medium bg-emerald-500/10 px-1 py-0.2 rounded">{t('settings.currentlySelected')}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetAsChat()}
                        className="text-[9px] text-emerald-400 hover:text-emerald-300 underline font-medium"
                        title={t('settings.assignCurrentChatTitle')}
                      >
                        {t('settings.assignCurrent')}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-emerald-300 truncate block font-mono text-xs max-w-[130px]">
                      {bindings.chat.modelId}
                    </span>
                    <span className="text-slate-500 font-mono text-[9px] truncate max-w-[80px]">
                      {activeChatProv?.name || t('settings.unspecified')}
                    </span>
                  </div>
                </div>

                {/* Vision slot */}
                <div className="border-t border-slate-800/60 pt-1.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Eye className="w-3 h-3 text-purple-400" />
                      <span>{t('settings.roleVision')}</span>
                    </span>
                    {isCurVision ? (
                      <span className="text-[9px] text-purple-400 font-medium bg-purple-500/10 px-1 py-0.2 rounded">{t('settings.currentlySelected')}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetAsVision()}
                        className="text-[9px] text-purple-400 hover:text-purple-300 underline font-medium"
                        title={t('settings.assignCurrentVisionTitle')}
                      >
                        {t('settings.assignCurrent')}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-purple-400 truncate block font-mono text-xs max-w-[130px]">
                      {bindings.vision.modelId}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500 font-mono text-[9px] truncate max-w-[60px]">
                        {activeVisionProv?.name || t('settings.unspecified')}
                      </span>
                      {activeVisionProv?.apiKey || activeVisionProv?.protocol === 'ollama_native' ? (
                        <span className="text-[8px] text-emerald-400 font-sans">{t('settings.ready')}</span>
                      ) : (
                        <span className="text-[8px] text-amber-400 font-sans">{t('settings.missingKey')}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Token & Cost Usage Dashboard (PRD §3.1.4) */}
            <div className="pt-3 mt-3 border-t border-slate-800 space-y-1.5 flex-shrink-0">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <BarChart3 className="w-3 h-3 text-emerald-400" />
                  <span>{t('settings.usageTitle')}</span>
                </span>
                {totalCalls > 0 && (
                  <button onClick={clearUsage} className="text-[10px] text-slate-500 hover:text-slate-300">
                    {t('settings.resetUsage')}
                  </button>
                )}
              </div>
              <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">{t('settings.callFrequency')}</span>
                  <span className="font-mono font-semibold text-slate-200">{t('settings.callTimes', { count: totalCalls })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">{t('settings.totalTokens')}</span>
                  <span className="font-mono font-semibold text-blue-400">
                    {Math.round((totalInputTokens + totalOutputTokens) / 1000)}k
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-800 pt-1">
                  <span className="text-[10px] text-slate-400">{t('settings.estimatedCost')}</span>
                  <span className="font-mono font-bold text-emerald-400">${totalEstimatedCostUsd}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Configuration Form */}
          <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-slate-900">
            {curProvider ? (
              <>
                {/* Header with Title, Role Assignment, and Delete Action */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    {curProvider.isCustom ? (
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <input
                          type="text"
                          value={curProvider.name}
                          onChange={(e) => updateProvider(curProvider.id, { name: e.target.value })}
                          className="text-base font-bold text-slate-100 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500 font-sans w-full sm:w-auto sm:min-w-[200px] sm:max-w-xs shadow-sm"
                          placeholder={t('settings.providerNamePlaceholder')}
                        />
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium shrink-0 whitespace-nowrap">
                          {t('settings.customThirdPartyBadge')}
                        </span>
                        <button
                          onClick={() => handleDeleteProvider(curProvider.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 transition shrink-0 ml-1"
                          title={t('settings.deleteCustomProviderTitle')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-100">{curProvider.name}</h3>
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium shrink-0 whitespace-nowrap">
                          {t('settings.builtinProviderBadge')}
                        </span>
                      </div>
                    )}
                    <p className="text-slate-400 text-[11px]">{t('settings.providerDetailIntro')}</p>
                  </div>

                  <div data-testid="header-role-actions" className="flex items-center gap-1.5 flex-wrap shrink-0 justify-start sm:justify-end">
                    {/* Code Model Assignment */}
                    {isCurCode ? (
                      <span
                        className="px-2.5 py-1.5 rounded-xl bg-blue-500/20 text-blue-300 text-xs font-medium border border-blue-500/30 flex items-center gap-1 shadow-sm shrink-0 whitespace-nowrap"
                        title={t('settings.headerCodeSlotActiveTitle')}
                      >
                        <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{t('settings.headerCodeSlotActive')}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetAsCode()}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-blue-900/40 text-blue-300 hover:text-blue-200 text-xs font-medium border border-slate-700 hover:border-blue-500/40 transition flex items-center gap-1 shrink-0 whitespace-nowrap"
                        title={t('settings.setAsCodeModelTitle')}
                      >
                        <Code2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{t('settings.setAsCodeModel')}</span>
                      </button>
                    )}

                    {/* Chat Model Assignment */}
                    {isCurChat ? (
                      <span
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs font-medium border border-emerald-500/30 flex items-center gap-1 shadow-sm shrink-0 whitespace-nowrap"
                        title={t('settings.headerChatSlotActiveTitle')}
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{t('settings.headerChatSlotActive')}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetAsChat()}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-900/40 text-emerald-300 hover:text-emerald-200 text-xs font-medium border border-slate-700 hover:border-emerald-500/40 transition flex items-center gap-1 shrink-0 whitespace-nowrap"
                        title={t('settings.setAsChatModelTitle')}
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{t('settings.setAsChatModel')}</span>
                      </button>
                    )}

                    {/* Vision Model Assignment */}
                    {isCurVision ? (
                      <span
                        className="px-2.5 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 text-xs font-medium border border-purple-500/30 flex items-center gap-1 shadow-sm shrink-0 whitespace-nowrap"
                        title={t('settings.headerVisionSlotActiveTitle')}
                      >
                        <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>{t('settings.headerVisionSlotActive')}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetAsVision()}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-purple-900/40 text-purple-300 hover:text-purple-200 text-xs font-medium border border-slate-700 hover:border-purple-500/40 transition flex items-center gap-1 shrink-0 whitespace-nowrap"
                        title={t('settings.setAsVisionModelTitle')}
                      >
                        <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>{t('settings.setAsVisionModel')}</span>
                      </button>
                    )}

                    {/* Quick Dual Assignment (Code & Chat) */}
                    {(!isCurCode || !isCurChat) && (
                      <button
                        type="button"
                        onClick={() => handleSetAsBoth()}
                        className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow flex items-center gap-1 shrink-0 whitespace-nowrap"
                        title={t('settings.setDualPrimaryTitle')}
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('settings.setDualPrimary')}</span>
                      </button>
                    )}
                  </div>
                </div>

                <ModelCapacitySettings key={JSON.stringify([curProvider.id,curProvider.protocol,curProvider.baseUrl,curModelId])} provider={curProvider} model={curModelId}/>

                {/* Protocol Selector */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold block">{t('settings.protocolSectionLabel')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['openai_compatible', 'anthropic', 'gemini', 'ollama_native'] as ProviderProtocol[]).map(
                      (proto) => {
                        const isSelected = curProvider.protocol === proto;
                        return (
                          <button
                            key={proto}
                            type="button"
                            onClick={() => {
                              updateProvider(curProvider.id, { protocol: proto });
                              // Auto suggest sensible default model if switching protocol
                              if (proto === 'anthropic' && curProvider.protocol !== 'anthropic') {
                                handleModelChange('claude-3-5-sonnet-20241022');
                              } else if (proto === 'openai_compatible' && curProvider.protocol !== 'openai_compatible') {
                                handleModelChange('deepseek-chat');
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-0.5 ${
                              isSelected
                                ? 'border-blue-500 bg-blue-950/40 text-blue-200 shadow-sm'
                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-xs text-slate-200">{protocolTitle(proto)}</span>
                              {isSelected && <span className="w-2 h-2 rounded-full bg-blue-400" />}
                            </div>
                            <span className="text-[10px] text-slate-500">{protocolBlurb(proto)}</span>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* API Base URL */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-semibold block">{t('settings.apiBaseUrlLabel')}</label>
                    <span className="text-[10px] text-slate-500">
                      {curProvider.protocol === 'openai_compatible' && t('settings.apiBaseUrlOpenaiSuffix')}
                      {curProvider.protocol === 'anthropic' && t('settings.apiBaseUrlAnthropicSuffix')}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={curProvider.baseUrl}
                    onChange={(e) => updateProvider(curProvider.id, { baseUrl: e.target.value })}
                    placeholder={
                      curProvider.protocol === 'anthropic'
                        ? t('settings.apiBaseUrlPlaceholderAnthropic')
                        : t('settings.apiBaseUrlPlaceholderDefault')
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                  />
                </div>

                {/* API Key */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-semibold block">{t('settings.apiKeyLabel')}</label>
                    <span className="text-[10px] text-slate-500">{t('settings.apiKeyPrivacyHint')}</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="sk-••••••••••••••••"
                      value={curProvider.apiKey}
                      onChange={(e) => updateProvider(curProvider.id, { apiKey: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 pr-10 text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition"
                      tabIndex={-1}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Model ID Binding */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-slate-300 font-semibold block">{t('settings.modelIdLabel')}</label>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSetAsCode()}
                        className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 transition shrink-0 whitespace-nowrap"
                        title={t('settings.modelAssignCodeTitle')}
                      >
                        <Code2 className="w-3 h-3" />
                        <span>{t('settings.modelAssignCode')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetAsChat()}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 transition shrink-0 whitespace-nowrap"
                        title={t('settings.modelAssignChatTitle')}
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>{t('settings.modelAssignChat')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetAsVision()}
                        className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 transition shrink-0 whitespace-nowrap"
                        title={t('settings.modelAssignVisionTitle')}
                      >
                        <Eye className="w-3 h-3" />
                        <span>{t('settings.modelAssignVision')}</span>
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={curModelId}
                    onChange={(e) => handleModelChange(e.target.value)}
                    placeholder={t('settings.modelIdPlaceholder')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                  />

                  {/* Discovered & Suggested Model Chips with Capability Badges (BR-MD-01 ~ BR-MD-03) */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
                        <span>
                          {currentDiscovered
                            ? t('settings.discoveredModelsHeader', { count: currentDiscovered.length })
                            : t('settings.suggestedModelsHeader')}
                        </span>
                        <span className="text-slate-500 font-normal">{t('settings.modelChipsHint')}</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleDiscoverModels}
                        disabled={isDiscovering || (!curProvider?.apiKey && curProvider?.protocol !== 'ollama_native')}
                        className="text-[10px] text-blue-400 hover:text-blue-300 disabled:opacity-40 flex items-center gap-1 shrink-0 whitespace-nowrap"
                        title={t('settings.discoverRemoteModelsTitle')}
                      >
                        <RefreshCw className={`w-3 h-3 ${isDiscovering ? 'animate-spin' : ''}`} />
                        <span>{t('settings.discoverRemoteModels')}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap max-h-40 overflow-y-auto pr-1">
                      {displayModels.map((mod) => {
                        const isSelected = curModelId === mod.id;
                        const isModelCode = bindings.code.providerId === curProvider.id && bindings.code.modelId === mod.id;
                        const isModelChat = bindings.chat.providerId === curProvider.id && bindings.chat.modelId === mod.id;
                        const isModelVision = bindings.vision.providerId === curProvider.id && bindings.vision.modelId === mod.id;
                        const hasVision = mod.capabilities.includes('vision');
                        const hasReasoning = mod.capabilities.includes('reasoning');
                        const hasCode = mod.capabilities.includes('code');

                        return (
                          <div
                            key={mod.id}
                            className={`group inline-flex items-center rounded-lg border transition text-[10px] font-mono ${
                              isSelected
                                ? 'bg-blue-950/80 border-blue-500 text-blue-200 font-semibold shadow-sm'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleModelChange(mod.id)}
                              className="px-2 py-1 flex items-center gap-1 text-left shrink-0 whitespace-nowrap"
                            >
                              <span>{mod.name || mod.id}</span>
                            </button>

                            {/* Assigned Role Badges */}
                            <div className="flex items-center gap-0.5 pr-1 shrink-0">
                              {isModelCode && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] bg-blue-500/20 text-blue-300 border border-blue-500/30 font-sans shrink-0 whitespace-nowrap" title={t('settings.modelBadgeCodeTitle')}>
                                  {t('settings.modelBadgeCode')}
                                </span>
                              )}
                              {isModelChat && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-sans shrink-0 whitespace-nowrap" title={t('settings.modelBadgeChatTitle')}>
                                  {t('settings.modelBadgeChat')}
                                </span>
                              )}
                              {isModelVision && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] bg-purple-500/20 text-purple-300 border border-purple-500/30 font-sans shrink-0 whitespace-nowrap" title={t('settings.modelBadgeVisionRoleTitle')}>
                                  {t('settings.modelBadgeVisionRole')}
                                </span>
                              )}
                            </div>

                            {/* Capability Badges */}
                            <div className="flex items-center gap-0.5 pr-1 py-0.5 shrink-0">
                              {hasVision && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[8px] bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-0.5 font-sans shrink-0 whitespace-nowrap"
                                  title={t('settings.capabilityVisionTitle')}
                                >
                                  <Eye className="w-2.5 h-2.5" />
                                  <span>Vision</span>
                                </span>
                              )}
                              {hasReasoning && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 font-sans shrink-0 whitespace-nowrap"
                                  title={t('settings.capabilityReasoningTitle')}
                                >
                                  <Brain className="w-2.5 h-2.5" />
                                  <span>{t('settings.capabilityReasoning')}</span>
                                </span>
                              )}
                              {hasCode && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5 font-sans shrink-0 whitespace-nowrap"
                                  title={t('settings.capabilityCodeTitle')}
                                >
                                  <Code2 className="w-2.5 h-2.5" />
                                  <span>{t('settings.capabilityCode')}</span>
                                </span>
                              )}
                            </div>

                            {/* Quick Role Assignment Actions on Hover */}
                            <div className="hidden group-hover:flex items-center gap-0.5 pr-1 border-l border-slate-800/80 pl-1 py-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSetAsCode(mod.id);
                                }}
                                className="px-1 py-0.2 rounded text-[8px] bg-blue-900/60 hover:bg-blue-600 text-blue-200 font-sans"
                                title={t('settings.quickAssignCodeTitle')}
                              >
                                {t('settings.quickAssignCode')}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSetAsChat(mod.id);
                                }}
                                className="px-1 py-0.2 rounded text-[8px] bg-emerald-900/60 hover:bg-emerald-600 text-emerald-200 font-sans"
                                title={t('settings.quickAssignChatTitle')}
                              >
                                {t('settings.quickAssignChat')}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSetAsVision(mod.id);
                                }}
                                className="px-1 py-0.2 rounded text-[8px] bg-purple-900/60 hover:bg-purple-600 text-purple-200 font-sans"
                                title={t('settings.quickAssignVisionTitle')}
                              >
                                {t('settings.quickAssignVision')}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Private Network / SSRF Settings (REQ-OD-04 / REQ-OD-07) */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-slate-300 font-semibold block text-xs">
                        {t('settings.allowPrivateNetworkLabel')}
                      </label>
                      <span className="text-[10px] text-slate-500 block">{t('settings.allowPrivateNetworkHint')}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!curProvider.allowPrivateNetwork}
                        onChange={(e) => updateProvider(curProvider.id, { allowPrivateNetwork: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

                {/* Connectivity Test */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-4">
                  <button
                    onClick={handleTestConnection}
                    disabled={testStatus.testing || (!curProvider.apiKey && curProvider.protocol !== 'ollama_native')}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-medium rounded-xl border border-slate-700 transition flex-shrink-0"
                  >
                    {testStatus.testing ? t('settings.testingConnection') : t('settings.testConnection')}
                  </button>

                  {testStatus.message && (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {testStatus.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      )}
                      <span
                        className={`truncate text-xs ${
                          testStatus.success ? 'text-emerald-400' : 'text-red-400 font-mono'
                        }`}
                        title={testStatus.message}
                      >
                        {testStatus.message}
                      </span>
                    </div>
                  )}
                </div>

                {/* Security Notice (D4 / §3.1.3) */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-2.5 text-[11px] text-slate-400">
                  <ShieldAlert className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-semibold text-slate-300 block mb-0.5">{t('settings.privacyNoticeTitle')}</span>
                    {t('settings.privacyNoticeBody')}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                {t('settings.selectOrAddProvider')}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-xs transition shadow"
          >
            {t('settings.saveAndClose')}
          </button>
        </div>
      </div>
    </div>
  );
};
