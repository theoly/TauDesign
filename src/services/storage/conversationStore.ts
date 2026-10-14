import { ProjectStorage, QuotaExceededError } from './projectStorage';

/**
 * 会话存档 (A2 / T-AE-31, T-AE-32, T-AE-36)。
 *
 * PRD §3.2.8 / D20 原立场是「只沉淀决策、不存会话」，但有两处设计已经预设了
 * 会话可持久化：
 *   1. §3.8.4 要求"对话面板中每条 AI 消息旁提供「回到这里」"——Checkpoint 入口
 *      锚定在消息上，消息不持久化则重开工程后全部 Checkpoint 失去入口；
 *   2. `Decision.source.conversationId` 注释写着"来源对话, 供用户回溯"。
 * 故会话存档不是新增诉求，是补齐既有设计（ISSUE-009）。
 *
 * 格式选型（doc/aesthetic/spec.md §8.5.1）：**JSONL 追加**，非单个 JSON、非 SQLite。
 * 在 PRD §2.7 自己的四条标准上全部胜出，其中两条是压倒性的：
 *   - 损坏时可局部恢复：一行坏了只丢那一行，单 JSON 一处损坏全文件报废；
 *   - 实现成本最低：纯追加 O(1)，不读不改已有内容。
 *
 * **以「轮次 (Turn)」而非「消息」为行单位**：一轮的用户消息、助手回复、变更摘要、
 * Checkpoint 引用需要原子写入，写成一行天然原子，无需事务机制。
 */

export interface TokenChange {
  path: string;
  from: string;
  to: string;
}

/** 每轮对话产生的结构化变更 (T-AE-36) */
export interface ChangeSet {
  /** 创建或重写的画框 */
  screens?: Array<{ id: string; name: string; action: 'created' | 'rewritten' }>;
  /** Token 字段前后值 */
  tokens?: TokenChange[];
  /** 本轮沉淀的工程约定 id */
  decisions?: string[];
  /** 关联的 Checkpoint，供「回到这里」定位 (T-AE-37) */
  checkpointId?: string;
}

export interface ConversationTurn {
  turnId: string;
  ts: number;
  user: {
    text: string;
    /** 附件只存 relPath，绝不存 base64 原文 (T-AE-32) */
    attachments?: string[];
    /** 本轮读取过的文本资料名称/路径，不重复存储正文。 */
    textFiles?: string[];
  };
  assistant: {
    text: string;
    model?: string;
    usage?: { inputTokens?: number; outputTokens?: number };
    durationMs?: number;
    aborted?: boolean;
  };
  intent?: string;
  changeSet?: ChangeSet;
}

const CONV_DIR = 'conversations';
const INDEX_PATH = `${CONV_DIR}/index.json`;

export interface ShardMeta {
  shard: string;
  turns: number;
  firstTs: number;
  lastTs: number;
}

export interface ConversationIndex {
  shards: ShardMeta[];
}

const shardIdFor = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const shardPath = (shard: string) => `${CONV_DIR}/${shard}.jsonl`;

export class ConversationStore {
  constructor(private readonly storage: ProjectStorage) {}

  private async readIndex(): Promise<ConversationIndex> {
    const raw = await this.storage.readText(INDEX_PATH);
    if (!raw) return { shards: [] };
    try {
      return JSON.parse(raw) as ConversationIndex;
    } catch {
      // 索引损坏不应阻断会话读取——分片本身是自足的
      return { shards: [] };
    }
  }

