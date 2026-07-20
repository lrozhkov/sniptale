import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disableSelectionModeIfLoaded,
  enableSelectionModeDeferred,
  enableSelectionModeDeferredIfCurrent,
  preloadSelectionMode,
} from './lazy';

const selectionModeLazyMocks = vi.hoisted(() => ({
  disableSelectionModeMock: vi.fn(),
  enableSelectionModeMock: vi.fn(),
}));

vi.mock('.', () => ({
  disableSelectionMode: () => selectionModeLazyMocks.disableSelectionModeMock(),
  enableSelectionMode: () => selectionModeLazyMocks.enableSelectionModeMock(),
}));

describe('selection-mode lazy loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses the cached selection-mode module for preload and deferred enable', async () => {
    const captureArea = { x: 1, y: 2, width: 3, height: 4 };
    selectionModeLazyMocks.enableSelectionModeMock.mockResolvedValue(captureArea);

    await expect(preloadSelectionMode()).resolves.toBeUndefined();
    await expect(enableSelectionModeDeferred()).resolves.toEqual(captureArea);

    expect(selectionModeLazyMocks.enableSelectionModeMock).toHaveBeenCalledTimes(1);
  });

  it('enables selection mode when the freshness guard is still current', async () => {
    const captureArea = { x: 2, y: 3, width: 4, height: 5 };
    selectionModeLazyMocks.enableSelectionModeMock.mockResolvedValue(captureArea);

    await expect(enableSelectionModeDeferredIfCurrent(() => true)).resolves.toEqual(captureArea);

    expect(selectionModeLazyMocks.enableSelectionModeMock).toHaveBeenCalledTimes(1);
  });

  it('checks freshness after lazy loading before enabling selection mode', async () => {
    await expect(enableSelectionModeDeferredIfCurrent(() => false)).rejects.toThrow(
      'Selection mode activation was superseded.'
    );

    expect(selectionModeLazyMocks.enableSelectionModeMock).not.toHaveBeenCalled();
  });

  it('disables the loaded selection mode owner without reloading it', async () => {
    await preloadSelectionMode();

    disableSelectionModeIfLoaded();

    expect(selectionModeLazyMocks.disableSelectionModeMock).toHaveBeenCalledTimes(1);
  });
});
