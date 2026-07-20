import { describe, expect, it, vi } from 'vitest';
import { preloadAiPickSubmit, submitAiPickPromptDeferred } from './lazy';

const aiPickSubmitLazyMocks = vi.hoisted(() => ({
  submitAiPickPromptMock: vi.fn(),
}));

vi.mock('.', () => ({
  submitAiPickPrompt: aiPickSubmitLazyMocks.submitAiPickPromptMock,
}));

describe('ai-pick submit lazy loader', () => {
  it('reuses the cached submit module for preload and deferred submit', async () => {
    const context = {} as never;

    await expect(preloadAiPickSubmit()).resolves.toBeUndefined();
    await submitAiPickPromptDeferred(context, 'Prompt', 'Selected data', 'model-1');

    expect(aiPickSubmitLazyMocks.submitAiPickPromptMock).toHaveBeenCalledTimes(1);
    expect(aiPickSubmitLazyMocks.submitAiPickPromptMock).toHaveBeenCalledWith(
      context,
      'Prompt',
      'Selected data',
      'model-1'
    );
  });
});
