import type { ModelTokenBreakdown } from '../types';

const DEFAULT_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const DEFAULT_MODELS_DEV_URL = 'https://models.dev/api.json';
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TOKENS_PER_MILLION = 1_000_000;

const FAMILY_PROVIDER_PREFIXES: ReadonlyArray<{ pattern: RegExp; prefixes: readonly string[] }> = [
  {
    pattern: /^gemini-/u,
    prefixes: ['google/', 'gemini/', 'vertex_ai/', 'google-vertex/', 'google-ai-studio/']
  },
  {
    pattern: /^claude-/u,
    prefixes: ['anthropic/', 'claude/', 'vertex_ai/', 'anthropic_vertex/', 'bedrock/']
  },
  {
    pattern: /^(?:gpt-|o[134](?:-|$)|chatgpt-)/u,
    prefixes: ['openai/', 'azure/']
  },
  {
    pattern: /^deepseek-/u,
    prefixes: ['deepseek/']
  },
  {
    pattern: /^qwen/u,
    prefixes: ['alibaba/', 'qwen/', 'dashscope/']
  },
  {
    pattern: /^grok-/u,
    prefixes: ['xai/']
  }
];

export type LiteLlmModelPricing = {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  output_cost_per_reasoning_token?: number;
};

export type LiteLlmPricingSnapshot = {
  fetchedAt: number;
  priceMap: Record<string, LiteLlmModelPricing>;
};

export type PricingSourceOptions = {
  secondaryPricingUrl?: string;
};

type PricingCacheEntry = LiteLlmPricingSnapshot & {
  exactIndex: Map<string, LiteLlmModelPricing>;
  suffixIndex: Map<string, LiteLlmModelPricing>;
};

export type ModelCostResult = {
  costUsd?: number;
  cacheSavedUsd?: number;
  cacheHitRate?: number;
  pricingStatus: 'priced' | 'unpriced';
  pricingNote?: string;
};

export function calculateCacheHitRate(cacheReadTokens: number, inputTokens: number): number | undefined {
  const denominator = Math.max(0, cacheReadTokens) + Math.max(0, inputTokens);
  if (denominator <= 0) {
    return undefined;
  }
  return Math.max(0, cacheReadTokens) / denominator;
}

