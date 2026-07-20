import { describe, expect, it, vi } from 'vitest';
import { createToolbarDerivedStateResult } from './derived.result';

describe('createToolbarDerivedStateResult', () => {
  it('merges viewport, refs, and navigation ownership into one stable result', () => {
    const setCurrentViewport = vi.fn();
    const setIsLoading = vi.fn();

    const result = createToolbarDerivedStateResult({
      currentViewport: { width: 1280, height: 720 },
      setCurrentViewport,
      isLoading: true,
      setIsLoading,
      refsAndPosition: {
        compactMenus: true,
        displayMode: 'vertical',
        handleMouseDown: vi.fn(),
        isDragging: false,
        position: { x: 10, y: 20 },
        positionReady: true,
        setCompactMenus: vi.fn(),
        setDisplayMode: vi.fn(),
        toolbarRef: { current: null },
      } as never,
      navigation: {
        lockDisabled: false,
        lockIconName: 'lock',
        lockTitle: 'title',
        navigationLockEnabled: true,
        toggleNavigationLock: vi.fn(),
      } as never,
    });

    expect(result.currentViewport).toEqual({ width: 1280, height: 720 });
    expect(result.setCurrentViewport).toBe(setCurrentViewport);
    expect(result.setIsLoading).toBe(setIsLoading);
    expect(result.displayMode).toBe('vertical');
    expect(result.navigationLockEnabled).toBe(true);
    expect(result.lockTitle).toBe('title');
  });
});
