import { describe, expect, it } from 'vitest';
import { isAllowedAIProviderBaseUrl } from '@sniptale/runtime-contracts/ai/provider-base-url-policy';
import {
  AI_PROVIDER_TYPES,
  getAIProviderDefinition,
  isAIProviderType,
  listAIProviderDefinitions,
} from './ai-provider';

describe('AI connection definitions', () => {
  it('keeps compatible first and sorts every remaining visible label alphabetically', () => {
    const definitions = listAIProviderDefinitions();
    expect(definitions[0]?.type).toBe('openai-compatible');
    const names = definitions.slice(1).map((entry) => entry.label);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
    );
    expect(new Set(definitions.map((entry) => entry.type)).size).toBe(21);
  });

  it('uses the exact neuraldeep.ru label and documented service origin', () => {
    expect(getAIProviderDefinition('neuraldeep')).toMatchObject({
      label: 'neuraldeep.ru',
      baseUrl: 'https://api.neuraldeep.ru/v1',
      catalog: 'openai',
      available: true,
    });
  });

  it('does not offer an incompatible GigaChat package as executable', () => {
    expect(getAIProviderDefinition('gigachat').available).toBe(false);
  });

  it('uses allowed defaults and does not require cloud credentials for local backends', () => {
    for (const type of AI_PROVIDER_TYPES) {
      const definition = getAIProviderDefinition(type);
      if (definition.baseUrl) expect(isAllowedAIProviderBaseUrl(definition.baseUrl)).toBe(true);
    }
    for (const type of ['ollama', 'lm-studio', 'chrome-built-in'] as const) {
      expect(getAIProviderDefinition(type).credential).toBe('none');
    }
  });

  it('rejects arbitrary provider kinds at the contract boundary', () => {
    expect(isAIProviderType('neuraldeep')).toBe(true);
    expect(isAIProviderType('../remote-package')).toBe(false);
    expect(isAIProviderType(null)).toBe(false);
  });
});
