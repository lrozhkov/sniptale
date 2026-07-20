// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mountStyleInAccessibleDocumentsMock } = vi.hoisted(() => ({
  mountStyleInAccessibleDocumentsMock: vi.fn(),
}));

vi.mock('../../../platform/frame', () => ({
  mountStyleInAccessibleDocuments: mountStyleInAccessibleDocumentsMock,
}));

import { disableSelectionModeCursor, enableSelectionModeCursor } from './cursor';

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.style.removeProperty('--sniptale-color-accent');
});

describe('selection-mode cursor', () => {
  it('replaces an existing cursor style cleanup and mounts accent-aware cursor css', () => {
    const previousCleanup = vi.fn();
    const nextCleanup = vi.fn();
    mountStyleInAccessibleDocumentsMock.mockReturnValue(nextCleanup);
    document.documentElement.style.setProperty('--sniptale-color-accent', '#22c55e');
    const state = { cursorStyleCleanup: previousCleanup };

    enableSelectionModeCursor(state as never);

    expect(previousCleanup).toHaveBeenCalledTimes(1);
    expect(mountStyleInAccessibleDocumentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        styleId: 'sniptale-crosshair-cursor',
        textContent: expect.stringContaining('.sniptale-resize-handle[data-direction="nw"]'),
      })
    );
    expect(mountStyleInAccessibleDocumentsMock.mock.calls[0]?.[0]?.textContent).toContain(
      '%2322c55e'
    );
    expect(state.cursorStyleCleanup).toBe(nextCleanup);
  });

  it('clears the mounted cursor cleanup when disabling the selection cursor', () => {
    const cleanup = vi.fn();
    const state = { cursorStyleCleanup: cleanup };

    disableSelectionModeCursor(state as never);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(state.cursorStyleCleanup).toBeNull();
  });
});
