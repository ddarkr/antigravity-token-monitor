import { MonitorConfig } from '../config';
import { resolveModelPlaceholder } from '../modelAliases';
import { SessionScanCandidate, RpcArtifactManifest } from '../types';
import { RpcArtifactStore } from '../storage/rpcArtifactStore';
import { AntigravityRpcClient } from './antigravityRpcClient';

type TrajectorySummary = {
  sessionId: string;
  lastModifiedMs?: number;
  stepCount?: number;
};

export class TrajectoryExporter {
  private readonly client: AntigravityRpcClient;

  constructor(
    private readonly config: MonitorConfig,
    private readonly artifactStore: RpcArtifactStore,
    private readonly log?: (message: string) => void
  ) {
    this.client = new AntigravityRpcClient(config);
  }

  async exportChangedSessions(
    candidates: SessionScanCandidate[],
    options?: { force?: boolean }
  ): Promise<{ manifests: Map<string, RpcArtifactManifest>; exportedCount: number }> {
    const manifests = new Map<string, RpcArtifactManifest>();
    if (!this.config.useRpcExport) {
      return { manifests, exportedCount: 0 };
    }

    let exportedCount = 0;

    let summaries: TrajectorySummary[];
    try {
      // flush()는 실패해도 export를 중단하지 않음 (큐 비우기는 best-effort)
      await this.client.flush().catch((err) => {
        console.warn('[antigravity-token-monitor] RPC flush warn (non-fatal):', err);
      });
      summaries = await this.client.listTrajectories();
      this.log?.(`RPC summaries fetched: ${summaries.length}. Scanner candidates: ${candidates.length}.`);
    } catch (error) {
      // 연결 오류 시 캐시 초기화 → 다음 export 사이클에서 재탐지
      this.client.resetConnection();
      console.warn('[antigravity-token-monitor] RPC export unavailable:', error);
      return { manifests, exportedCount };
    }

    const summaryById = new Map(summaries.map((summary) => [summary.sessionId, summary]));
    let unmatchedCount = 0;

    for (const candidate of candidates) {
      let summary = summaryById.get(candidate.sessionId);
      if (!summary) {
        unmatchedCount += 1;
        // 목록에서 누락된 경우, 파일 시스템의 메타데이터를 기반으로 강제 조회 시도 (Fallback)
        summary = {
          sessionId: candidate.sessionId,
          lastModifiedMs: candidate.lastModifiedMs,
          stepCount: undefined
        };
      }

      const previous = await this.artifactStore.loadManifest(candidate.sessionId);
      if (!shouldExport(summary, previous, options?.force === true)) {
        if (previous) {
          manifests.set(candidate.sessionId, previous);
        }
        continue;
      }

      try {
        const steps = await this.client.getTrajectorySteps(candidate.sessionId);
        const metadata = await this.client.getTrajectoryMetadata(candidate.sessionId);
        const next = await this.artifactStore.writeSessionArtifacts({
          sessionId: candidate.sessionId,
          serverLastModifiedMs: summary.lastModifiedMs,
          stepCount: summary.stepCount,
          steps: this.config.exportStepsJsonl ? serializeSteps(candidate.sessionId, steps) : undefined,
          usage: serializeUsage(candidate.sessionId, metadata)
        });
        manifests.set(candidate.sessionId, next);
        exportedCount += 1;
      } catch (error) {
        await this.artifactStore.recordFailure(candidate.sessionId, error);
        console.warn(`[antigravity-token-monitor] Failed to export RPC artifacts for ${candidate.sessionId}:`, error);
      }
    }

    if (unmatchedCount > 0) {
      this.log?.(
        `RPC export fallback: Forced direct export for ${unmatchedCount} candidate(s) not found in RPC summaries.`
      );
    }

    this.log?.(`RPC export processed ${candidates.length} scanner candidates; wrote ${exportedCount} artifact set(s).`);

    return { manifests, exportedCount };
  }
}

function shouldExport(summary: TrajectorySummary, previous: RpcArtifactManifest | null, force: boolean): boolean {
  if (force) {
    return true;
  }

  if (!previous?.artifactHash) {
    return true;
  }

  return previous.serverLastModifiedMs !== summary.lastModifiedMs
    || previous.stepCount !== summary.stepCount;
}

function serializeSteps(sessionId: string, steps: unknown[]): unknown[] {
  return steps.map((step, index) => {
    const record = step && typeof step === 'object' ? step as Record<string, unknown> : {};
    return {
      recordType: 'step',
      sessionId,
      stepIndex: index,
      role: extractRole(record),
      timestamp: extractTimestamp(record),
      model: extractModel(record),
      text: extractStepText(record)
    };
  });
}

function serializeUsage(sessionId: string, metadata: unknown[]): unknown[] {
  return metadata.map((entry, index) => {
    const usage = extractUsage(entry);
    return {
      recordType: 'usage',
      sessionId,
      sequence: index,
      timestamp: extractTimestamp(entry),
      model: extractUsageModel(entry),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      reasoningTokens: usage.reasoningTokens,
      totalTokens: usage.totalTokens,
      raw: entry
    };
  });
}

