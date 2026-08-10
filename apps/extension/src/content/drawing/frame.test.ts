import { expect, it } from 'vitest';
import type { DrawingObject } from '../../features/drawing/public';
import type { PointerDraft } from './interaction';
import { resolveDrawingFrameRenderables } from './frame-renderables';

const original: DrawingObject = {
  bounds: { x: 10, y: 20, width: 40, height: 30 },
  color: '#ef4444',
  id: 'edited',
  kind: 'rectangle',
  width: 4,
};
const untouched: DrawingObject = {
  bounds: { x: 100, y: 100, width: 20, height: 20 },
  id: 'untouched',
  kind: 'blur',
};

it.each(['move', 'resize'] as const)(
  'renders the live %s draft in place of its committed object',
  (kind) => {
    const live = { ...original, bounds: { ...original.bounds, x: 60, width: 80 } };
    const draft: PointerDraft =
      kind === 'resize'
        ? {
            handle: 'e',
            kind: 'resize',
            object: live,
            original,
            start: { x: 10, y: 20 },
          }
        : {
            kind: 'move',
            object: live,
            original,
            start: { x: 10, y: 20 },
          };

    expect(resolveDrawingFrameRenderables([original, untouched], draft)).toEqual([
      { object: live, preview: false },
      { object: untouched, preview: false },
    ]);
  }
);

it('keeps committed objects and appends a lightweight create preview', () => {
  const draft: PointerDraft = {
    kind: 'create',
    object: original,
    start: { x: 10, y: 20 },
  };
  expect(resolveDrawingFrameRenderables([untouched], draft)).toEqual([
    { object: untouched, preview: false },
    { object: original, preview: true },
  ]);
});

it.each(['move', 'resize'] as const)('projects a live blur %s draft into the DOM layer', (kind) => {
  const committed: DrawingObject = {
    bounds: { x: 10, y: 20, width: 40, height: 30 },
    id: 'live-blur',
    kind: 'blur',
  };
  const live = { ...committed, bounds: { x: 60, y: 70, width: 80, height: 50 } };
  const draft: PointerDraft =
    kind === 'resize'
      ? {
          handle: 'se',
          kind: 'resize',
          object: live,
          original: committed,
          start: { x: 10, y: 20 },
        }
      : {
          kind: 'move',
          object: live,
          original: committed,
          start: { x: 10, y: 20 },
        };

  expect(resolveDrawingFrameRenderables([committed], draft)).toEqual([
    { object: live, preview: false },
  ]);
});
