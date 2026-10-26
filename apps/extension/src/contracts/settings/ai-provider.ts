import type { AIModelOperation } from './ai-catalog';
/** Supported connection kinds. Names do not imply that every model supports every operation. */
export const AI_PROVIDER_TYPES = [
  'openai-compatible',
  'alibaba',
  'anthropic',
  'chrome-built-in',
  'cohere',
  'deepgram',
  'deepseek',
  'elevenlabs',
  'google',
  'gigachat',
  'lm-studio',
  'minimax',
  'mistral',
  'moonshotai',
  'neuraldeep',
  'ollama',
  'openai',
  'openrouter',
  'xai',
  'yandex',
  'zai',
] as const;

export type AIProviderType = (typeof AI_PROVIDER_TYPES)[number];
export type AIModelManagement = 'automatic' | 'manual';
export type AICatalogProtocol =
  | 'openai'
  | 'openrouter'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'elevenlabs'
  | 'cohere'
  | 'none';

export interface AIProviderDefinition {
  type: AIProviderType;
  label: string;
  baseUrl: string;
  catalog: AICatalogProtocol;
  credential: 'api-key' | 'none' | 'oauth';
  available: boolean;
}

const DEFINITIONS: Record<AIProviderType, Omit<AIProviderDefinition, 'type'>> = {
  'openai-compatible': {
    label: 'OpenAI-compatible',
    baseUrl: '',
    catalog: 'openai',
    credential: 'api-key',
    available: true,
  },
  alibaba: {
    label: 'Alibaba Cloud / Qwen',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    catalog: 'openai',
    credential: 'api-key',
    available: true,
  },
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    catalog: 'anthropic',
    credential: 'api-key',
    available: true,
  },
  'chrome-built-in': {
    label: 'Chrome AI',
    baseUrl: '',
    catalog: 'none',
    credential: 'none',
    available: true,
  },
  cohere: {
    label: 'Cohere',
    baseUrl: 'https://api.cohere.com/v2',
    catalog: 'cohere',
    credential: 'api-key',
    available: true,
  },
  deepgram: {
    label: 'Deepgram',
    baseUrl: 'https://api.deepgram.com/v1',
    catalog: 'none',
    credential: 'api-key',
    available: true,
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    catalog: 'openai',
    credential: 'api-key',
    available: true,
  },
  elevenlabs: {
    label: 'ElevenLabs',
    baseUrl: 'https://api.elevenlabs.io/v1',
    catalog: 'elevenlabs',
    credential: 'api-key',
    available: true,
  },
  google: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    catalog: 'google',
    credential: 'api-key',
    available: true,
  },
  gigachat: {
    label: 'Sber / GigaChat',
    baseUrl: 'https://api.giga.chat/v1',
    catalog: 'none',
    credential: 'oauth',
    available: false,
  },
  'lm-studio': {
    label: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    catalog: 'openai',
    credential: 'none',
    available: true,
  },
  minimax: {
    label: 'MiniMax',
    baseUrl: 'https://api.minimax.io/anthropic/v1',
    catalog: 'none',
    credential: 'api-key',
    available: true,
  },
  mistral: {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    catalog: 'openai',
    credential: 'api-key',
    available: true,
  },
  moonshotai: {
    label: 'Moonshot AI / Kimi',
    baseUrl: 'https://api.moonshot.ai/v1',
    catalog: 'openai',
    credential: 'api-key',
    available: true,
  },
  neuraldeep: {
    label: 'neuraldeep.ru',
    baseUrl: 'https://api.neuraldeep.ru/v1',
    catalog: 'openai',
    credential: 'api-key',
    available: true,
  },
  ollama: {
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/api',
    catalog: 'ollama',
    credential: 'none',
    available: true,
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    catalog: 'openai',
    credential: 'api-key',
    available: true,
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    catalog: 'openrouter',
    credential: 'api-key',
    available: true,
  },
  xai: {
    label: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    catalog: 'openai',
    credential: 'api-key',
    available: true,
  },
  yandex: {
    label: 'Yandex AI Studio',
    baseUrl: 'https://ai.api.cloud.yandex.net/v1',
    catalog: 'openai',
    credential: 'api-key',
    available: true,
  },
  zai: {
    label: 'Z.AI / GLM',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    catalog: 'openai',
    credential: 'api-key',
    available: true,
  },
};

/** Parses a provider kind without accepting an arbitrary package or executable identifier. */
export function isAIProviderType(value: unknown): value is AIProviderType {
  return typeof value === 'string' && AI_PROVIDER_TYPES.some((type) => type === value);
}

/** Returns inert configuration. Secret activation and runtime effects belong to their existing owners. */
export function getAIProviderDefinition(type: AIProviderType): AIProviderDefinition {
  return { type, ...DEFINITIONS[type] };
}

/** Keeps the generic connection first and sorts every other user-visible name without case sensitivity. */
export function listAIProviderDefinitions(): AIProviderDefinition[] {
  const definitions = AI_PROVIDER_TYPES.map(getAIProviderDefinition);
  return definitions.sort((left, right) => {
    if (left.type === 'openai-compatible') return -1;
    if (right.type === 'openai-compatible') return 1;
    return left.label.localeCompare(right.label, 'en', { sensitivity: 'base' });
  });
}

const PROVIDER_OPERATIONS: Record<AIProviderType, readonly AIModelOperation[]> = {
  'openai-compatible': ['text', 'transcription', 'speech'],
  alibaba: ['text'],
  anthropic: ['text'],
  'chrome-built-in': ['text'],
  cohere: ['text'],
  deepgram: ['transcription', 'speech'],
  deepseek: ['text'],
  elevenlabs: ['transcription', 'speech'],
  google: ['text', 'transcription', 'speech'],
  gigachat: [],
  'lm-studio': ['text', 'transcription', 'speech'],
  minimax: ['text'],
  mistral: ['text', 'transcription', 'speech'],
  moonshotai: ['text'],
  neuraldeep: ['text', 'transcription', 'speech'],
  ollama: ['text'],
  openai: ['text', 'transcription', 'speech'],
  openrouter: ['text'],
  xai: ['text', 'transcription', 'speech'],
  yandex: ['text'],
  zai: ['text'],
};

/** Declares admitted adapter operations. Model metadata must separately establish remote support. */
export function getAIProviderOperations(type: AIProviderType): readonly AIModelOperation[] {
  return PROVIDER_OPERATIONS[type];
}
