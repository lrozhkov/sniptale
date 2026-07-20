import { Point, Rect } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createLineObject } from '../../objects/line';

const mocks = vi.hoisted(() => ({
  updateRichShapeDraftMock: vi.fn(() => ({ left: 1, top: 2, width: 3, height: 4 })),
}));

vi.mock('../tools/rich-shape-drawing/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/rich-shape-drawing/resize')>()),
  updateRichShapeDraft: mocks.updateRichShapeDraftMock,
}));

import { isCompletedDrawSessionTooSmall, updateEditorDrawSessionObject } from './';
import { createProportionalRectDraftBounds, createRectDraftBounds } from './shape-updates/bounds';

const lineSettings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

beforeEach(() => {
  vi.clearAllMocks();
});

it('guards empty sessions and delegates rich shape draft updates', () => {
  expect(
    updateEditorDrawSessionObject(
      { object: null, start: { x: 0, y: 0 }, tool: 'arrow' } as never,
      new Point(10, 12),
      {} as never,
      {} as never,
      {} as never
    )
  ).toBeNull();

  const result = updateEditorDrawSessionObject(
    { object: { sniptaleType: 'rich-shape' }, start: { x: 0, y: 0 }, tool: 'rich-shape' } as never,
    new Point(10, 12),
    {} as never,
    {} as never,
    {} as never,
    true
  );

  expect(result).toEqual({ left: 1, top: 2, width: 3, height: 4 });
  expect(mocks.updateRichShapeDraftMock).toHaveBeenCalledWith(
    expect.objectContaining({ tool: 'rich-shape' }),
    new Point(10, 12),
    true
  );
});

it('updates line drafts and evaluates line size thresholds', () => {
  const line = createLineObject({
    id: 'line-draft',
    labelIndex: 1,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    settings: lineSettings,
  });

  updateEditorDrawSessionObject(
    { object: line, start: { x: 0, y: 0 }, tool: 'line' } as never,
    new Point(30, 0),
    {} as never,
    {} as never,
    {} as never,
    false,
    { ...lineSettings, width: 5 }
  );

  expect(line.sniptaleLinePointerMoved).toBe(true);
  expect(line.sniptaleLineWidth).toBe(5);
  expect(isCompletedDrawSessionTooSmall({ object: line, tool: 'line' } as never, 8)).toBe(false);
});

it('normalizes shared canvas drag bounds for rectangle-backed drawing tools', () => {
  expect(createRectDraftBounds(new Point(30, 40), new Point(10, 90))).toEqual({
    height: 50,
    left: 10,
    top: 40,
    width: 20,
  });
  expect(createProportionalRectDraftBounds(new Point(10, 20), new Point(25, 45), 2)).toEqual({
    height: 25,
    left: 10,
    top: 20,
    width: 50,
  });
});

it('checks non-arrow object bounds in completion size guards', () => {
  const wideFlat = new Rect({ height: 3, width: 24 });
  const tallThin = new Rect({ height: 24, width: 3 });

  expect(isCompletedDrawSessionTooSmall({ object: wideFlat, tool: 'rectangle' } as never, 8)).toBe(
    true
  );
  expect(isCompletedDrawSessionTooSmall({ object: tallThin, tool: 'rectangle' } as never, 8)).toBe(
    true
  );
});