export class LiteLlmPricingCatalog {
  private cache: PricingCacheEntry | undefined;
  private inFlight: Promise<LiteLlmPricingSnapshot> | undefined;
  private readonly secondaryPricingUrl: string | undefined;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly pricingUrl: string = DEFAULT_PRICING_URL,
    private readonly ttlMs: number = DEFAULT_CACHE_TTL_MS,
    private readonly now: () => number = () => Date.now(),
    options: PricingSourceOptions = {}
  ) {
    this.secondaryPricingUrl = options.secondaryPricingUrl !== undefined
      ? options.secondaryPricingUrl
      : (pricingUrl === DEFAULT_PRICING_URL ? DEFAULT_MODELS_DEV_URL : undefined);
  }

  async getSnapshot(): Promise<LiteLlmPricingSnapshot> {
    if (this.cache && this.now() - this.cache.fetchedAt < this.ttlMs) {
      return { fetchedAt: this.cache.fetchedAt, priceMap: this.cache.priceMap };
    }

    if (!this.inFlight) {
      this.inFlight = this.fetchSnapshot();
    }

    try {
      return await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
  }

  resolveModelPricing(model: string): LiteLlmModelPricing | undefined {
    const aliases = buildModelAliases(model);
    if (!this.cache) {
      return undefined;
    }

    // Prefer canonical official provider entries for bare model names (e.g. google/gemini-*, anthropic/claude-*)
    // before falling back to bare exact keys or unique suffix matches.
    for (const alias of aliases) {
      if (!alias.includes('/')) {
        for (const prefix of getPreferredProviderPrefixes(alias)) {
          const providerMatch = this.cache.exactIndex.get(`${prefix}${alias}`);
          if (providerMatch) {
            return providerMatch;
          }
        }
      }

      const exactMatch = this.cache.exactIndex.get(alias);
      if (exactMatch) {
        return exactMatch;
      }
    }

    for (const alias of aliases) {
      const suffixMatch = this.cache.suffixIndex.get(alias);
      if (suffixMatch) {
        return suffixMatch;
      }
    }

    return undefined;
  }

  private async fetchSnapshot(): Promise<LiteLlmPricingSnapshot> {
    const urls = this.secondaryPricingUrl
      ? [this.secondaryPricingUrl, this.pricingUrl]
      : [this.pricingUrl];

    const settled = await Promise.allSettled(
      urls.map((url) => this.fetchSourcePriceMap(url))
    );

    const maps: Array<Record<string, LiteLlmModelPricing>> = [];
    const errors: string[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        maps.push(result.value);
      } else {
        errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
    }

    if (maps.length === 0) {
      throw new Error(errors.join(' | ') || 'Pricing fetch failed.');
    }

    // Merge fallback first, then primary so primary values win per field while missing optional fields fill from fallback.
    const priceMap = maps.length === 1
      ? maps[0]
      : mergePriceMaps(maps[0], maps[1]);

    const fetchedAt = this.now();
    this.cache = {
      fetchedAt,
      priceMap,
      exactIndex: buildExactIndex(priceMap),
      suffixIndex: buildSuffixIndex(priceMap)
    };

    return { fetchedAt, priceMap };
  }

  private async fetchSourcePriceMap(url: string): Promise<Record<string, LiteLlmModelPricing>> {
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Pricing fetch (${url}) failed with status ${response.status}.`);
    }

    const parsed = await response.json() as unknown;
    return isModelsDevPayload(parsed)
      ? parseModelsDevPriceMap(parsed)
      : parseLiteLlmPriceMap(parsed);
  }
}

export function calculateModelCost(
  breakdown: ModelTokenBreakdown | undefined,
  pricing: LiteLlmModelPricing | undefined,
  unavailableNote: string
): ModelCostResult {
  if (!breakdown) {
    return { pricingStatus: 'unpriced', pricingNote: 'Per-model token breakdown unavailable.' };
  }

  if (!pricing) {
    return { pricingStatus: 'unpriced', pricingNote: unavailableNote };
  }

  const inputCost = pricing.input_cost_per_token;
  const outputCost = pricing.output_cost_per_token;
  const cacheReadCost = pricing.cache_read_input_token_cost ?? pricing.input_cost_per_token;
  const cacheWriteCost = pricing.cache_creation_input_token_cost ?? pricing.input_cost_per_token;
  const reasoningCost = pricing.output_cost_per_reasoning_token ?? pricing.output_cost_per_token;

  if (inputCost === undefined && outputCost === undefined && reasoningCost === undefined) {
    return { pricingStatus: 'unpriced', pricingNote: unavailableNote };
  }

  const costUsd = (breakdown.inputTokens * (inputCost ?? 0))
    + (breakdown.outputTokens * (outputCost ?? 0))
    + (breakdown.cacheReadTokens * (cacheReadCost ?? 0))
    + (breakdown.cacheWriteTokens * (cacheWriteCost ?? 0))
    + (breakdown.reasoningTokens * (reasoningCost ?? 0));

  const cacheHitRate = calculateCacheHitRate(breakdown.cacheReadTokens, breakdown.inputTokens);
  const cacheSavedUsd = inputCost !== undefined
    && pricing.cache_read_input_token_cost !== undefined
    && inputCost > pricing.cache_read_input_token_cost
    ? breakdown.cacheReadTokens * (inputCost - pricing.cache_read_input_token_cost)
    : 0;

  return { costUsd, cacheSavedUsd, cacheHitRate, pricingStatus: 'priced' };
}

export function parseLiteLlmPriceMap(input: unknown): Record<string, LiteLlmModelPricing> {
  if (!input || typeof input !== 'object') {
    throw new Error('LiteLLM pricing payload is not an object.');
  }

  const priceMap: Record<string, LiteLlmModelPricing> = {};
  for (const [model, rawValue] of Object.entries(input as Record<string, unknown>)) {
    if (model === 'sample_spec' || !rawValue || typeof rawValue !== 'object') {
      continue;
    }

    const pricing = rawValue as Record<string, unknown>;
    priceMap[model] = {
      input_cost_per_token: toFiniteNumber(pricing.input_cost_per_token),
      output_cost_per_token: toFiniteNumber(pricing.output_cost_per_token),
      cache_read_input_token_cost: toFiniteNumber(pricing.cache_read_input_token_cost),
      cache_creation_input_token_cost: toFiniteNumber(pricing.cache_creation_input_token_cost),
      output_cost_per_reasoning_token: toFiniteNumber(pricing.output_cost_per_reasoning_token)
    };
  }

  return priceMap;
}

/** Parses `https://models.dev/api.json` provider/model tree into per-token USD pricing entries. */
export function parseModelsDevPriceMap(input: unknown): Record<string, LiteLlmModelPricing> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('models.dev pricing payload is not an object.');
  }

  const priceMap: Record<string, LiteLlmModelPricing> = {};
  for (const [providerId, rawProvider] of Object.entries(input as Record<string, unknown>)) {
    if (!rawProvider || typeof rawProvider !== 'object') {
      continue;
    }

    const rawModels = (rawProvider as Record<string, unknown>).models;
    if (!rawModels || typeof rawModels !== 'object') {
      continue;
    }

    const providerPrefix = `${normalizeModelKey(providerId)}/`;
    for (const [modelId, rawModel] of Object.entries(rawModels as Record<string, unknown>)) {
      if (!rawModel || typeof rawModel !== 'object') {
        continue;
      }

      const cost = (rawModel as Record<string, unknown>).cost;
      if (!cost || typeof cost !== 'object') {
        continue;
      }

      const costObj = cost as Record<string, unknown>;
      const entry: LiteLlmModelPricing = {
        input_cost_per_token: perMillionToPerToken(costObj.input),
        output_cost_per_token: perMillionToPerToken(costObj.output),
        cache_read_input_token_cost: perMillionToPerToken(costObj.cache_read),
        cache_creation_input_token_cost: perMillionToPerToken(costObj.cache_write),
        output_cost_per_reasoning_token: perMillionToPerToken(costObj.reasoning)
      };

      if (
        entry.input_cost_per_token === undefined
        && entry.output_cost_per_token === undefined
        && entry.output_cost_per_reasoning_token === undefined
      ) {
        continue;
      }

      const normalizedModelId = normalizeModelKey(modelId);
      const key = normalizedModelId.startsWith(providerPrefix)
        ? modelId
        : `${providerId}/${modelId}`;
      priceMap[key] = entry;
    }
  }

  return priceMap;
}

