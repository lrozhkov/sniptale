import { beforeEach, expect, it, vi } from 'vitest';
import { createDrawingBindings } from '../drawing-tool-actions.test-support';

const storeState = vi.hoisted(() => ({
  toolSettings: {
    arrow: { color: '#fff', width: 4 },
    line: { color: '#123456', width: 3 },
  },
}));

const mocks = vi.hoisted(() => ({
  createArrowObject: vi.fn(() => ({ id: 'arrow-object' })),
  createCropGuideRect: vi.fn(() => ({ id: 'crop-guide' })),
  createDiamondDraft: vi.fn(() => ({ id: 'diamond-shape' })),
  createEllipseDraft: vi.fn(() => ({ id: 'ellipse-shape' })),
  createLineObject: vi.fn(() => ({ id: 'line-object' })),
  createRectangleDraft: vi.fn(() => ({ id: 'rectangle-shape' })),
  updateLineObject: vi.fn(),
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => storeState,
  },
}));

vi.mock('../../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/arrow')>()),
  createArrowObject: mocks.createArrowObject,
}));

vi.mock('../../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/line')>()),
  createLineObject: mocks.createLineObject,
  updateLineObject: mocks.updateLineObject,
}));

vi.mock('../../drawing/shape-drafts', () => ({
  createDiamondDraft: mocks.createDiamondDraft,
  createEllipseDraft: mocks.createEllipseDraft,
  createRectangleDraft: mocks.createRectangleDraft,
}));

vi.mock('../../tools/crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../tools/crop')>()),
  createCropGuideRect: mocks.createCropGuideRect,
}));

import {
  handleArrowMouseDown,
  handleCropMouseDown,
  handleLineMouseDown,
  handleShapeMouseDown,
} from './primitive';

beforeEach(() => {
  vi.clearAllMocks();
});

it('creates rectangle, ellipse, and diamond draw sessions through the shape factory seam', () => {
  const bindings = createDrawingBindings();
  const point = { x: 12, y: 18 } as never;

  handleShapeMouseDown(bindings as never, 'rectangle', point);
  handleShapeMouseDown(bindings as never, 'ellipse', point);
  handleShapeMouseDown(bindings as never, 'diamond', point);

  expect(mocks.createRectangleDraft).toHaveBeenCalledWith(point);
  expect(mocks.createEllipseDraft).toHaveBeenCalledWith(point);
  expect(mocks.createDiamondDraft).toHaveBeenCalledWith(point);
  expect(bindings.decorateShape).toHaveBeenCalledTimes(3);
  expect(bindings.startDrawSession).toHaveBeenCalledTimes(3);
});

it('creates arrow draw sessions through the arrow factory seam', () => {
  const bindings = createDrawingBindings();
  const point = { x: 22, y: 28 } as never;

  handleArrowMouseDown(bindings as never, point);

  expect(mocks.createArrowObject).toHaveBeenCalledWith(
    expect.objectContaining({
      end: point,
      settings: { color: '#fff', width: 4 },
      start: point,
    })
  );
  expect(bindings.prepareObject).toHaveBeenCalledWith(
    expect.objectContaining({
      sniptaleArrowDrawing: true,
      sniptaleArrowDraftPoints: [point, point],
      sniptaleArrowPointerMoved: false,
    })
  );
  expect(bindings.startDrawSession).toHaveBeenCalledWith(
    'arrow',
    point,
    expect.objectContaining({ id: 'arrow-object' })
  );
});

it('creates line draw sessions through the line factory seam', () => {
  const bindings = createDrawingBindings();
  const point = { x: 22, y: 28 } as never;

  handleLineMouseDown(bindings as never, point);

  expect(mocks.createLineObject).toHaveBeenCalledWith(
    expect.objectContaining({
      labelIndex: 4,
      points: [point, point],
      settings: { color: '#123456', width: 3 },
    })
  );
  expect(bindings.prepareObject).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'line-object', sniptaleLinePointerMoved: false })
  );
  expect(bindings.startDrawSession).toHaveBeenCalledWith(
    'line',
    point,
    expect.objectContaining({ id: 'line-object' })
  );
});

it('creates crop draw sessions through the crop guide seam', () => {
  const bindings = createDrawingBindings();
  const point = { x: 22, y: 28 } as never;

  handleCropMouseDown(bindings as never, point);

  expect(mocks.createCropGuideRect).toHaveBeenCalledWith(point);
  expect(bindings.startDrawSession).toHaveBeenCalledWith('crop', point, { id: 'crop-guide' });
});
