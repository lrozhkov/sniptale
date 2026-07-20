import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBlurSettings: vi.fn(() => ({ radius: 12 })),
  isBlurObject: vi.fn(() => false),
  isResizableTextCallout: vi.fn(() => false),
  normalizeScaledBlurTarget: vi.fn(() => false),
  normalizeScaledRichShapeObject: vi.fn(() => false),
  normalizeScaledTextCalloutTarget: vi.fn(),
  syncCropGuideInteraction: vi.fn(() => false),
  syncSourceState: vi.fn(),
  updateBlurObject: vi.fn(),
}));

vi.mock('../../objects/annotation/blur/object', async () => ({
  ...(await vi.importActual<typeof import('../../objects/annotation/blur/object')>(
    '../../objects/annotation/blur/object'
  )),
  getBlurSettings: mocks.getBlurSettings,
  isBlurObject: mocks.isBlurObject,
  normalizeScaledBlurTarget: mocks.normalizeScaledBlurTarget,
  updateBlurObject: mocks.updateBlurObject,
}));

vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  normalizeScaledRichShapeObject: mocks.normalizeScaledRichShapeObject,
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

import { createObjectModifiedHandler } from './runtime.object-modified';

function createBindings(overrides: Record<string, unknown> = {}) {
  return {
    commitHistory: vi.fn(),
    ensureObjectReachable: vi.fn(),
    getHistoryMuted: vi.fn(() => 0),
    syncRuntimeState: vi.fn(),
    ...overrides,
  };
}

describe('runtime object modified handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes modified objects before committing unmuted history', () => {
    const bindings = createBindings();
    const target = { setCoords: vi.fn() };
    mocks.isResizableTextCallout.mockReturnValue(true);
    mocks.normalizeScaledRichShapeObject.mockReturnValue(true);

    createObjectModifiedHandler(bindings as never)({ target } as never);

    expect(mocks.normalizeScaledTextCalloutTarget).toHaveBeenCalledWith(target, undefined);
    expect(target.setCoords).toHaveBeenCalledOnce();
    expect(mocks.syncSourceState).toHaveBeenCalledWith(bindings, target);
    expect(bindings.commitHistory).toHaveBeenCalledOnce();
    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
  });

  it('lets crop guide interaction own state sync without history commit', () => {
    const bindings = createBindings();
    mocks.syncCropGuideInteraction.mockReturnValue(true);

    createObjectModifiedHandler(bindings as never)({ target: { id: 'crop' } } as never);

    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
    expect(bindings.commitHistory).not.toHaveBeenCalled();
  });
});