function extractStepText(input: Record<string, unknown>): string {
  const userInput = input.userInput;
  if (userInput && typeof userInput === 'object') {
    const record = userInput as Record<string, unknown>;
    if (typeof record.userResponse === 'string' && record.userResponse.trim()) {
      return record.userResponse;
    }

    if (Array.isArray(record.items)) {
      const parts = record.items
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return '';
          }
          const entry = item as Record<string, unknown>;
          const textValue = entry.text;
          if (textValue && typeof textValue === 'object') {
            const content = (textValue as Record<string, unknown>).content;
            if (typeof content === 'string') {
              return content;
            }
          }
          const codeValue = entry.code;
          if (codeValue && typeof codeValue === 'object') {
            const value = (codeValue as Record<string, unknown>).value;
            if (typeof value === 'string') {
              return value;
            }
          }
          return '';
        })
        .filter((value) => value.length > 0);
      if (parts.length > 0) {
        return parts.join('\n\n');
      }
    }
  }

  const modelResponse = input.modelResponse;
  if (modelResponse && typeof modelResponse === 'object') {
    const record = modelResponse as Record<string, unknown>;
    if (Array.isArray(record.content)) {
      const text = record.content
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return '';
          }
          const part = item as Record<string, unknown>;
          const textValue = part.text;
          if (textValue && typeof textValue === 'object') {
            const content = (textValue as Record<string, unknown>).content;
            return typeof content === 'string' ? content : '';
          }
          return '';
        })
        .filter((value) => value.length > 0)
        .join('\n');
      if (text) {
        return text;
      }
    }

    if (typeof record.text === 'string') {
      return record.text;
    }
  }

  const plannerResponse = input.plannerResponse;
  if (plannerResponse && typeof plannerResponse === 'object') {
    const thinking = (plannerResponse as Record<string, unknown>).thinking;
    if (typeof thinking === 'string') {
      return thinking;
    }
  }

  return firstString(input.text, messageText(input.message)) ?? '';
}

function extractRole(input: Record<string, unknown>): string {
  if (input.type === 'CORTEX_STEP_TYPE_USER_INPUT') {
    return 'user';
  }
  if (input.type === 'CORTEX_STEP_TYPE_MODEL_RESPONSE' || input.type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
    return 'model';
  }

  const header = input.header;
  if (header && typeof header === 'object') {
    const sender = (header as Record<string, unknown>).sender;
    return sender === 'USER' ? 'user' : 'model';
  }

  return 'unknown';
}

function extractModel(input: Record<string, unknown>): string | undefined {
  return firstString(input.model, input.modelId, input.modelName);
}

function extractTimestamp(input: unknown): number | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  for (const value of [record.timestamp, record.createdAt, record.lastModifiedTime]) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function extractUsage(input: unknown) {
  const result = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0
  };

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }

    for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      const numericValue = toFiniteNumber(rawValue);
      if (numericValue !== undefined) {
        if (/^(input|prompt).*token/.test(normalizedKey)) {
          result.inputTokens += numericValue;
        } else if (/^(output|completion).*token/.test(normalizedKey)) {
          result.outputTokens += numericValue;
        } else if (/cache.*read.*token/.test(normalizedKey)) {
          result.cacheReadTokens += numericValue;
        } else if (/cache.*write.*token/.test(normalizedKey)) {
          result.cacheWriteTokens += numericValue;
        } else if (/(reasoning|thinking).*token/.test(normalizedKey)) {
          result.reasoningTokens += numericValue;
        } else if (normalizedKey === 'totaltokens' || normalizedKey === 'total_tokens') {
          result.totalTokens += numericValue;
        }
      }

      visit(rawValue);
    }
  };

  visit(input);
  result.totalTokens = Math.max(
    result.totalTokens,
    result.inputTokens + result.outputTokens + result.cacheReadTokens + result.cacheWriteTokens + result.reasoningTokens
  );

  return result;
}

function extractUsageModel(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  const direct = preferredModel(record.responseModel, record.model, record.modelName, record.modelId);
  if (direct) {
    return direct;
  }

  const chatModel = record.chatModel;
  if (chatModel && typeof chatModel === 'object') {
    const chatModelRecord = chatModel as Record<string, unknown>;
    const fromChatModel = preferredModel(
      chatModelRecord.responseModel,
      chatModelRecord.model,
      chatModelRecord.modelName,
      chatModelRecord.modelId
    );
    if (fromChatModel) {
      return fromChatModel;
    }

    const usage = chatModelRecord.usage;
    if (usage && typeof usage === 'object') {
      const usageRecord = usage as Record<string, unknown>;
      const fromUsage = preferredModel(
        usageRecord.responseModel,
        usageRecord.model,
        usageRecord.modelName,
        usageRecord.modelId
      );
      if (fromUsage) {
        return fromUsage;
      }
    }
  }

  return undefined;
}

function preferredModel(...values: unknown[]): string | undefined {
  const candidates = values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  for (const candidate of candidates) {
    if (!isPlaceholderModel(candidate)) {
      return candidate;
    }
  }

  const fallback = candidates[0];
  return fallback ? (resolveModelPlaceholder(fallback) ?? fallback) : undefined;
}

function isPlaceholderModel(value: string): boolean {
  return value.startsWith('MODEL_PLACEHOLDER_');
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function messageText(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const text = (input as Record<string, unknown>).text;
  return typeof text === 'string' ? text : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}
