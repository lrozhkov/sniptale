import { Point } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';
import { updateArrowDraft } from './arrow';
import { updateBlurDraft } from './blur';
import { updateEditorDrawSessionObject } from './dispatch';
import { resolveLineDraftSettings } from './line';
import { updateTextDraft } from './text';

const mocks = vi.hoisted(() => ({
  isArrowObject: vi.fn(() => true),
  isBlurObject: vi.fn(() => true),
  isLineObject: vi.fn(() => false),
  readArrowPoints: vi.fn(() => [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]),
  readLineSettings: vi.fn(() => ({ color: '#000' })),
  resizeTextCallout: vi.fn(),
  updateArrowObject: vi.fn(),
  updateBlurObject: vi.fn(),
  updateRichShapeDraft: vi.fn(() => null),
  updateShapeOrCropDrawSessionObject: vi.fn(() => ({ width: 10 })),
}));

vi.mock('../../../objects/arrow/controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/arrow/controls')>()),
  readArrowPoints: mocks.readArrowPoints,
}));

vi.mock('../../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObject,
  updateArrowObject: mocks.updateArrowObject,
}));

vi.mock('../../../objects/annotation/blur/object/identity', () => ({
  isBlurObject: mocks.isBlurObject,
}));

vi.mock('../../../objects/annotation/blur/object/update', () => ({
  updateBlurObject: mocks.updateBlurObject,
}));

vi.mock('../../../objects/annotation/text/callout/resize', () => ({
  resizeTextCallout: mocks.resizeTextCallout,
}));

vi.mock('../../../objects/line/state/identity', () => ({
  isLineObject: mocks.isLineObject,
}));

vi.mock('../../../objects/line/settings/read', () => ({
  readLineSettings: mocks.readLineSettings,
}));

vi.mock('../../tools/rich-shape-drawing/resize', () => ({
  updateRichShapeDraft: mocks.updateRichShapeDraft,
}));

vi.mock('../shape-updates/dispatch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shape-updates/dispatch')>()),
  updateShapeOrCropDrawSessionObject: mocks.updateShapeOrCropDrawSessionObject,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isArrowObject.mockReturnValue(true);
  mocks.isBlurObject.mockReturnValue(true);
  mocks.isLineObject.mockReturnValue(false);
});

it('owns arrow and blur draft mutation routing', () => {
  const arrow = { sniptaleType: 'arrow' };
  const blur = { sniptaleType: 'blur' };

  updateArrowDraft(
    { object: arrow, start: { x: 0, y: 0 }, tool: 'arrow' } as never,
    new Point(5, 6),
    {
      color: '#fff',
      width: 4,
    } as never
  );
  updateBlurDraft({ object: blur, start: { x: 1, y: 2 }, tool: 'blur' } as never, new Point(4, 6), {
    amount: 10,
  } as never);

  expect(mocks.updateArrowObject).toHaveBeenCalledWith(
    arrow,
    expect.objectContaining({
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 6 },
      ],
    })
  );
  expect(mocks.updateBlurObject).toHaveBeenCalledWith(
    blur,
    expect.objectContaining({ bounds: { height: 4, left: 1, top: 2, width: 3 } })
  );
});

it('owns text draft resizing and line settings fallback', () => {
  const textbox = { set: vi.fn(), type: 'textbox' };

  updateTextDraft(
    { object: textbox, start: { x: 10, y: 3 }, tool: 'text' } as never,
    new Point(4, 8)
  );
  expect(textbox.set).toHaveBeenCalledWith({ left: 4, top: 3 });
  expect(mocks.resizeTextCallout).toHaveBeenCalledWith(textbox, 6, 1);

  mocks.isLineObject.mockReturnValue(true);
  expect(
    resolveLineDraftSettings({ object: { sniptaleType: 'line' }, tool: 'line' } as never)
  ).toEqual({
    color: '#000',
  });
});

it('keeps dispatch ownership separate from tool-specific draft owners', () => {
  const shapeResult = updateEditorDrawSessionObject(
    { object: {}, tool: 'rectangle' } as never,
    new Point(2, 3),
    {} as never,
    {} as never,
    {} as never
  );
  updateEditorDrawSessionObject(
    { object: {}, tool: 'rich-shape' } as never,
    new Point(2, 3),
    {} as never,
    {} as never,
    {} as never
  );

  expect(shapeResult).toEqual({ width: 10 });
  expect(mocks.updateShapeOrCropDrawSessionObject).toHaveBeenCalledOnce();
  expect(mocks.updateRichShapeDraft).toHaveBeenCalledOnce();
});
