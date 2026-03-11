import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveModelPlaceholder } from '../modelAliases';
import { ModelTokenBreakdown, SessionParsePlan, SessionTotals, TokenBreakdown } from '../types';

const TEXT_EXTENSIONS = new Set(['.json', '.jsonl', '.md', '.txt', '.log', '.yaml', '.yml']);
const LABEL_FILES = ['task.md', 'implementation_plan.md', 'walkthrough.md'];

type StructuredSignalResult = {
  breakdown: TokenBreakdown;
  hits: number;
  text: string;
  messageCount: number;
  modelTotals: Record<string, number>;
  modelBreakdowns: Record<string, ModelTokenBreakdown>;
};

export class AntigravitySessionParser {
  constructor(private readonly maxFileBytes: number) {}

  async parse(candidate: SessionParsePlan): Promise<SessionTotals> {
    const reported: TokenBreakdown = emptyBreakdown();
    const modelTotals: Record<string, number> = {};
    const modelBreakdowns: Record<string, ModelTokenBreakdown> = {};
    let evidenceCount = 0;
    let messageCount = 0;
    let estimatedText = '';

    for (const filePath of candidate.tokenFilePaths) {
      const parsed = await this.readFileContent(filePath);
      if (!parsed) {
        continue;
      }

      const { content } = parsed;
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.json' || ext === '.jsonl') {
        const {
          breakdown,
          hits,
          text,
          messageCount: parsedMessageCount,
          modelTotals: parsedModelTotals,
          modelBreakdowns: parsedModelBreakdowns
        } = extractStructuredSignals(content, ext);
        mergeBreakdown(reported, breakdown);
        mergeModelTotals(modelTotals, parsedModelTotals);
        mergeModelBreakdowns(modelBreakdowns, parsedModelBreakdowns);
        evidenceCount += hits;
        messageCount += parsedMessageCount;
        estimatedText += text;
      } else {
        estimatedText += `\n${content}`;
      }
    }

    const label = await this.resolveLabel(candidate);
    return evidenceCount > 0
      ? finalizeReported(candidate, label, reported, modelTotals, modelBreakdowns, evidenceCount, messageCount)
      : finalizeEstimated(candidate, label, estimatedText, messageCount);
  }

  private async resolveLabel(candidate: SessionParsePlan): Promise<string> {
    for (const labelFile of LABEL_FILES) {
      const filePath = path.join(candidate.sessionDir, labelFile);
      const content = await this.readFileContent(filePath);
      if (!content) {
        continue;
      }

      const headingMatch = content.content.match(/^#\s*(?:Task:?\s*)?(.+)$/im);
      if (headingMatch?.[1]) {
        return headingMatch[1].trim();
      }
    }

    return candidate.labelHint;
  }

  private async readFileContent(filePath: string): Promise<{ content: string } | null> {
    const ext = path.extname(filePath).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) {
      return null;
    }

    try {
      const stat = await fs.stat(filePath);
      if (stat.size > this.maxFileBytes) {
        return null;
      }

      return { content: await fs.readFile(filePath, 'utf8') };
    } catch {
      return null;
    }
  }
}

function extractStructuredSignals(content: string, ext: string): StructuredSignalResult {
  const breakdown = emptyBreakdown();
  let hits = 0;
  let messageCount = 0;
  let extractedText = '';
  const modelTotals: Record<string, number> = {};
  const modelBreakdowns: Record<string, ModelTokenBreakdown> = {};

  if (ext === '.jsonl') {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      extractedText += `\n${trimmed}`;
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        messageCount += countStepRows(parsed);
        const signal = walkForTokenSignals(parsed);
        mergeBreakdown(breakdown, signal.breakdown);
        mergeModelTotals(modelTotals, signal.modelTotals);
        mergeModelBreakdowns(modelBreakdowns, signal.modelBreakdowns);
        hits += signal.hits;
      } catch {
      }
    }

    return { breakdown, hits, text: extractedText, messageCount, modelTotals, modelBreakdowns };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { breakdown, hits, text: extractedText, messageCount, modelTotals, modelBreakdowns };
  }

  extractedText += `\n${trimmed}`;
  try {
    const parsed = JSON.parse(content) as unknown;
    const signal = walkForTokenSignals(parsed);
    mergeBreakdown(breakdown, signal.breakdown);
    mergeModelTotals(modelTotals, signal.modelTotals);
    mergeModelBreakdowns(modelBreakdowns, signal.modelBreakdowns);
    hits += signal.hits;
  } catch {
  }

  return { breakdown, hits, text: extractedText, messageCount, modelTotals, modelBreakdowns };
}

