import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { getAiModelPromptLabel, getAiProviderDeleteMessage } from './helpers';

describe('ai providers section helpers', () => {
  it('builds provider and model delete confirmation messages', () => {
    expect(
      getAiProviderDeleteMessage({
        item: { name: 'OpenAI' },
        type: 'provider',
      } as never)
    ).toBe(
      'settings.aiProviders.deleteProviderMessagePrefixOpenAIsettings.aiProviders.deleteProviderMessageSuffix'
    );

    expect(
      getAiProviderDeleteMessage({
        item: { displayName: 'GPT 4.1' },
        type: 'model',
      } as never)
    ).toBe(
      'settings.aiProviders.deleteModelMessagePrefixGPT 4.1settings.aiProviders.deleteModelMessageSuffix'
    );
  });

  it('switches model prompt labels between inherited and overridden states', () => {
    expect(getAiModelPromptLabel({ systemPrompt: '' } as never)).toBe(
      'settings.aiProviders.modelPromptInherited'
    );

    expect(getAiModelPromptLabel({ systemPrompt: 'abc' } as never)).toBe(
      'settings.aiProviders.modelPromptOverriddenPrefix3settings.aiProviders.modelPromptOverriddenSuffix'
    );
  });
});
