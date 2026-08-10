// @vitest-environment jsdom

import { Rect } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isBlurObject: vi.fn(),
  readEditorDrawingObject: vi.fn(),
  refreshEditorDrawingBlurObject: vi.fn(),
  updateBlurObject: vi.fn(),
}));

vi.mock('../../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/blur/object')>()),
  isBlurObject: mocks.isBlurObject,
  updateBlurObject: mocks.updateBlurObject,
}));
vi.mock('../../../drawing/object/metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../drawing/object/metadata')>()),
  readEditorDrawingObject: mocks.readEditorDrawingObject,
}));
vi.mock('../../../drawing/object/blur', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../drawing/object/blur')>()),
  refreshEditorDrawingBlurObject: mocks.refreshEditorDrawingBlurObject,
}));

import { refreshPreparedObjectGeometry } from './geometry-refresh';

beforeEach(() => vi.clearAllMocks());

it('refreshes shared blur geometry through the drawing adapter', () => {
  const object = new Rect();
  mocks.isBlurObject.mockReturnValue(true);
  mocks.readEditorDrawingObject.mockReturnValue({ kind: 'blur' });

  refreshPreparedObjectGeometry(object);

  expect(mocks.refreshEditorDrawingBlurObject).toHaveBeenCalledWith(object);
  expect(mocks.updateBlurObject).not.toHaveBeenCalled();
});

it('retains the old blur owner only for non-drawing retained blur objects', () => {
  const object = new Rect();
  mocks.isBlurObject.mockReturnValue(true);
  mocks.readEditorDrawingObject.mockReturnValue(null);

  refreshPreparedObjectGeometry(object);

  expect(mocks.updateBlurObject).toHaveBeenCalledWith(object);
  mocks.isBlurObject.mockReturnValue(false);
  refreshPreparedObjectGeometry(new Rect());
  expect(mocks.updateBlurObject).toHaveBeenCalledOnce();
});