type SignalResult = {
  breakdown: TokenBreakdown;
  hits: number;
  modelTotals: Record<string, number>;
  modelBreakdowns: Record<string, ModelTokenBreakdown>;
};

function walkForTokenSignals(value: unknown): SignalResult {
  const breakdown = emptyBreakdown();
  let hits = 0;
  const modelTotals: Record<string, number> = {};
  const modelBreakdowns: Record<string, ModelTokenBreakdown> = {};

  const visit = (input: unknown, inheritedModel?: string): void => {
    if (Array.isArray(input)) {
      input.forEach((item) => {
        visit(item, inheritedModel);
      });
      return;
    }

    if (!input || typeof input !== 'object') {
      return;
    }

    const record = input as Record<string, unknown>;
    const usageSignal = extractCanonicalUsageSignal(record, inheritedModel);
    if (usageSignal) {
      mergeBreakdown(breakdown, usageSignal.breakdown);
      mergeModelTotals(modelTotals, usageSignal.modelTotals);
      mergeModelBreakdowns(modelBreakdowns, usageSignal.modelBreakdowns);
      hits += usageSignal.hits;
      return;
    }

    const currentModel = preferredModel(extractModel(record), inheritedModel);
    for (const [key, rawValue] of Object.entries(record)) {
      const numericValue = toFiniteNumber(rawValue);
      const normalizedKey = key.toLowerCase();

      if (numericValue !== undefined) {
        const model = currentModel ?? 'unknown';
        if (/^(input|prompt).*token/.test(normalizedKey)) {
          breakdown.inputTokens += numericValue;
          modelTotals[model] = (modelTotals[model] ?? 0) + numericValue;
          mergeModelCategory(modelBreakdowns, model, { inputTokens: numericValue });
          hits += 1;
        } else if (/^(output|completion).*token/.test(normalizedKey)) {
          breakdown.outputTokens += numericValue;
          modelTotals[model] = (modelTotals[model] ?? 0) + numericValue;
          mergeModelCategory(modelBreakdowns, model, { outputTokens: numericValue });
          hits += 1;
        } else if (/cache.*read.*token/.test(normalizedKey)) {
          breakdown.cacheReadTokens += numericValue;
          modelTotals[model] = (modelTotals[model] ?? 0) + numericValue;
          mergeModelCategory(modelBreakdowns, model, { cacheReadTokens: numericValue });
          hits += 1;
        } else if (/cache.*write.*token/.test(normalizedKey)) {
          breakdown.cacheWriteTokens += numericValue;
          modelTotals[model] = (modelTotals[model] ?? 0) + numericValue;
          mergeModelCategory(modelBreakdowns, model, { cacheWriteTokens: numericValue });
          hits += 1;
        } else if (/(reasoning|thinking).*token/.test(normalizedKey)) {
          breakdown.reasoningTokens += numericValue;
          modelTotals[model] = (modelTotals[model] ?? 0) + numericValue;
          mergeModelCategory(modelBreakdowns, model, { reasoningTokens: numericValue });
          hits += 1;
        } else if (normalizedKey === 'totaltokens' || normalizedKey === 'total_tokens') {
          breakdown.totalTokens += numericValue;
          modelTotals[model] = (modelTotals[model] ?? 0) + numericValue;
          mergeModelCategory(modelBreakdowns, model, { totalTokens: numericValue });
          hits += 1;
        }
      }

      visit(rawValue, currentModel);
    }
  };

  visit(value);
  breakdown.totalTokens = normalizeTotal(breakdown);
  finalizeModelBreakdowns(modelBreakdowns);
  return { breakdown, hits, modelTotals, modelBreakdowns };
}

