import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  syncCropGuideInteraction: vi.fn(() => false),
  syncSourceState: vi.fn(),
}));

vi.mock('./runtime.crop-guide', async () => ({
  ...(await vi.importActual<typeof import('./runtime.crop-guide')>('./runtime.crop-guide')),
  syncCropGuideInteraction: mocks.syncCropGuideInteraction,
}));

vi.mock('./runtime.source-sync', async () => ({
  ...(await vi.importActual<typeof import('./runtime.source-sync')>('./runtime.source-sync')),
  syncSourceState: mocks.syncSourceState,
}));

import { createObjectMovingHandler } from './runtime.object-moving';

function createBindings(overrides: Record<string, unknown> = {}) {
  const canvas = { requestRenderAll: vi.fn() };
  return {
    applyGridSnap: vi.fn(),
    getCanvas: vi.fn(() => canvas),
    syncRuntimeState: vi.fn(),
    ...overrides,
  };
}

describe('runtime object moving handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncCropGuideInteraction.mockReturnValue(false);
  });

  it('snaps and syncs moving objects without clamping an active pointer transform', () => {
    const bindings = createBindings();
    const target = { id: 'target' };

    createObjectMovingHandler(bindings as never)({ target } as never);

    expect(bindings.applyGridSnap).toHaveBeenCalledWith(target);
    expect(mocks.syncSourceState).toHaveBeenCalledWith(bindings, target);
    expect(bindings.getCanvas().requestRenderAll).not.toHaveBeenCalled();
  });

  it('lets crop guide interaction own runtime sync', () => {
    const bindings = createBindings();
    mocks.syncCropGuideInteraction.mockReturnValue(true);

    createObjectMovingHandler(bindings as never)({ target: { id: 'crop' } } as never);

    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
    expect(mocks.syncSourceState).not.toHaveBeenCalled();
  });
});
