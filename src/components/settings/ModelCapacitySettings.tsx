import { UserFacingNotice } from '../common/UserFacingNotice';
import React, { useState } from 'react';
import type { AIProviderConfig, ModelRole } from '../../types/provider';
import { useAIConfigStore } from '../../stores/useAIConfigStore';
import { useT } from '../../stores/useLocaleStore';
import type { MessageKey } from '../../i18n';
import {
  endpointIdentity,
  validModelCapability,
  inferKnownModelCapability,
  type ModelCapabilityProfile,
} from '../../services/ai/modelCapabilities';

const field = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200';

const mediaInferredKeys: Record<
  NonNullable<ModelCapabilityProfile['mediaInput']>,
  MessageKey
> = {
  'native-part': 'settings.capacityMediaInferredNativePart',
  'file-upload': 'settings.capacityMediaInferredFileUpload',
  url: 'settings.capacityMediaInferredUrl',
  unsupported: 'settings.capacityMediaInferredUnsupported',
};

const roleLabelKeys: Record<ModelRole | 'image', MessageKey> = {
  code: 'settings.capacityRoleCode',
  chat: 'settings.capacityRoleChat',
  vision: 'settings.capacityRoleVision',
  image: 'settings.capacityRoleImage',
};

function capabilitySourceLine(
  t: ReturnType<typeof useT>,
  current: boolean,
  stored: ModelCapabilityProfile | undefined,
  hasInferred: boolean,
): string {
  let label: string;
  if (current && stored?.source === 'user') label = t('settings.capacitySourceUser');
  else if (current && stored?.source === 'verified') label = t('settings.capacitySourceVerified');
  else if (current && stored?.source === 'metadata') label = t('settings.capacitySourceMetadata');
  else if (hasInferred) label = t('settings.capacitySourceInferred');
  else label = t('settings.capacitySourceNone');
  return `${t('settings.capacitySourcePrefix')}${label}${t('settings.capacitySourceSuffix')}`;
}