function countStepRows(value: unknown): number {
  if (!value || typeof value !== 'object') {
    return 0;
  }

  const record = value as Record<string, unknown>;
  return record.recordType === 'step' ? 1 : 0;
}

function extractCanonicalUsageSignal(record: Record<string, unknown>, inheritedModel?: string): SignalResult | null {
  if (record.recordType !== 'usage') {
    return null;
  }

  const raw = record.raw;
  const rawRecord = raw && typeof raw === 'object' ? raw as Record<string, unknown> : undefined;
  const chatModel = rawRecord?.chatModel;
  const chatModelRecord = chatModel && typeof chatModel === 'object' ? chatModel as Record<string, unknown> : undefined;
  const usage = chatModelRecord?.usage;
  const usageRecord = usage && typeof usage === 'object' ? usage as Record<string, unknown> : undefined;

  const model = preferredModel(
    extractModel(record),
    chatModelRecord?.responseModel,
    chatModelRecord?.modelName,
    chatModelRecord?.model,
    usageRecord?.responseModel,
    usageRecord?.modelName,
    usageRecord?.model,
    inheritedModel
  ) ?? 'unknown';

  const breakdown: TokenBreakdown = {
    inputTokens: toFiniteNumber(record.inputTokens) ?? toFiniteNumber(usageRecord?.inputTokens) ?? 0,
    outputTokens: preferObservedNumber(
      toFiniteNumber(usageRecord?.outputTokens),
      toFiniteNumber(usageRecord?.responseOutputTokens),
      toFiniteNumber(record.outputTokens)
    ),
    cacheReadTokens: toFiniteNumber(record.cacheReadTokens) ?? toFiniteNumber(usageRecord?.cacheReadTokens) ?? 0,
    cacheWriteTokens: toFiniteNumber(record.cacheWriteTokens) ?? toFiniteNumber(usageRecord?.cacheWriteTokens) ?? 0,
    reasoningTokens: toFiniteNumber(record.reasoningTokens)
      ?? toFiniteNumber(usageRecord?.thinkingOutputTokens)
      ?? toFiniteNumber(usageRecord?.reasoningTokens)
      ?? 0,
    totalTokens: toFiniteNumber(record.totalTokens) ?? toFiniteNumber(usageRecord?.totalTokens) ?? 0
  };

  breakdown.totalTokens = normalizeTotal(breakdown);
  const categorizedTotal = breakdown.inputTokens + breakdown.outputTokens + breakdown.cacheReadTokens + breakdown.cacheWriteTokens + breakdown.reasoningTokens;
  const modelTotals = categorizedTotal > 0 ? { [model]: categorizedTotal } : {};
  const modelBreakdowns = categorizedTotal > 0 ? { [model]: breakdown } : {};
  const hits = categorizedTotal > 0 || breakdown.totalTokens > 0 ? 1 : 0;

  return { breakdown, hits, modelTotals, modelBreakdowns };
}

function finalizeReported(
  candidate: SessionParsePlan,
  label: string,
  breakdown: TokenBreakdown,
  modelTotals: Record<string, number>,
  modelBreakdowns: Record<string, ModelTokenBreakdown>,
  evidenceCount: number,
  messageCount: number
): SessionTotals {
  return {
    sessionId: candidate.sessionId,
    label,
    filePath: candidate.sessionDir,
    lastModifiedMs: candidate.lastModifiedMs,
    mode: 'reported',
    source: candidate.source,
    evidenceCount,
    modelTotals,
    modelBreakdowns,
    messageCount,
    ...breakdown,
    totalTokens: normalizeTotal(breakdown)
  };
}

