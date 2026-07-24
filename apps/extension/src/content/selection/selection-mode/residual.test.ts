// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mountStyleMock: vi.fn(),
}));

vi.mock('../../platform/frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/frame')>();

  return {
    ...actual,
    mountStyleInAccessibleDocuments: mocks.mountStyleMock,
    walkAllDocuments: vi.fn(),
  };
});

import { disableSelectionModeCursor, enableSelectionModeCursor } from './interaction/cursor';
import { handleResizeSelectionMove } from './interaction/selection/helpers';

describe('selection mode residual seams', () => {
  it('mounts and clears the selection cursor style', () => {
    Object.defineProperty(document.documentElement, 'style', {
      configurable: true,
      value: document.documentElement.style,
    });
    document.documentElement.style.setProperty('--sniptale-color-accent', '#123456');
    const cleanup = vi.fn();
    mocks.mountStyleMock.mockReturnValue(cleanup);
    const state = { cursorStyleCleanup: null } as any;

    enableSelectionModeCursor(state);
    disableSelectionModeCursor(state);

    expect(mocks.mountStyleMock).toHaveBeenCalledWith(
      expect.objectContaining({ styleId: 'sniptale-crosshair-cursor' })
    );
    expect(cleanup).toHaveBeenCalledOnce();
    expect(state.cursorStyleCleanup).toBeNull();
  });

  it('resizes selections while preserving minimum size constraints', () => {
    const moved = handleResizeSelectionMove({
      aspectRatio: 2,
      dragStartPoint: { x: 10, y: 10 },
      event: { clientX: 40, clientY: 30 } as MouseEvent,
      getMaxSelectionHeight: () => 500,
      getMaxSelectionWidth: () => 500,
      maintainAspectRatio: true,
      minSelectionSize: 10,
      resizeDirection: 'se',
      selectionAtDragStart: { height: 40, width: 60, x: 20, y: 20 },
    });
    expect(moved.width).toBeGreaterThanOrEqual(10);
    expect(moved.height).toBeGreaterThanOrEqual(10);
  });
});
