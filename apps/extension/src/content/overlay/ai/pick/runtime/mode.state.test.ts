import { describe, expect, it, vi } from 'vitest';

const { createAiPickDomStateMock } = vi.hoisted(() => ({
  createAiPickDomStateMock: vi.fn(() => ({ elementIndex: { token: 'index' } })),
}));

vi.mock('./dom-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./dom-state')>()),
  createAiPickDomState: createAiPickDomStateMock,
}));

import { createAiPickModeState } from './mode.state';

describe('ai-pick mode state', () => {
  it('initializes mode state from the canonical DOM owner', () => {
    expect(createAiPickModeState()).toEqual({
      domState: { elementIndex: { token: 'index' } },
      enableSequence: 0,
      isEnabled: false,
      onContentSelect: null,
      parsedTree: null,
      pendingEnable: null,
      source: null,
    });
    expect(createAiPickDomStateMock).toHaveBeenCalledTimes(1);
  });
});