  /**
   * 追加一轮对话。
   *
   * 写失败**不抛出到调用方**：会话是辅助数据，绝不能因为它写不进去
   * 就让整个工程保存失败（ISSUE-008 的数据丢失级风险）。
   * 返回 false 表示未落盘，由上层决定是否提示。
   */
  async appendTurn(turn: ConversationTurn): Promise<boolean> {
    try {
      const shard = shardIdFor(turn.ts);
      await this.storage.ensureDir(CONV_DIR);
      await this.storage.appendLine(shardPath(shard), JSON.stringify(turn));

      const index = await this.readIndex();
      const existing = index.shards.find((s) => s.shard === shard);
      if (existing) {
        existing.turns += 1;
        existing.lastTs = turn.ts;
      } else {
        index.shards.push({ shard, turns: 1, firstTs: turn.ts, lastTs: turn.ts });
        index.shards.sort((a, b) => a.shard.localeCompare(b.shard));
      }
      await this.storage.writeTextAtomic(INDEX_PATH, JSON.stringify(index, null, 2));
      return true;
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        console.warn('[conversation] 存储配额已满，本轮会话未落盘', e.rel);
      } else {
        console.warn('[conversation] 追加失败', e);
      }
      return false;
    }
  }

  /** 解析一行；无法解析的行返回 null 由调用方跳过——JSONL 的关键优势 */
  private parse(line: string): ConversationTurn | null {
    try {
      const t = JSON.parse(line) as ConversationTurn;
      return t && typeof t.turnId === 'string' ? t : null;
    } catch {
      return null;
    }
  }

  /** 打开工程时恢复最近 N 轮 (T-AE-31) */
  async loadRecent(limit = 50): Promise<ConversationTurn[]> {
    const index = await this.readIndex();
    const out: ConversationTurn[] = [];
    for (let i = index.shards.length - 1; i >= 0 && out.length < limit; i--) {
      const lines = await this.storage.readTailLines(shardPath(index.shards[i].shard), limit - out.length);
      const turns = lines.map((l) => this.parse(l)).filter((t): t is ConversationTurn => t !== null);
      out.unshift(...turns);
    }
    return out.slice(-limit);
  }

  /** 向上滚动加载更早的轮次 */
  async loadBefore(ts: number, limit = 50): Promise<ConversationTurn[]> {
    const index = await this.readIndex();
    const out: ConversationTurn[] = [];
    for (let i = index.shards.length - 1; i >= 0 && out.length < limit; i--) {
      if (index.shards[i].firstTs >= ts) continue;
      const lines = await this.storage.readAllLines(shardPath(index.shards[i].shard));
      const turns = lines
        .map((l) => this.parse(l))
        .filter((t): t is ConversationTurn => t !== null && t.ts < ts);
      out.unshift(...turns.slice(-(limit - out.length)));
    }
    return out;
  }

  async stats(): Promise<{ shards: number; turns: number }> {
    const index = await this.readIndex();
    return { shards: index.shards.length, turns: index.shards.reduce((n, s) => n + s.turns, 0) };
  }

  /**
   * 导出为 Markdown 归档 (T-AE-38)。
   * 工程导出**默认不含会话**——会话含用户业务描述，属隐私内容，需显式调用此方法。
   */
  async exportMarkdown(): Promise<string> {
    const index = await this.readIndex();
    const parts: string[] = ['# 会话归档\n'];
    for (const meta of index.shards) {
      const lines = await this.storage.readAllLines(shardPath(meta.shard));
      parts.push(`\n## ${meta.shard}（${meta.turns} 轮）\n`);
      for (const line of lines) {
        const t = this.parse(line);
        if (!t) continue;
        parts.push(`\n### ${new Date(t.ts).toLocaleString('zh-CN')}${t.intent ? ` · ${t.intent}` : ''}\n`);
        parts.push(`**用户**：${t.user.text}\n`);
        if (t.user.attachments?.length) parts.push(`附件：${t.user.attachments.join('、')}\n`);
        if (t.assistant.text) parts.push(`\n**助手**：${t.assistant.text.slice(0, 500)}\n`);
        const cs = t.changeSet;
        if (cs && (cs.screens?.length || cs.tokens?.length || cs.decisions?.length)) {
          parts.push('\n变更：\n');
          for (const s of cs.screens ?? []) parts.push(`- 画框「${s.name}」${s.action === 'created' ? '创建' : '重写'}\n`);
          for (const tk of cs.tokens ?? []) parts.push(`- Token \`${tk.path}\`：${tk.from} → ${tk.to}\n`);
          for (const d of cs.decisions ?? []) parts.push(`- 沉淀工程约定 ${d}\n`);
        }
      }
    }
    return parts.join('');
  }

  /**
   * 超限清理 (T-AE-38)：把最早的分片折叠为**只读摘要**而非直接删除——
   * 保留变更摘要与锚点，丢弃原文。
   */
  async compactOldest(keepShards: number): Promise<number> {
    const index = await this.readIndex();
    if (index.shards.length <= keepShards) return 0;
    const drop = index.shards.slice(0, index.shards.length - keepShards);
    let compacted = 0;
    for (const meta of drop) {
      const lines = await this.storage.readAllLines(shardPath(meta.shard));
      const summaries = lines
        .map((l) => this.parse(l))
        .filter((t): t is ConversationTurn => t !== null)
        .map((t) =>
          JSON.stringify({
            turnId: t.turnId,
            ts: t.ts,
            user: { text: t.user.text.slice(0, 80) },
            assistant: { text: '' },
            intent: t.intent,
            changeSet: t.changeSet
          } satisfies ConversationTurn)
        );
      await this.storage.writeTextAtomic(shardPath(meta.shard), summaries.join('\n'));
      compacted += summaries.length;
    }
    return compacted;
  }
}
