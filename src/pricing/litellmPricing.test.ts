import { describe, expect, it, vi } from 'vitest';
import {
  calculateModelCost,
  LiteLlmPricingCatalog,
  parseLiteLlmPriceMap,
  parseModelsDevPriceMap
} from './litellmPricing';

describe('litellmPricing', () => {
  it('parses pricing payloads and skips sample_spec', () => {
    expect(parseLiteLlmPriceMap({
      sample_spec: { input_cost_per_token: 99 },
      'openai/gpt-4o-mini': {
        input_cost_per_token: 0.000001,
        output_cost_per_token: 0.000002
      }
    })).toEqual({
      'openai/gpt-4o-mini': {
        input_cost_per_token: 0.000001,
        output_cost_per_token: 0.000002,
        cache_read_input_token_cost: undefined,
        cache_creation_input_token_cost: undefined,
        output_cost_per_reasoning_token: undefined
      }
    });
  });

  it('calculates cost from token categories and flags unknown pricing', () => {
    const priced = calculateModelCost({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      reasoningTokens: 20,
      totalTokens: 185
    }, {
      input_cost_per_token: 0.000001,
      output_cost_per_token: 0.000002,
      cache_read_input_token_cost: 0.0000005,
      cache_creation_input_token_cost: 0.000001,
      output_cost_per_reasoning_token: 0.000003
    }, 'No LiteLLM pricing match.');

    expect(priced.pricingStatus).toBe('priced');
    expect(priced.costUsd).toBeCloseTo(0.000275);

    expect(calculateModelCost(undefined, undefined, 'No LiteLLM pricing match.')).toEqual({
      pricingStatus: 'unpriced',
      pricingNote: 'Per-model token breakdown unavailable.'
    });
  });

  it('caches remote pricing until ttl expiry', async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => new Response(JSON.stringify({
      'openai/gpt-4o-mini': { input_cost_per_token: 0.000001 }
    }), { status: 200 }));
    let now = 1000;
    const catalog = new LiteLlmPricingCatalog(fetchImpl, 'https://example.test/pricing.json', 1000, () => now);

    const first = await catalog.getSnapshot();
    const second = await catalog.getSnapshot();
    now = 2501;
    const third = await catalog.getSnapshot();

    expect(first.priceMap['openai/gpt-4o-mini']?.input_cost_per_token).toBe(0.000001);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(third.fetchedAt).toBe(now);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('resolves provider-qualified pricing from common model aliases', async () => {
    const catalog = new LiteLlmPricingCatalog(async () => new Response(JSON.stringify({
      'vertex_ai/gemini-2.5-pro': { input_cost_per_token: 0.000001 }
    }), { status: 200 }), 'https://example.test/pricing.json');

    await catalog.getSnapshot();

    expect(catalog.resolveModelPricing('models/gemini-2.5-pro')?.input_cost_per_token).toBe(0.000001);
    expect(catalog.resolveModelPricing('gemini-2.5-pro')?.input_cost_per_token).toBe(0.000001);
  });

  it('resolves Antigravity Gemini aliases to LiteLLM preview entries', async () => {
    const catalog = new LiteLlmPricingCatalog(async () => new Response(JSON.stringify({
      'gemini-3.1-pro-preview': { input_cost_per_token: 0.00001 },
      'gemini-3-flash-preview': { input_cost_per_token: 0.000001 }
    }), { status: 200 }), 'https://example.test/pricing.json');

    await catalog.getSnapshot();

    expect(catalog.resolveModelPricing('gemini-3.1-pro-high')?.input_cost_per_token).toBe(0.00001);
    expect(catalog.resolveModelPricing('gemini-3-flash')?.input_cost_per_token).toBe(0.000001);
    expect(catalog.resolveModelPricing('gemini-3-flash-c')?.input_cost_per_token).toBe(0.000001);
  });

  it('does not resolve ambiguous bare suffix aliases across providers', async () => {
    const catalog = new LiteLlmPricingCatalog(async () => new Response(JSON.stringify({
      'openai/foo': { input_cost_per_token: 0.000001 },
      'azure/foo': { input_cost_per_token: 0.000002 }
    }), { status: 200 }), 'https://example.test/pricing.json');

    await catalog.getSnapshot();

    expect(catalog.resolveModelPricing('foo')).toBeUndefined();
    expect(catalog.resolveModelPricing('openai/foo')?.input_cost_per_token).toBe(0.000001);
    expect(catalog.resolveModelPricing('azure/foo')?.input_cost_per_token).toBe(0.000002);
  });

  it('resolves safe bare aliases for thinking-tier model names', async () => {
    const catalog = new LiteLlmPricingCatalog(async () => new Response(JSON.stringify({
      'claude-opus-4-6': { input_cost_per_token: 0.000005 },
      'azure_ai/gpt-oss-120b': { input_cost_per_token: 0.000001 },
      'groq/openai/gpt-oss-120b': { input_cost_per_token: 0.000002 },
      'openai.gpt-oss-120b-1:0': { input_cost_per_token: 0.000003 }
    }), { status: 200 }), 'https://example.test/pricing.json');

    await catalog.getSnapshot();

    expect(catalog.resolveModelPricing('claude-opus-4-6-thinking')?.input_cost_per_token).toBe(0.000005);
    expect(catalog.resolveModelPricing('gpt-oss-120b-medium')?.input_cost_per_token).toBe(0.000003);
  });

  it('resolves gemini 3.8 quality suffix aliases (-n, -h, -m, -l, -q) and multi-provider argon trial', async () => {
    const catalog = new LiteLlmPricingCatalog(async () => new Response(JSON.stringify({
      'gemini-3.8-flash': { input_cost_per_token: 0.00000075 },
      'gemini/gemini-4-argon': { input_cost_per_token: 0.000002 },
      'vertex_ai/gemini-4-argon': { input_cost_per_token: 0.000002 },
      'perplexity/google/gemini-4-argon': { input_cost_per_token: 0.000009 }
    }), { status: 200 }), 'https://example.test/pricing.json');

    await catalog.getSnapshot();

    expect(catalog.resolveModelPricing('gemini-3.8-flash-n')?.input_cost_per_token).toBe(0.00000075);
    expect(catalog.resolveModelPricing('gemini-3.8-flash-h')?.input_cost_per_token).toBe(0.00000075);
    expect(catalog.resolveModelPricing('gemini-3.8-flash-q')?.input_cost_per_token).toBe(0.00000075);
    expect(catalog.resolveModelPricing('gemini-4-argon-trial')?.input_cost_per_token).toBe(0.000002);
  });

  it('parses models.dev per-1M payloads into per-token pricing', () => {
    const parsed = parseModelsDevPriceMap({
      google: {
        models: {
          'gemini-4-argon': {
            cost: { input: 2, output: 10, cache_read: 0.1 }
          },
          'no-cost': {}
        }
      },
      nearai: {
        models: {
          'google/gemini-3.8-flash': {
            cost: { input: 0.75, output: 3.75 }
          }
        }
      }
    });

    expect(parsed['google/gemini-4-argon']).toEqual({
      input_cost_per_token: 0.000002,
      output_cost_per_token: 0.00001,
      cache_read_input_token_cost: 0.0000001,
      cache_creation_input_token_cost: undefined,
      output_cost_per_reasoning_token: undefined
    });
    expect(parsed['nearai/google/gemini-3.8-flash']?.input_cost_per_token).toBe(0.00000075);
    expect(parsed['google/no-cost']).toBeUndefined();
  });

  it('merges models.dev and LiteLLM sources with graceful fallback when one fails', async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('models.dev')) {
        return new Response(JSON.stringify({
          google: {
            models: {
              'gemini-4-argon': { cost: { input: 2, output: 10, cache_read: 0.1 } }
            }
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        'gemini-3.8-flash': { input_cost_per_token: 0.00000075, output_cost_per_token: 0.00000375 }
      }), { status: 200 });
    });

    const catalog = new LiteLlmPricingCatalog(fetchImpl);
    await catalog.getSnapshot();

    expect(catalog.resolveModelPricing('gemini-4-argon-trial')?.input_cost_per_token).toBe(0.000002);
    expect(catalog.resolveModelPricing('gemini-3.8-flash-q')?.input_cost_per_token).toBe(0.00000075);

    const partialFailFetch: typeof fetch = vi.fn(async (input) => {
      if (String(input).includes('models.dev')) {
        return new Response('unavailable', { status: 503 });
      }
      return new Response(JSON.stringify({
        'gemini/gemini-4-argon': { input_cost_per_token: 0.000002 }
      }), { status: 200 });
    });

    const fallbackCatalog = new LiteLlmPricingCatalog(partialFailFetch);
    await fallbackCatalog.getSnapshot();
    expect(fallbackCatalog.resolveModelPricing('gemini-4-argon-trial')?.input_cost_per_token).toBe(0.000002);
  });
});
