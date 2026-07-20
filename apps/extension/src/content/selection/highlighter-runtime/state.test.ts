import { expect, it } from 'vitest';

import { createHighlighterRuntimeState } from './state';

it('creates a fresh runtime state with cleared callbacks and flags', () => {
  expect(createHighlighterRuntimeState()).toEqual({
    callbacks: {
      addFrame: null,
      clearFrames: null,
      hasFrameForElement: null,
      removeFrame: null,
    },
    cleanupEventListeners: null,
    isFrameEditing: false,
    isModeEnabled: false,
    isPaused: false,
    isTooltipVisible: false,
  });
});