export function ModelCapacitySettings({ provider, model }: { provider: AIProviderConfig; model: string }) {
  const t = useT();
  const stored = provider.modelCapabilities?.[model];
  let current = false;
  try {
    current = validModelCapability(stored) && stored.endpointIdentity === endpointIdentity(provider);
  } catch {
    /* Invalid endpoint is handled at save/send. */
  }
  const inferred = !current ? inferKnownModelCapability(provider, model) : undefined;
  const [windowText, setWindow] = useState(current ? String(stored?.contextWindow ?? '') : '');
  const [outputText, setOutput] = useState(current ? String(stored?.maxOutputTokens ?? '') : '');
  const [media, setMedia] = useState<ModelCapabilityProfile['mediaInput']>(current ? stored?.mediaInput : undefined);
  const [notice, setNotice] = useState('');
  const [thinking, setThinking] = useState<ModelCapabilityProfile['thinkingControl']>(
    current ? stored?.thinkingControl : undefined,
  );
  const [concurrency, setConcurrency] = useState<1 | 2>(current ? stored?.maxConcurrency ?? 1 : 1);
  const { bindings, setModelCapability, setRoleOutputLimit } = useAIConfigStore();
  const roles = (['code', 'chat', 'vision'] as ModelRole[]).filter(
    (role) => bindings[role].providerId === provider.id && bindings[role].modelId === model,
  );
  const number = (value: string) => (value.trim() === '' ? undefined : Number(value));
  const unknown = t('settings.capacityUnknown');
  const save = () => {
    try {
      const contextWindow = number(windowText);
      const maxOutputTokens = number(outputText);
      setModelCapability(
        provider.id,
        model,
        contextWindow === undefined &&
          maxOutputTokens === undefined &&
          media === undefined &&
          concurrency === 1 &&
          thinking === undefined
          ? undefined
          : { contextWindow, maxOutputTokens, mediaInput: media, maxConcurrency: concurrency, thinkingControl: thinking },
      );
      setNotice(t('settings.capacitySaveSuccess'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('settings.capacitySaveFailed'));
    }
  };
  const mediaDefaultOption =
    inferred?.mediaInput != null
      ? t('settings.capacityMediaUnsetInferred', { default: t(mediaInferredKeys[inferred.mediaInput]) })
      : t('settings.capacityMediaUnsetFallback');

  return (
    <details className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs">
      <summary className="cursor-pointer font-semibold text-slate-300">{t('settings.capacitySectionSummary')}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-slate-400">{t('settings.capacityIntro')}</p>
        {stored && !current && (
          <p role="status" className="text-amber-300">
            {t('settings.capacityStaleWarning')}
          </p>
        )}
        <p className="text-slate-500">{t('settings.capacityTokenHint')}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 block text-slate-400">
            {t('settings.capacityContextWindowLabel')}
            <input
              aria-label={t('settings.capacityAriaContextWindow')}
              type="number"
              min={256}
              max={10000000}
              step={1}
              value={windowText}
              onChange={(e) => setWindow(e.target.value)}
              placeholder={
                inferred?.contextWindow
                  ? t('settings.capacityRecommendPlaceholder', { value: inferred.contextWindow })
                  : unknown
              }
              className={field}
            />
          </label>
          <label className="space-y-1 block text-slate-400">
            {t('settings.capacityMaxOutputLabel')}
            <input
              aria-label={t('settings.capacityAriaMaxOutput')}
              type="number"
              min={256}
              max={10000000}
              step={1}
              value={outputText}
              onChange={(e) => setOutput(e.target.value)}
              placeholder={
                inferred?.maxOutputTokens
                  ? t('settings.capacityRecommendPlaceholder', { value: inferred.maxOutputTokens })
                  : unknown
              }
              className={field}
            />
          </label>
        </div>
        <label className="space-y-1 block text-slate-400">
          {t('settings.capacityMediaLabel')}
          <select
            aria-label={t('settings.capacityAriaMedia')}
            value={media ?? ''}
            onChange={(e) =>
              setMedia(e.target.value ? (e.target.value as ModelCapabilityProfile['mediaInput']) : undefined)
            }
            className={field}
          >
            <option value="">{mediaDefaultOption}</option>
            <option value="native-part">{t('settings.capacityMediaNativePart')}</option>
            <option value="url">{t('settings.capacityMediaUrl')}</option>
            <option value="unsupported">{t('settings.capacityMediaUnsupported')}</option>
          </select>
        </label>
        <label className="space-y-1 block text-slate-400">
          {t('settings.capacityThinkingLabel')}
          <select
            aria-label={t('settings.capacityAriaThinking')}
            value={thinking ?? ''}
            onChange={(e) =>
              setThinking(e.target.value ? (e.target.value as ModelCapabilityProfile['thinkingControl']) : undefined)
            }
            className={field}
          >
            <option value="">{t('settings.capacityThinkingAuto')}</option>
            <option value="deepseek">{t('settings.capacityThinkingDeepseek')}</option>
            <option value="qwen">{t('settings.capacityThinkingQwen')}</option>
            <option value="unsupported">{t('settings.capacityThinkingUnsupported')}</option>
          </select>
        </label>
        <p className="text-slate-500">{capabilitySourceLine(t, current, stored, Boolean(inferred))}</p>
        <label className="space-y-1 block text-slate-400">
          {t('settings.capacityConcurrencyLabel')}
          <select
            aria-label={t('settings.capacityAriaConcurrency')}
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value) as 1 | 2)}
            className={field}
          >
            <option value={1}>{t('settings.capacityConcurrencyOne')}</option>
            <option value={2}>{t('settings.capacityConcurrencyTwo')}</option>
          </select>
        </label>
        <button
          type="button"
          onClick={save}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
        >
          {t('settings.capacitySaveModel')}
        </button>
        {roles.map((role) => (
          <RoleLimit
            key={role + ':' + model}
            role={role}
            value={bindings[role].maxOutputTokens}
            save={(limit) => setRoleOutputLimit(role, limit)}
          />
        ))}
        {notice && (
          <div role="status" className="text-slate-300">
            <UserFacingNotice message={notice} />
          </div>
        )}
      </div>
    </details>
  );
}

function RoleLimit({
  role,
  value,
  save,
}: {
  role: ModelRole;
  value?: number;
  save: (value?: number) => void;
}) {
  const t = useT();
  const roleLabel = t(roleLabelKeys[role]);
  const [text, setText] = useState(String(value ?? ''));
  const [error, setError] = useState('');
  return (
    <div className="space-y-1 border-t border-slate-800 pt-3">
      <label className="block text-slate-400">
        {t('settings.capacityRoleOutputLabel', { role: roleLabel })}
        <input
          aria-label={t('settings.capacityAriaRoleOutput', { role })}
          type="number"
          min={256}
          max={32768}
          value={text}
          placeholder={t('settings.capacityRoleOutputPlaceholder')}
          onChange={(e) => setText(e.target.value)}
          className={field}
        />
      </label>
      <button
        type="button"
        className="text-blue-300"
        onClick={() => {
          try {
            save(text.trim() ? Number(text) : undefined);
            setError(t('settings.capacityRoleOutputSaved'));
          } catch (e) {
            setError(e instanceof Error ? e.message : t('settings.capacityRoleOutputSaveFailed'));
          }
        }}
      >
        {t('settings.capacitySaveRoleOutput')}
      </button>
      {error && (
        <p role="status" className="text-slate-400">
          {error}
        </p>
      )}
    </div>
  );
}