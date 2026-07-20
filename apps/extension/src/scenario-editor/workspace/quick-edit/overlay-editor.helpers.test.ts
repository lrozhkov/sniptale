import { describe, expect, it } from 'vitest';
import { updatePointOverlay, updateRectOverlay } from './overlay-editor.helpers';

describe('scenario quick-edit overlay editor helpers', () => {
  it('updates point overlays without changing other fields', () => {
    const overlay: {
      id: string;
      kind: 'cursor';
      point: { x: number; y: number };
    } = {
      id: 'cursor',
      kind: 'cursor',
      point: { x: 10, y: 20 },
    };

    expect(updatePointOverlay(overlay, { y: 44 })).toEqual({
      id: 'cursor',
      kind: 'cursor',
      point: { x: 10, y: 44 },
    });
  });

  it('keeps unsupported overlays unchanged in updateRectOverlay', () => {
    const overlay = {
      id: 'click',
      kind: 'click-ring',
      point: { x: 10, y: 20 },
    } as const;

    expect(updateRectOverlay(overlay, { x: 50 })).toBe(overlay);
  });

  it('updates supported rect overlays', () => {
    expect(
      updateRectOverlay(
        {
          id: 'rect',
          kind: 'rectangle',
          rect: { x: 10, y: 20, width: 30, height: 40 },
          strokeColor: '#111',
          fillColor: '#fff',
          strokeWidth: 2,
        },
        { width: 50 }
      )
    ).toEqual(
      expect.objectContaining({
        rect: expect.objectContaining({ width: 50 }),
      })
    );
  });
});
