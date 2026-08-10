// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearLegacyBlurMetadata: vi.fn(),
  canonicalizeModifiedEditorDrawingSelection: vi.fn((): unknown[] | null => null),
  getBlurSettings: vi.fn(() => ({ amount: 8 })),
  isBlurObject: vi.fn(() => false),
  normalizeScaledAnnotationTarget: vi.fn(() => false),
  normalizeScaledBlurTarget: vi.fn(() => false),
  normalizeScaledRectangleTarget: vi.fn(() => false),
  normalizeScaledRichShapeObject: vi.fn(() => false),
  readEditorDrawingObject: vi.fn(),
  refreshEditorDrawingBlurObject: vi.fn(),
  syncCropGuideInteraction: vi.fn(() => false),
  syncSourceState: vi.fn(),
  updateBlurObject: vi.fn(),
  writeEditorDrawingObject: vi.fn(),
}));

vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  getBlurSettings: mocks.getBlurSettings,
  isBlurObject: mocks.isBlurObject,
  normalizeScaledBlurTarget: mocks.normalizeScaledBlurTarget,
  updateBlurObject: mocks.updateBlurObject,
}));
vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  normalizeScaledRichShapeObject: mocks.normalizeScaledRichShapeObject,
}));
vi.mock('../../objects/shape-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/shape-style')>()),
  normalizeScaledRectangleTarget: mocks.normalizeScaledRectangleTarget,
}));
vi.mock('../../drawing/object/metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../drawing/object/metadata')>()),
  readEditorDrawingObject: mocks.readEditorDrawingObject,
  writeEditorDrawingObject: mocks.writeEditorDrawingObject,
}));
vi.mock('../../drawing/object/blur', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../drawing/object/blur')>()),
  clearLegacyBlurMetadata: mocks.clearLegacyBlurMetadata,
  refreshEditorDrawingBlurObject: mocks.refreshEditorDrawingBlurObject,
}));
vi.mock('../../drawing/object/canonicalize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../drawing/object/canonicalize')>()),
  canonicalizeModifiedEditorDrawingSelection: mocks.canonicalizeModifiedEditorDrawingSelection,
}));
vi.mock('./runtime.crop-guide', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime.crop-guide')>()),
  syncCropGuideInteraction: mocks.syncCropGuideInteraction,
}));
vi.mock('./runtime.source-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime.source-sync')>()),
  syncSourceState: mocks.syncSourceState,
}));
vi.mock('../tools/annotation-resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/annotation-resize')>()),
  normalizeScaledAnnotationTarget: mocks.normalizeScaledAnnotationTarget,
}));

import { createMouseMoveBeforeHandler } from './runtime.hover';
import { createObjectModifiedHandler } from './runtime.object-modified';
import { createObjectScalingHandler } from './runtime.object-scaling';
import { createSelectionChangeHandler } from './runtime.selection';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isBlurObject.mockReturnValue(false);
  mocks.normalizeScaledAnnotationTarget.mockReturnValue(false);
  mocks.normalizeScaledBlurTarget.mockReturnValue(false);
  mocks.normalizeScaledRectangleTarget.mockReturnValue(false);
  mocks.normalizeScaledRichShapeObject.mockReturnValue(false);
  mocks.syncCropGuideInteraction.mockReturnValue(false);
  mocks.canonicalizeModifiedEditorDrawingSelection.mockReturnValue(null);
});

it('resets hover cursor and syncs selection changes', () => {
  const canvas = { defaultCursor: 'crosshair' };
  Reflect.apply(createMouseMoveBeforeHandler, null, [{ getCanvas: () => null }])({
    e: new MouseEvent('mousemove'),
  });
  Reflect.apply(createMouseMoveBeforeHandler, null, [{ getCanvas: () => canvas }])({
    e: new MouseEvent('mousemove'),
  });
  expect(canvas.defaultCursor).toBe('default');

  const syncRuntimeState = vi.fn();
  createSelectionChangeHandler({ getCanvas: () => null, syncRuntimeState })();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
});

