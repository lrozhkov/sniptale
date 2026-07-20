// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shimDependencyMocks = vi.hoisted(() => ({
  loadShimQuickActions: vi.fn(),
  shimQuickActionStorage: {
    canObserveChanges: vi.fn(() => false),
    subscribeToChanges: vi.fn(),
  },
  triggerQuickActionFromShim: vi.fn(),
  wakeContentRuntimeFromShim: vi.fn(),
}));

const markerMocks = vi.hoisted(() => ({
  isFullContentRuntimeMounted: vi.fn(() => false),
}));

const hotkeyMocks = vi.hoisted(() => ({
  createQuickActionHotkeyRuntime: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('./quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./quick-actions')>()),
  loadShimQuickActions: shimDependencyMocks.loadShimQuickActions,
  shimQuickActionStorage: shimDependencyMocks.shimQuickActionStorage,
}));

vi.mock('./transport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./transport')>()),
  triggerQuickActionFromShim: shimDependencyMocks.triggerQuickActionFromShim,
  wakeContentRuntimeFromShim: shimDependencyMocks.wakeContentRuntimeFromShim,
}));

vi.mock('../entrypoint/markers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../entrypoint/markers')>()),
  isFullContentRuntimeMounted: markerMocks.isFullContentRuntimeMounted,
}));

vi.mock('../../platform/quick-action-hotkeys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/quick-action-hotkeys')>()),
  createQuickActionHotkeyRuntime: hotkeyMocks.createQuickActionHotkeyRuntime,
}));

async function importShim(): Promise<void> {
  await import('.');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  markerMocks.isFullContentRuntimeMounted.mockReturnValue(false);
  shimDependencyMocks.wakeContentRuntimeFromShim.mockResolvedValue({
    restored: false,
    success: true,
  });
  hotkeyMocks.createQuickActionHotkeyRuntime.mockReturnValue({
    start: hotkeyMocks.start,
    stop: hotkeyMocks.stop,
  });
  delete (globalThis as { __sniptaleContentRuntimeShimCleanup?: unknown })
    .__sniptaleContentRuntimeShimCleanup;
});

afterEach(() => {
  const cleanup = (globalThis as { __sniptaleContentRuntimeShimCleanup?: () => void })
    .__sniptaleContentRuntimeShimCleanup;
  cleanup?.();
  delete (globalThis as { __sniptaleContentRuntimeShimCleanup?: unknown })
    .__sniptaleContentRuntimeShimCleanup;
});

describe('content runtime shim', () => {
  it('starts hotkey listening and asks background to restore lazy content runtime', async () => {
    await importShim();

    expect(hotkeyMocks.createQuickActionHotkeyRuntime).toHaveBeenCalled();
    expect(hotkeyMocks.createQuickActionHotkeyRuntime).toHaveBeenCalledWith({
      getActions: shimDependencyMocks.loadShimQuickActions,
      storage: shimDependencyMocks.shimQuickActionStorage,
      triggerQuickAction: expect.any(Function),
    });
    const triggerQuickAction = hotkeyMocks.createQuickActionHotkeyRuntime.mock.calls[0]?.[0]
      .triggerQuickAction as ((action: { id: string }) => Promise<void>) | undefined;
    await triggerQuickAction?.({ id: 'quick-action-1' });

    expect(shimDependencyMocks.triggerQuickActionFromShim).toHaveBeenCalledWith({
      id: 'quick-action-1',
    });
    expect(hotkeyMocks.start).toHaveBeenCalledOnce();
    expect(shimDependencyMocks.wakeContentRuntimeFromShim).toHaveBeenCalledOnce();
  });

  it('does nothing when the full content runtime is already mounted', async () => {
    markerMocks.isFullContentRuntimeMounted.mockReturnValue(true);

    await importShim();

    expect(hotkeyMocks.createQuickActionHotkeyRuntime).not.toHaveBeenCalled();
    expect(shimDependencyMocks.wakeContentRuntimeFromShim).not.toHaveBeenCalled();
  });
});
