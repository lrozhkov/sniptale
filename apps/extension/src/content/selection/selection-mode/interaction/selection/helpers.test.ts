import { describe, expect, it } from 'vitest';
import { handleResizeSelectionMove } from './helpers';
import type { Selection } from '../../types';

describe('selection-mode resize constraints', () => {
  it('keeps the anchored corner stable when southeast resize hits the viewport edge', () => {
    const result = handleResizeSelectionMove({
      aspectRatio: null,
      dragStartPoint: { x: 400, y: 280 },
      event: { clientX: 1200, clientY: 900 } as MouseEvent,
      getMaxSelectionHeight: () => 600,
      getMaxSelectionWidth: () => 800,
      maintainAspectRatio: false,
      minSelectionSize: 10,
      resizeDirection: 'se',
      selectionAtDragStart: { x: 300, y: 200, width: 100, height: 80 } as Selection,
    });

    expect(result).toEqual({ x: 300, y: 200, width: 500, height: 400 });
  });

  it('stops west resize at the left edge instead of snapping the whole selection to the origin', () => {
    const result = handleResizeSelectionMove({
      aspectRatio: null,
      dragStartPoint: { x: 300, y: 240 },
      event: { clientX: -500, clientY: 240 } as MouseEvent,
      getMaxSelectionHeight: () => 600,
      getMaxSelectionWidth: () => 800,
      maintainAspectRatio: false,
      minSelectionSize: 10,
      resizeDirection: 'w',
      selectionAtDragStart: { x: 300, y: 200, width: 200, height: 80 } as Selection,
    });

    expect(result).toEqual({ x: 0, y: 200, width: 500, height: 80 });
  });

  it('keeps the opposite corner anchored after aspect-ratio resizing', () => {
    const result = handleResizeSelectionMove({
      aspectRatio: 2,
      dragStartPoint: { x: 100, y: 100 },
      event: { clientX: 50, clientY: 50 } as MouseEvent,
      getMaxSelectionHeight: () => 600,
      getMaxSelectionWidth: () => 800,
      maintainAspectRatio: true,
      minSelectionSize: 10,
      resizeDirection: 'nw',
      selectionAtDragStart: { x: 100, y: 100, width: 100, height: 50 } as Selection,
    });

    expect(result).toEqual({ x: 50, y: 75, width: 150, height: 75 });
  });
});