describe('object modified', () => {
  function bindings(historyMuted = 0) {
    return {
      commitHistory: vi.fn(),
      ensureObjectReachable: vi.fn(),
      getCanvas: vi.fn(() => ({ requestRenderAll: vi.fn() })),
      getHistoryMuted: vi.fn(() => historyMuted),
      getSource: vi.fn(() => null),
      prepareObject: vi.fn(),
      syncRuntimeState: vi.fn(),
    };
  }

  it('routes shared blur transforms through one canonical commit and history entry', () => {
    const owner = bindings();
    const target = { height: 40, left: 10, setCoords: vi.fn(), top: 20, width: 80 };
    mocks.isBlurObject.mockReturnValue(true);
    mocks.normalizeScaledBlurTarget.mockReturnValue(true);
    mocks.readEditorDrawingObject.mockReturnValue({ bounds: {}, id: 'blur', kind: 'blur' });

    Reflect.apply(createObjectModifiedHandler, null, [owner])({ target });

    expect(mocks.normalizeScaledBlurTarget).not.toHaveBeenCalled();
    expect(mocks.canonicalizeModifiedEditorDrawingSelection).toHaveBeenCalledWith(
      expect.objectContaining({ object: target })
    );
    expect(owner.ensureObjectReachable).toHaveBeenCalledWith(target);
    expect(owner.commitHistory).toHaveBeenCalledOnce();
  });

  it('updates retained blur settings and respects crop and muted history exits', () => {
    const owner = bindings(1);
    const target = { setCoords: vi.fn() };
    mocks.isBlurObject.mockReturnValue(true);
    mocks.normalizeScaledBlurTarget.mockReturnValue(true);
    mocks.readEditorDrawingObject.mockReturnValue(null);
    Reflect.apply(createObjectModifiedHandler, null, [owner])({ target });
    expect(mocks.updateBlurObject).toHaveBeenCalledWith(target, { settings: { amount: 8 } });
    expect(owner.commitHistory).not.toHaveBeenCalled();

    mocks.syncCropGuideInteraction.mockReturnValue(true);
    Reflect.apply(createObjectModifiedHandler, null, [owner])({ target });
    expect(owner.syncRuntimeState).toHaveBeenCalledOnce();
  });

  it('continues runtime ownership from canonical shared drawing replacements', () => {
    const owner = bindings();
    const target = { setCoords: vi.fn() };
    const replacement = { sniptaleType: 'shape' };
    mocks.canonicalizeModifiedEditorDrawingSelection.mockReturnValueOnce([replacement]);

    Reflect.apply(createObjectModifiedHandler, null, [owner])({ target });

    expect(owner.ensureObjectReachable).toHaveBeenCalledWith(replacement);
    expect(owner.ensureObjectReachable).not.toHaveBeenCalledWith(target);
    expect(owner.commitHistory).toHaveBeenCalledOnce();
  });

  it('finalizes every member returned from a mixed canonical selection', () => {
    const owner = bindings();
    const target = { setCoords: vi.fn() };
    const replacement = { sniptaleType: 'shape' };
    const retained = { sniptaleType: 'source-image' };
    mocks.canonicalizeModifiedEditorDrawingSelection.mockReturnValueOnce([replacement, retained]);

    Reflect.apply(createObjectModifiedHandler, null, [owner])({ target });

    expect(owner.ensureObjectReachable).toHaveBeenNthCalledWith(1, replacement);
    expect(owner.ensureObjectReachable).toHaveBeenNthCalledWith(2, retained);
  });
});

describe('object scaling', () => {
  function bindings() {
    const canvas = { requestRenderAll: vi.fn() };
    return {
      canvas,
      ensureObjectReachable: vi.fn(),
      getCanvas: vi.fn(() => canvas),
      syncRuntimeState: vi.fn(),
    };
  }

  it('normalizes rectangle, rich shape, source, annotation, and crop targets', () => {
    const owner = bindings();
    const target = { setCoords: vi.fn(), sniptaleType: 'shape' };
    const handler = Reflect.apply(createObjectScalingHandler, null, [owner]);
    handler({});

    mocks.normalizeScaledRectangleTarget.mockReturnValue(true);
    handler({ target });
    expect(target.setCoords).toHaveBeenCalledOnce();

    mocks.normalizeScaledRectangleTarget.mockReturnValue(false);
    handler({ target: { setCoords: vi.fn(), sniptaleType: 'rich-shape' } });
    handler({ target: { setCoords: vi.fn(), sniptaleType: 'source-image' } });
    mocks.normalizeScaledAnnotationTarget.mockReturnValue(true);
    handler({ target: { setCoords: vi.fn(), sniptaleType: 'step' } });
    expect(owner.ensureObjectReachable).toHaveBeenCalledTimes(4);

    mocks.syncCropGuideInteraction.mockReturnValue(true);
    handler({ target });
    expect(owner.syncRuntimeState).toHaveBeenCalledOnce();
  });

  it('marks blur objects dirty and declines unsupported targets', () => {
    const owner = bindings();
    const handler = Reflect.apply(createObjectScalingHandler, null, [owner]);
    const blur = { dirty: false };
    mocks.isBlurObject.mockReturnValue(true);
    handler({ target: blur });
    expect(blur.dirty).toBe(true);

    mocks.isBlurObject.mockReturnValue(false);
    handler({ target: { sniptaleType: 'image' } });
    expect(owner.ensureObjectReachable).toHaveBeenCalledOnce();
  });
});
