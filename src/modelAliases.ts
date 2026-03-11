/**
 * Resolves internal model placeholder IDs to human-readable model names.
 *
 * The Antigravity RPC server uses internal identifiers (e.g. MODEL_PLACEHOLDER_M18)
 * instead of real model names.  Newer API responses include a `responseModel` field
 * with the real name, but older sessions lack it.  This map provides a static
 * fallback so that every placeholder can be resolved.
 */

const PLACEHOLDER_MODEL_MAP: Record<string, string> = {
  // Gemini 3.1 Pro
  'MODEL_PLACEHOLDER_M37': 'gemini-3.1-pro-high',
  'MODEL_PLACEHOLDER_M36': 'gemini-3.1-pro-low',

  // Gemini 3 Flash
  'MODEL_PLACEHOLDER_M18': 'gemini-3-flash',

  // Gemini 3 Pro (legacy, redirected to 3.1 Pro)
  'MODEL_PLACEHOLDER_M8': 'gemini-3-pro-high',
  'MODEL_PLACEHOLDER_M7': 'gemini-3-pro-low',

  // Gemini 3 Pro Image
  'MODEL_PLACEHOLDER_M9': 'gemini-3-pro-image',

  // Claude Opus 4.6 (Thinking)
  'MODEL_PLACEHOLDER_M26': 'claude-opus-4-6-thinking',

  // Claude Sonnet 4.6 (Thinking)
  'MODEL_PLACEHOLDER_M35': 'claude-sonnet-4-6-thinking',

  // Claude Opus 4.5 (Thinking) — legacy, redirected to Opus 4.6
  'MODEL_PLACEHOLDER_M12': 'claude-opus-4-5-thinking',

  // Non-placeholder internal IDs
  'MODEL_OPENAI_GPT_OSS_120B_MEDIUM': 'gpt-oss-120b-medium',
  'MODEL_CLAUDE_4_5_SONNET': 'claude-sonnet-4-5',
  'MODEL_CLAUDE_4_5_SONNET_THINKING': 'claude-sonnet-4-5-thinking',
};

/**
 * Attempts to resolve a model placeholder string to a human-readable name.
 * Returns `undefined` if the value is not a known placeholder.
 */
export function resolveModelPlaceholder(value: string): string | undefined {
  return PLACEHOLDER_MODEL_MAP[value];
}
