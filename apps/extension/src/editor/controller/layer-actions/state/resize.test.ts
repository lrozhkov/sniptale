import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findObjectById: vi.fn(),
  isEditableObject: vi.fn(() => true),
  isTextbox: vi.fn(() => false),
  normalizeFrameAnnotationProxyGeometry: vi.fn(),
  normalizeScaledAnnotationTarget: vi.fn(),
  normalizeScaledRectangleTarget: vi.fn(() => false),
  syncEditorDrawingTextObject: vi.fn(),
  synchronizeEditorDrawingObjectFromFabric: vi.fn(),
  synchronizeEditorDrawingTextLayout: vi.fn(),
}));

vi.mock('../../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/layers')>()),
  findObjectById: mocks.findObjectById,
}));
vi.mock('../../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/helpers')>()),
  isTextbox: mocks.isTextbox,
}));
vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  isEditableObject: mocks.isEditableObject,
}));
vi.mock('../../../objects/shape-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/shape-style')>()),
  normalizeScaledRectangleTarget: mocks.normalizeScaledRectangleTarget,
}));
vi.mock('../../tools/annotation-resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../tools/annotation-resize')>()),
  normalizeScaledAnnotationTarget: mocks.normalizeScaledAnnotationTarget,
}));
vi.mock('../../../frame-annotation/proxy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../frame-annotation/proxy')>()),
  normalizeFrameAnnotationProxyGeometry: mocks.normalizeFrameAnnotationProxyGeometry,
}));
vi.mock('../../../drawing/object/metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../drawing/object/metadata')>()),
  syncEditorDrawingTextObject: mocks.syncEditorDrawingTextObject,
  synchronizeEditorDrawingObjectFromFabric: mocks.synchronizeEditorDrawingObjectFromFabric,
}));
vi.mock('../../../drawing/object/vector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../drawing/object/vector')>()),
  synchronizeEditorDrawingTextLayout: mocks.synchronizeEditorDrawingTextLayout,
}));

import { resizeLayerObject } from './resize';

function createObject(overrides: Record<string, unknown> = {}) {
  return {
    getScaledHeight: vi.fn(() => 50),
    getScaledWidth: vi.fn(() => 100),
    scaleX: 1,
    scaleY: 1,
    set: vi.fn(),
    setCoords: vi.fn(),
    sniptaleLocked: false,
    sniptaleType: 'shape',
    ...overrides,
  };
}

describe('layer resize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isEditableObject.mockReturnValue(true);
    mocks.isTextbox.mockReturnValue(false);
    mocks.normalizeScaledRectangleTarget.mockReturnValue(false);
  });

  it('resizes vector objects by their scaled dimensions and normalizes geometry', () => {
    const object = createObject({ scaleX: 2, scaleY: 3 });
    const canvas = { requestRenderAll: vi.fn() };
    const ensureObjectReachable = vi.fn(() => true);
    mocks.findObjectById.mockReturnValue(object);

    expect(resizeLayerObject(canvas as never, 'shape', 200.2, 25.4, ensureObjectReachable)).toBe(
      object
    );

    expect(object.set).toHaveBeenCalledWith({ scaleX: 4, scaleY: 1.5 });
    expect(mocks.normalizeScaledAnnotationTarget).toHaveBeenCalledWith(object);
    expect(mocks.normalizeFrameAnnotationProxyGeometry).toHaveBeenCalledWith(object);
    expect(mocks.synchronizeEditorDrawingObjectFromFabric).toHaveBeenCalledWith(object);
    expect(ensureObjectReachable).toHaveBeenCalledWith(object);
  });

  it('changes text box width without scaling the font', () => {
    const object = createObject({ sniptaleType: 'text' });
    const canvas = { requestRenderAll: vi.fn() };
    mocks.findObjectById.mockReturnValue(object);
    mocks.isTextbox.mockReturnValue(true);

    resizeLayerObject(canvas as never, 'text', 180, 90, vi.fn());

    expect(object.set).toHaveBeenCalledWith({ width: 180, scaleX: 1, scaleY: 1 });
    expect(mocks.synchronizeEditorDrawingTextLayout).toHaveBeenCalledWith(object);
    expect(mocks.syncEditorDrawingTextObject).toHaveBeenCalledWith(object);
    expect(mocks.normalizeScaledAnnotationTarget).not.toHaveBeenCalled();
  });

  it('rejects missing, locked, non-editable, and zero-sized objects', () => {
    mocks.findObjectById.mockReturnValueOnce(null);
    expect(resizeLayerObject(null, 'missing', 10, 10, vi.fn())).toBeNull();

    mocks.findObjectById.mockReturnValueOnce(createObject({ sniptaleLocked: true }));
    expect(resizeLayerObject(null, 'locked', 10, 10, vi.fn())).toBeNull();

    mocks.findObjectById.mockReturnValueOnce(createObject());
    mocks.isEditableObject.mockReturnValueOnce(false);
    expect(resizeLayerObject(null, 'immutable', 10, 10, vi.fn())).toBeNull();

    mocks.findObjectById.mockReturnValueOnce(createObject({ getScaledWidth: () => 0 }));
    expect(resizeLayerObject(null, 'empty', 10, 10, vi.fn())).toBeNull();
  });
});
