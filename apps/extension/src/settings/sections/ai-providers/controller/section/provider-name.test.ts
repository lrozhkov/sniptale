import { expect, it } from 'vitest';

import type { AIProvider } from '../../../../../contracts/settings';
import { getAiProvidersSectionProviderName } from './provider-name';

const PROVIDERS: AIProvider[] = [
  {
    id: 'provider-1',
    name: 'OpenAI',
    connectionType: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    hasStoredApiKey: true,
    createdAt: 1,
  },
];

it('returns the provider name for a matching provider id', () => {
  expect(getAiProvidersSectionProviderName(PROVIDERS, 'provider-1')).toBe('OpenAI');
});

it('falls back to Unknown when the provider id is missing', () => {
  expect(getAiProvidersSectionProviderName(PROVIDERS, 'missing')).toBe('Unknown');
});
