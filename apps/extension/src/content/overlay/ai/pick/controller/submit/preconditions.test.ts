import { describe, expect, it } from 'vitest';

import { canSubmitAiPickPrompt } from './preconditions';

describe('canSubmitAiPickPrompt', () => {
  it('requires a non-empty prompt, a selected model, and an idle loading state', () => {
    expect(
      canSubmitAiPickPrompt({ isLoading: false, prompt: 'Summarize', selectedModelId: 'model-1' })
    ).toBe(true);
    expect(
      canSubmitAiPickPrompt({ isLoading: false, prompt: '   ', selectedModelId: 'model-1' })
    ).toBe(false);
    expect(
      canSubmitAiPickPrompt({ isLoading: false, prompt: 'Summarize', selectedModelId: null })
    ).toBe(false);
    expect(
      canSubmitAiPickPrompt({ isLoading: true, prompt: 'Summarize', selectedModelId: 'model-1' })
    ).toBe(false);
  });
});
