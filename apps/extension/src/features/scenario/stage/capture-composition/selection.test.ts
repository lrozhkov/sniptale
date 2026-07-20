import { expect, it } from 'vitest';

import { createCaptureInput } from './fixtures.test-support.ts';
import { selectCaptureComposition } from './selection';

it('selects target-focused slides for captures with target geometry', () => {
  expect(selectCaptureComposition(createCaptureInput())).toBe('target-focused');
});

it('selects full-screen context when annotations and guide text are absent', () => {
  const input = createCaptureInput({
    body: '',
    cursorPoint: null,
    interactionPoint: null,
    sourceKind: 'manual',
    target: null,
  });

  expect(selectCaptureComposition(input)).toBe('full-screen-context');
});

it('selects sparse viewport walkthroughs for explanatory captures without target metadata', () => {
  const input = createCaptureInput({
    body: 'Explain the mostly empty workspace before the next guided action.',
    cursorPoint: null,
    interactionPoint: null,
    target: null,
  });

  expect(selectCaptureComposition(input)).toBe('sparse-viewport');
});

it('selects click sequence when pointer range shows a recorded movement', () => {
  const input = createCaptureInput({
    captureMetadata: {
      pointerRange: {
        distance: 310,
        durationMs: 420,
        end: { x: 702, y: 424 },
        maxX: 702,
        maxY: 424,
        minX: 420,
        minY: 218,
        start: { x: 420, y: 218 },
      },
      scroll: null,
      trigger: 'pointer-up',
    },
  });

  expect(selectCaptureComposition(input)).toBe('click-sequence');
});
