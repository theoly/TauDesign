import { create } from 'zustand';

export interface UsageRecord {
  id: string;
  timestamp: number;
  providerName: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  source?: 'provider' | 'estimated';
}

export interface LiveUsage {
  requestId: string;
  providerName: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  source: 'provider' | 'estimated' | 'unknown';
  status: 'running' | 'completed' | 'aborted' | 'error';
  startedAt: number;
}

export interface UsageState {
  // 历史累计 (All-time, 持久化至 localStorage)
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  history: UsageRecord[];

  // 本轮会话 (Session, 内存维护，支持重置)
  sessionCalls: number;
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionEstimatedCostUsd: number;

  activeRequests: Record<string, LiveUsage>;
  lastRequest: LiveUsage | null;

  recordUsage: (record: Omit<UsageRecord, 'id' | 'timestamp'>) => void;
  beginRequest: (request: Pick<LiveUsage, 'requestId' | 'providerName' | 'modelId' | 'inputTokens'>) => void;
  updateRequest: (requestId: string, update: Partial<Pick<LiveUsage, 'inputTokens' | 'outputTokens' | 'source'>>) => void;
  finishRequest: (requestId: string, status: LiveUsage['status'], estimatedCostUsd: number) => void;
  resetSessionUsage: () => void;
  clearUsage: () => void;
}

const USAGE_STORAGE_KEY = 'ai_designer_usage_stats_v1';

function loadStoredUsage(): {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  history: UsageRecord[];
} {
  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalEstimatedCostUsd: 0,
    history: []
  };
}

const initialAllTime = loadStoredUsage();

export const useUsageStore = create<UsageState>((set, get) => ({
  ...initialAllTime,

  // 本轮会话初始状态
  sessionCalls: 0,
  sessionInputTokens: 0,
  sessionOutputTokens: 0,
  sessionEstimatedCostUsd: 0,
  activeRequests: {},
  lastRequest: null,

  beginRequest: (request) => set((state) => ({
    activeRequests: {
      ...state.activeRequests,
      [request.requestId]: {
        ...request,
        outputTokens: 0,
        source: 'estimated',
        status: 'running',
        startedAt: Date.now()
      }
    }
  })),

  updateRequest: (requestId, update) => set((state) => {
    const current = state.activeRequests[requestId];
    if (!current) return state;
    return {
      activeRequests: {
        ...state.activeRequests,
        [requestId]: { ...current, ...update }
      }
    };
  }),

  finishRequest: (requestId, status, estimatedCostUsd) => {
    const current = get().activeRequests[requestId];
    if (!current) return;
    const { [requestId]: _finished, ...remaining } = get().activeRequests;
    const finalRequest: LiveUsage = {
      ...current,
      status,
      source: current.source === 'provider' ? 'provider' : current.outputTokens > 0 ? 'estimated' : 'unknown'
    };
    set({ activeRequests: remaining, lastRequest: finalRequest });
    if (finalRequest.source !== 'unknown') {
      get().recordUsage({
        providerName: current.providerName,
        modelId: current.modelId,
        inputTokens: current.inputTokens,
        outputTokens: current.outputTokens,
        estimatedCostUsd,
        source: finalRequest.source
      });
    }
  },

  recordUsage: (data) => {
    set((state) => {
      const record: UsageRecord = {
        ...data,
        id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now()
      };

      const nextAllTime = {
        totalCalls: state.totalCalls + 1,
        totalInputTokens: state.totalInputTokens + data.inputTokens,
        totalOutputTokens: state.totalOutputTokens + data.outputTokens,
        totalEstimatedCostUsd: Number((state.totalEstimatedCostUsd + data.estimatedCostUsd).toFixed(6)),
        history: [record, ...state.history].slice(0, 50)
      };

      try {
        localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(nextAllTime));
      } catch (e) {
        // ignore
      }

      return {
        ...nextAllTime,
        sessionCalls: state.sessionCalls + 1,
        sessionInputTokens: state.sessionInputTokens + data.inputTokens,
        sessionOutputTokens: state.sessionOutputTokens + data.outputTokens,
        sessionEstimatedCostUsd: Number((state.sessionEstimatedCostUsd + data.estimatedCostUsd).toFixed(6))
      };
    });
  },

  resetSessionUsage: () => {
    set({
      sessionCalls: 0,
      sessionInputTokens: 0,
      sessionOutputTokens: 0,
      sessionEstimatedCostUsd: 0
    });
  },

  clearUsage: () => {
    const empty = {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalEstimatedCostUsd: 0,
      history: []
    };
    try {
      localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(empty));
    } catch (e) {
      // ignore
    }
    set({
      ...empty,
      sessionCalls: 0,
      sessionInputTokens: 0,
      sessionOutputTokens: 0,
      sessionEstimatedCostUsd: 0,
      activeRequests: {},
      lastRequest: null
    });
  }
}));

/**
 * 格式化 Token 数量（如 1,240, 12.5k）
 */
export function formatTokenCount(num: number): string {
  if (!num || num < 0) return '0';
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}k`;
  }
  return num.toLocaleString();
}
