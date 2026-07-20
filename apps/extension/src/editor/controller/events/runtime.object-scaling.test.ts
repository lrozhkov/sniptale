import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isArrowObject: vi.fn(() => false),
  isBlurObject: vi.fn(() => false),
  isLineObject: vi.fn(() => false),
  isResizableTextCallout: vi.fn(() => false),
  normalizeScaledAnnotationTarget: vi.fn(() => false),
  normalizeScaledArrowObject: vi.fn(() => true),
  normalizeScaledLineObject: vi.fn(() => true),
  normalizeScaledRectangleTarget: vi.fn(() => false),
  normalizeScaledTextCalloutTarget: vi.fn(),
  syncCropGuideInteraction: vi.fn(() => false),
  syncSourceState: vi.fn(),
}));

vi.mock('../../objects/annotation/blur/object', async () => ({
  ...(await vi.importActual<typeof import('../../objects/annotation/blur/object')>(
    '../../objects/annotation/blur/object'
  )),
  isBlurObject: mocks.isBlurObject,
}));

vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObject,
  normalizeScaledArrowObject: mocks.normalizeScaledArrowObject,
}));

vi.mock('../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/line')>()),
  isLineObject: mocks.isLineObject,
  normalizeScaledLineObject: mocks.normalizeScaledLineObject,
}));

vi.mock('../../objects/shape-style', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shape-style')>(
    '../../objects/shape-style'
  )),
  normalizeScaledRectangleTarget: mocks.normalizeScaledRectangleTarget,
}));

vi.mock('../tools/annotation-resize', () => ({
  normalizeScaledAnnotationTarget: mocks.normalizeScaledAnnotationTarget,
}));

vi.mock('./runtime.crop-guide', async () => ({
  ...(await vi.importActual<typeof import('./runtime.crop-guide')>('./runtime.crop-guide')),
  syncCropGuideInteraction: mocks.syncCropGuideInteraction,
}));

vi.mock('./runtime.source-sync', async () => ({
  ...(await vi.importActual<typeof import('./runtime.source-sync')>('./runtime.source-sync')),
  syncSourceState: mocks.syncSourceState,
}));

vi.mock('./runtime.text-callout-target', async () => ({
  ...(await vi.importActual<typeof import('./runtime.text-callout-target')>(
    './runtime.text-callout-target'
  )),
  isResizableTextCallout: mocks.isResizableTextCallout,
}));

vi.mock('./text-callout', async () => ({
  ...(await vi.importActual<typeof import('./text-callout')>('./text-callout')),
  normalizeScaledTextCalloutTarget: mocks.normalizeScaledTextCalloutTarget,
}));

import { createObjectScalingHandler } from './runtime.object-scaling';

function createBindings() {
  const canvas = { requestRenderAll: vi.fn() };
  return {
    ensureObjectReachable: vi.fn(),
    getCanvas: vi.fn(() => canvas),
    syncRuntimeState: vi.fn(),
  };
}

describe('runtime object scaling handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isArrowObject.mockReturnValue(false);
    mocks.isBlurObject.mockReturnValue(false);
    mocks.isLineObject.mockReturnValue(false);
    mocks.isResizableTextCallout.mockReturnValue(false);
    mocks.normalizeScaledAnnotationTarget.mockReturnValue(false);
    mocks.normalizeScaledArrowObject.mockReturnValue(true);
    mocks.normalizeScaledLineObject.mockReturnValue(true);
    mocks.normalizeScaledRectangleTarget.mockReturnValue(false);
    mocks.syncCropGuideInteraction.mockReturnValue(false);
  });

  it('keeps live blur scaling visual without committing blur normalization', () => {
    const bindings = createBindings();
    const target = { dirty: false, sniptaleType: 'blur' };
    mocks.isBlurObject.mockReturnValue(true);

    createObjectScalingHandler(bindings as never)({ target } as never);

    expect(target.dirty).toBe(true);
    expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(target);
    expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalledOnce();
  });

  it('returns early when arrow normalization rejects the scaled target', () => {
    const bindings = createBindings();
    mocks.isArrowObject.mockReturnValue(true);
    mocks.normalizeScaledArrowObject.mockReturnValue(false);

    createObjectScalingHandler(bindings as never)({ target: { id: 'arrow' } } as never);

    expect(bindings.ensureObjectReachable).not.toHaveBeenCalled();
  });
});
