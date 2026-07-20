import { describe, expect, it } from 'vitest';
import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import { getFilteredProviders, getSelectedModelLabel } from './selector-helpers';

describe('ai modal model selector helpers', () => {
  const providers = [
    { id: 'openai', name: 'OpenAI' },
    { id: 'anthropic', name: 'Anthropic' },
  ] as AIProvider[];

  const models = [
    { id: 'gpt-4.1', providerId: 'openai', displayName: 'GPT-4.1' },
    { id: 'claude-3.7', providerId: 'anthropic', displayName: 'Claude 3.7 Sonnet' },
  ] as AIModel[];

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
