import { describe, expect, it } from 'vitest';
import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import { getFilteredProviders, getSelectedModelLabel } from './selector-helpers';

describe('ai modal model selector helpers', () => {
  const providers: AIProvider[] = [
    {
      id: 'openai',
      name: 'OpenAI',
      connectionType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      hasStoredApiKey: true,
      createdAt: 1,
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      connectionType: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      hasStoredApiKey: true,
      createdAt: 2,
    },
  ];

  const models: AIModel[] = [
    { id: 'gpt-4.1', providerId: 'openai', modelCode: 'gpt-4.1', displayName: 'GPT-4.1' },
    {
      id: 'claude-3.7',
      providerId: 'anthropic',
      modelCode: 'claude-3.7',
      displayName: 'Claude 3.7 Sonnet',
    },
  ];

  it('builds selected model label from provider and display name', () => {
    expect(getSelectedModelLabel(models, providers, 'gpt-4.1')).toBe('OpenAI / GPT-4.1');
    expect(getSelectedModelLabel(models, providers, 'missing')).toBeNull();
  });

  it('filters providers by model and provider matches', () => {
    expect(getFilteredProviders(providers, models, 'claude')).toEqual([
      {
        provider: providers[1],
        models: [models[1]],
      },
    ]);

    expect(getFilteredProviders(providers, models, 'open')).toEqual([
      {
        provider: providers[0],
        models: [models[0]],
      },
    ]);
  });
});