function isModelsDevPayload(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false;
  }

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key === 'sample_spec' || !value || typeof value !== 'object') {
      continue;
    }

    const record = value as Record<string, unknown>;
    if ('input_cost_per_token' in record || 'output_cost_per_token' in record || 'litellm_provider' in record) {
      return false;
    }

    if (record.models && typeof record.models === 'object' && !Array.isArray(record.models)) {
      return true;
    }
  }

  return false;
}

function mergePriceMaps(
  primaryMap: Record<string, LiteLlmModelPricing>,
  fallbackMap: Record<string, LiteLlmModelPricing>
): Record<string, LiteLlmModelPricing> {
  const merged: Record<string, LiteLlmModelPricing> = { ...fallbackMap };
  const fallbackByNormalizedKey = new Map<string, LiteLlmModelPricing>();
  for (const [key, pricing] of Object.entries(fallbackMap)) {
    fallbackByNormalizedKey.set(normalizeModelKey(key), pricing);
  }

  for (const [key, primary] of Object.entries(primaryMap)) {
    const existing = merged[key] ?? fallbackByNormalizedKey.get(normalizeModelKey(key));
    merged[key] = existing ? mergePricingEntries(primary, existing) : primary;
  }

  return merged;
}

function mergePricingEntries(
  primary: LiteLlmModelPricing,
  fallback: LiteLlmModelPricing
): LiteLlmModelPricing {
  return {
    input_cost_per_token: primary.input_cost_per_token ?? fallback.input_cost_per_token,
    output_cost_per_token: primary.output_cost_per_token ?? fallback.output_cost_per_token,
    cache_read_input_token_cost: primary.cache_read_input_token_cost ?? fallback.cache_read_input_token_cost,
    cache_creation_input_token_cost: primary.cache_creation_input_token_cost ?? fallback.cache_creation_input_token_cost,
    output_cost_per_reasoning_token: primary.output_cost_per_reasoning_token ?? fallback.output_cost_per_reasoning_token
  };
}

