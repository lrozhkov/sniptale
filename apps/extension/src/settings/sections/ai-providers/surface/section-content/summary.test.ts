import { describe, expect, it, vi } from 'vitest';

import { getAiProvidersPromptDisclosureSummary } from '../summary';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

describe('ai-providers section-content summary', () => {
  it('returns the empty summary copy when the prompt is blank', () => {
    expect(getAiProvidersPromptDisclosureSummary('   ')).toBe(
      'settings.aiProviders.globalPromptEmptySummary'
    );
  });

  it('returns the saved summary copy with prompt length when the prompt has content', () => {
    expect(getAiProvidersPromptDisclosureSummary('Global prompt')).toContain('13');
  });
});
