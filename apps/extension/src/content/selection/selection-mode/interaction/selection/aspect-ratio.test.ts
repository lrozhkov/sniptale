import { describe, expect, it } from 'vitest';
import { applyAspectRatioResize } from './aspect-ratio';

describe('selection-mode aspect-ratio resize', () => {
  it('anchors the north edge when horizontal resizing recomputes the height', () => {
    const result = applyAspectRatioResize({
      aspectRatio: 2,
      maxHeight: 400,
      maxWidth: 600,
      minSelectionSize: 20,
      newHeight: 60,
      newWidth: 300,
      resizeDirection: 'ne',
      selectionAtDragStart: { x: 80, y: 120, width: 160, height: 90 },
    });

    expect(result).toEqual({ newHeight: 150, newWidth: 300, newX: 80, newY: 60 });
  });

  it('anchors the west edge when vertical resizing recomputes the width', () => {
    const result = applyAspectRatioResize({
      aspectRatio: 1.5,
      maxHeight: 500,
      maxWidth: 600,
      minSelectionSize: 20,
      newHeight: 120,
      newWidth: 50,
      resizeDirection: 's',
      selectionAtDragStart: { x: 200, y: 90, width: 180, height: 120 },
    });

    expect(result).toEqual({ newHeight: 120, newWidth: 180, newX: 200, newY: 90 });
  });

  it('clamps horizontal aspect-ratio resize to the viewport bounds', () => {
    const result = applyAspectRatioResize({
      aspectRatio: 2,
      maxHeight: 150,
      maxWidth: 260,
      minSelectionSize: 20,
      newHeight: 40,
      newWidth: 500,
      resizeDirection: 'e',
      selectionAtDragStart: { x: 50, y: 60, width: 100, height: 70 },
    });

    expect(result).toEqual({ newHeight: 150, newWidth: 260, newX: 50, newY: 60 });
  });
});
