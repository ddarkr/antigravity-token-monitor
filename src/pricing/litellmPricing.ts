import type { ModelTokenBreakdown } from '../types';

const DEFAULT_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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

type PricingCacheEntry = LiteLlmPricingSnapshot & {
  exactIndex: Map<string, LiteLlmModelPricing>;
  suffixIndex: Map<string, LiteLlmModelPricing>;
};

export type ModelCostResult = {
  costUsd?: number;
  pricingStatus: 'priced' | 'unpriced';
  pricingNote?: string;
};

export class LiteLlmPricingCatalog {
  private cache: PricingCacheEntry | undefined;
  private inFlight: Promise<LiteLlmPricingSnapshot> | undefined;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly pricingUrl: string = DEFAULT_PRICING_URL,
    private readonly ttlMs: number = DEFAULT_CACHE_TTL_MS,
    private readonly now: () => number = () => Date.now()
  ) {}

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

    for (const alias of aliases) {
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
    const response = await this.fetchImpl(this.pricingUrl);
    if (!response.ok) {
      throw new Error(`LiteLLM pricing fetch failed with status ${response.status}.`);
    }

    const parsed = await response.json() as unknown;
    const priceMap = parseLiteLlmPriceMap(parsed);
    const fetchedAt = this.now();
    this.cache = {
      fetchedAt,
      priceMap,
      exactIndex: buildExactIndex(priceMap),
      suffixIndex: buildSuffixIndex(priceMap)
    };

    return { fetchedAt, priceMap };
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

  return { costUsd, pricingStatus: 'priced' };
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

function buildModelAliases(model: string): string[] {
  const normalized = normalizeModelKey(model);
  if (!normalized) {
    return [];
  }

  const aliases = new Set<string>([normalized]);
  const trimmedQuality = normalized.replace(/-(high|low)$/u, '');
  aliases.add(trimmedQuality);
  aliases.add(trimmedQuality.replace(/-(thinking|medium)$/u, ''));

  if (normalized.startsWith('models/')) {
    aliases.add(normalized.slice('models/'.length));
  }

  if (trimmedQuality.startsWith('models/')) {
    aliases.add(trimmedQuality.slice('models/'.length));
  }

  const unwrappedBase = trimmedQuality.replace(/-(thinking|medium)$/u, '');
  if (unwrappedBase.startsWith('models/')) {
    aliases.add(unwrappedBase.slice('models/'.length));
  }

  if (normalized.includes('/')) {
    aliases.add(normalized.split('/').at(-1) ?? normalized);
  }

  if (trimmedQuality.includes('/')) {
    aliases.add(trimmedQuality.split('/').at(-1) ?? trimmedQuality);
  }

  if (unwrappedBase.includes('/')) {
    aliases.add(unwrappedBase.split('/').at(-1) ?? unwrappedBase);
  }

  if (/^gemini-3(\.|-)/u.test(trimmedQuality) && !trimmedQuality.endsWith('-preview')) {
    aliases.add(`${trimmedQuality}-preview`);
  }

  if (/^gpt-oss-120b(?:-(medium|high|low))?$/u.test(trimmedQuality)) {
    aliases.add('openai.gpt-oss-120b-1:0');
  }

  return Array.from(aliases);
}

function normalizeModelKey(value: string): string {
  return value.trim().toLowerCase();
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
