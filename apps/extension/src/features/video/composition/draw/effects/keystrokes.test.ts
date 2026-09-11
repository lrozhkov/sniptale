import { expect, it, vi } from 'vitest';
import { getActionKeyStyle } from '../../../project/action-style';
import { drawKeystroke } from './keystrokes';
import type { VideoCompositionActionState } from '../../types';

it('keeps all six placements within the visible frame at both preview scales', () => {
  const event = {
    id: 'key',
    kind: 'KEY',
    anchor: { kind: 'project', time: 0 },
    label: 'Ctrl + Shift + K',
    data: {},
    point: null,
  } as const;
  for (const scale of [0.5, 2])
    for (const position of [
      'bottom-left',
      'bottom-center',
      'bottom-right',
      'top-left',
      'top-center',
      'top-right',
    ] as const) {
      const roundRect = vi.fn();
      const context = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        roundRect,
        fill: vi.fn(),
        fillText: vi.fn(),
        globalAlpha: 1,
        measureText: () => ({ width: 180 * scale }),
      } as unknown as CanvasRenderingContext2D;
      const state = {
        event,
        progress: 0.5,
        keyStyle: { ...getActionKeyStyle(), position, fontFamily: 'monospace' },
      } as VideoCompositionActionState;
      const bounds = { x: 50, y: 20, width: 640 * scale, height: 360 * scale };
      drawKeystroke(context, state, scale, bounds);
      const [x, y, width, height] = roundRect.mock.calls[0]!;
      expect(x).toBeGreaterThanOrEqual(bounds.x);
      expect(y).toBeGreaterThanOrEqual(bounds.y);
      expect(x + width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(y + height).toBeLessThanOrEqual(bounds.y + bounds.height);
      expect(context.font).toBe(`500 ${24 * scale}px monospace`);
      expect(context.fillText).toHaveBeenCalled();
    }
});