function finalizeEstimated(candidate: SessionParsePlan, label: string, text: string, messageCount: number): SessionTotals {
  const estimatedTotal = estimateTokens(text);
  return {
    sessionId: candidate.sessionId,
    label,
    filePath: candidate.sessionDir,
    lastModifiedMs: candidate.lastModifiedMs,
    mode: 'estimated',
    source: candidate.source,
    evidenceCount: 0,
    modelTotals: {},
    modelBreakdowns: {},
    messageCount,
    inputTokens: Math.round(estimatedTotal * 0.62),
    outputTokens: Math.round(estimatedTotal * 0.38),
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: estimatedTotal
  };
}

function estimateTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }

  return Math.max(1, Math.round(normalized.length / 4));
}

function emptyBreakdown(): TokenBreakdown {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0
  };
}

function mergeBreakdown(target: TokenBreakdown, source: TokenBreakdown): void {
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.totalTokens += source.totalTokens;
}

function normalizeTotal(breakdown: TokenBreakdown): number {
  const subtotal = breakdown.inputTokens
    + breakdown.outputTokens
    + breakdown.cacheReadTokens
    + breakdown.cacheWriteTokens
    + breakdown.reasoningTokens;

  return Math.max(breakdown.totalTokens, subtotal);
}

function mergeModelTotals(target: Record<string, number>, source: Record<string, number>): void {
  for (const [model, total] of Object.entries(source)) {
    if (total === 0) {
      continue;
    }
    target[model] = (target[model] ?? 0) + total;
  }
}

function mergeModelBreakdowns(
  target: Record<string, ModelTokenBreakdown>,
  source: Record<string, ModelTokenBreakdown>
): void {
  for (const [model, breakdown] of Object.entries(source)) {
    const next = target[model] ?? emptyBreakdown();
    mergeBreakdown(next, breakdown);
    next.totalTokens = normalizeTotal(next);
    target[model] = next;
  }
}

function mergeModelCategory(
  target: Record<string, ModelTokenBreakdown>,
  model: string,
  partial: Partial<ModelTokenBreakdown>
): void {
  const next = target[model] ?? emptyBreakdown();
  next.inputTokens += partial.inputTokens ?? 0;
  next.outputTokens += partial.outputTokens ?? 0;
  next.cacheReadTokens += partial.cacheReadTokens ?? 0;
  next.cacheWriteTokens += partial.cacheWriteTokens ?? 0;
  next.reasoningTokens += partial.reasoningTokens ?? 0;
  next.totalTokens += partial.totalTokens ?? 0;
  target[model] = next;
}

function finalizeModelBreakdowns(target: Record<string, ModelTokenBreakdown>): void {
  for (const breakdown of Object.values(target)) {
    breakdown.totalTokens = normalizeTotal(breakdown);
  }
}

function extractModel(input: Record<string, unknown>): string | undefined {
  const direct = preferredModel(input.responseModel, input.model, input.modelId, input.modelName);
  if (direct) {
    return direct;
  }

  const chatModel = input.chatModel;
  if (chatModel && typeof chatModel === 'object') {
    const chatModelRecord = chatModel as Record<string, unknown>;
    const nested = preferredModel(
      chatModelRecord.responseModel,
      chatModelRecord.model,
      chatModelRecord.modelId,
      chatModelRecord.modelName
    );
    if (nested) {
      return nested;
    }

    const usage = chatModelRecord.usage;
    if (usage && typeof usage === 'object') {
      const usageRecord = usage as Record<string, unknown>;
      return preferredModel(
        usageRecord.responseModel,
        usageRecord.model,
        usageRecord.modelId,
        usageRecord.modelName
      );
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

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function preferObservedNumber(...values: Array<number | undefined>): number {
  for (const value of values) {
    if (value !== undefined && value > 0) {
      return value;
    }
  }

  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }

  return 0;
}
