import { Point, Rect } from 'fabric';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getArrowGeometryMock: vi.fn(() => ({ end: { x: 3, y: 4 }, start: { x: 0, y: 0 } })),
  getLinePointsMock: vi.fn(() => [undefined, { x: 3, y: 4 }]),
  getLineSettingsMock: vi.fn(() => ({ color: '#123456', width: 4 })),
  isArrowObjectMock: vi.fn(() => false),
  isBlurObjectMock: vi.fn(() => false),
  isLineObjectMock: vi.fn(() => true),
  resizeTextCalloutMock: vi.fn(),
  updateArrowObjectMock: vi.fn(),
  updateBlurObjectMock: vi.fn(),
  updateLineObjectMock: vi.fn(),
  updateRichShapeDraftMock: vi.fn(() => null),
}));

vi.mock('../../objects/annotation/blur/object/identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object/identity')>()),
  isBlurObject: mocks.isBlurObjectMock,
}));
vi.mock('../../objects/annotation/blur/object/update', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object/update')>()),
  updateBlurObject: mocks.updateBlurObjectMock,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  getArrowGeometry: mocks.getArrowGeometryMock,
  isArrowObject: mocks.isArrowObjectMock,
  updateArrowObject: mocks.updateArrowObjectMock,
}));
vi.mock('../../objects/annotation/text/callout/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/callout/resize')>()),
  resizeTextCallout: mocks.resizeTextCalloutMock,
}));
vi.mock('../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/line')>()),
  getLinePoints: mocks.getLinePointsMock,
  getLineSettings: mocks.getLineSettingsMock,
  isLineObject: mocks.isLineObjectMock,
  updateLineObject: mocks.updateLineObjectMock,
}));
vi.mock('../../objects/line/state/identity', () => ({
  isLineObject: mocks.isLineObjectMock,
}));
vi.mock('../../objects/line/state/points', () => ({
  readLinePoints: mocks.getLinePointsMock,
}));
vi.mock('../../objects/line/settings/read', () => ({
  readLineSettings: mocks.getLineSettingsMock,
}));
vi.mock('../../objects/line/state/update', () => ({
  updateLineObject: mocks.updateLineObjectMock,
}));
vi.mock('../tools/rich-shape-drawing/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/rich-shape-drawing/resize')>()),
  updateRichShapeDraft: mocks.updateRichShapeDraftMock,
}));

import { isCompletedDrawSessionTooSmall, updateEditorDrawSessionObject } from './';

const arrowSettings = { color: '#111111', width: 4 } as never;
const blurSettings = { amount: 10, blurType: 'solid', showBorder: false } as never;
const shapeSettings = { strokeWidth: 2 } as never;

function updateDraftObject(tool: string, object: unknown, point: Point, extra?: boolean) {
  return updateEditorDrawSessionObject(
    { object, start: { x: 1, y: 2 }, tool } as never,
    point,
    arrowSettings,
    shapeSettings,
    blurSettings,
    extra
  );
}

it('falls back safely when stored line endpoints are partially missing', () => {
  expect(
    isCompletedDrawSessionTooSmall(
      {
        object: { getBoundingRect: () => ({ height: 20, width: 20 }) },
        tool: 'line',
      } as never,
      8
    )
  ).toBe(true);

  mocks.getLinePointsMock.mockReturnValueOnce([{ x: 3, y: 4 }, undefined]);
  expect(
    isCompletedDrawSessionTooSmall(
      {
        object: { getBoundingRect: () => ({ height: 20, width: 20 }) },
        tool: 'line',
      } as never,
      8
    )
  ).toBe(true);
});

it('covers draft update branches through drawing object adapters', () => {
  const point = new Point(8, 9);
  const textbox = { set: vi.fn(), type: 'textbox' };
  mocks.isArrowObjectMock.mockReturnValueOnce(true);
  mocks.isBlurObjectMock.mockReturnValueOnce(true);

  expect(updateDraftObject('rectangle', null, point)).toBeNull();
  updateDraftObject('arrow', { sniptaleType: 'arrow' }, point);
  updateDraftObject('text', textbox, point);
  updateDraftObject('line', { sniptaleType: 'line' }, point);
  updateDraftObject('blur', { sniptaleType: 'blur' }, point);
  updateDraftObject('rich-shape', {}, point, true);
  updateDraftObject('rectangle', new Rect({ height: 1, width: 1 }), point);

  expect(mocks.updateArrowObjectMock).toHaveBeenCalled();
  expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      sniptaleArrowDraftPoints: [
        { x: 0, y: 0 },
        { x: 8, y: 9 },
      ],
    }),
    expect.any(Object)
  );
  expect(mocks.resizeTextCalloutMock).toHaveBeenCalledWith(textbox, 7, 1);
  expect(mocks.updateLineObjectMock).toHaveBeenCalled();
  expect(mocks.updateBlurObjectMock).toHaveBeenCalled();
  expect(mocks.updateRichShapeDraftMock).toHaveBeenCalledWith(expect.any(Object), point, true);
});