function buildExactIndex(priceMap: Record<string, LiteLlmModelPricing>): Map<string, LiteLlmModelPricing> {
  const exactIndex = new Map<string, LiteLlmModelPricing>();
  for (const [model, pricing] of Object.entries(priceMap)) {
    const normalized = normalizeModelKey(model);
    if (!exactIndex.has(normalized)) {
      exactIndex.set(normalized, pricing);
    }

    if (normalized.startsWith('models/')) {
      const unwrapped = normalized.slice('models/'.length);
      if (!exactIndex.has(unwrapped)) {
        exactIndex.set(unwrapped, pricing);
      }
    }
  }
  return exactIndex;
}

function buildSuffixIndex(priceMap: Record<string, LiteLlmModelPricing>): Map<string, LiteLlmModelPricing> {
  const grouped = new Map<string, LiteLlmModelPricing[]>();
  for (const [model, pricing] of Object.entries(priceMap)) {
    const normalized = normalizeModelKey(model);
    if (!normalized.includes('/')) {
      continue;
    }

    const suffix = normalized.split('/').at(-1);
    if (!suffix) {
      continue;
    }

    const existing = grouped.get(suffix) ?? [];
    existing.push(pricing);
    grouped.set(suffix, existing);
  }

  const suffixIndex = new Map<string, LiteLlmModelPricing>();
  for (const [suffix, matches] of grouped.entries()) {
    if (matches.length === 1) {
      suffixIndex.set(suffix, matches[0]);
    }
  }

  return suffixIndex;
}

function getPreferredProviderPrefixes(model: string): readonly string[] {
  for (const rule of FAMILY_PROVIDER_PREFIXES) {
    if (rule.pattern.test(model)) {
      return rule.prefixes;
    }
  }

  return [];
}

function addPathAliases(aliases: Set<string>, candidate: string): void {
  if (!candidate) {
    return;
  }

  aliases.add(candidate);
  if (candidate.startsWith('models/')) {
    aliases.add(candidate.slice('models/'.length));
  }

  if (candidate.includes('/')) {
    const leaf = candidate.split('/').at(-1);
    if (leaf) {
      aliases.add(leaf);
    }
  }
}

function buildModelAliases(model: string): string[] {
  const normalized = normalizeModelKey(model);
  if (!normalized) {
    return [];
  }

  const aliases = new Set<string>();
  const trimmedTier = normalized.replace(/-(n|h|m|l|q|c|trial)$/u, '');
  const trimmedQuality = trimmedTier.replace(/(?:-(high|low|medium|thinking|c))+$/u, '');
  const baseCandidates = [normalized, trimmedTier, trimmedQuality];

  for (const candidate of baseCandidates) {
    addPathAliases(aliases, candidate);
  }

  if (/^gemini-3(\.|-)/u.test(trimmedQuality) && !trimmedQuality.endsWith('-preview')) {
    aliases.add(`${trimmedQuality}-preview`);
  }

  if (/^claude-.*-\d+-\d+$/u.test(trimmedQuality)) {
    aliases.add(trimmedQuality.replace(/-(\d+)-(\d+)$/u, '-$1.$2'));
  }

  if (/^gpt-oss-120b(?:-(medium|high|low))?$/u.test(trimmedQuality)) {
    aliases.add('openai.gpt-oss-120b-1:0');
  }

  return Array.from(aliases);
}

function normalizeModelKey(value: string): string {
  return value.trim().toLowerCase();
}

function perMillionToPerToken(value: unknown): number | undefined {
  const num = toFiniteNumber(value);
  return num === undefined ? undefined : Number((num / TOKENS_PER_MILLION).toPrecision(12));
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
