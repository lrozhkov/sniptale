import { expect, it, vi } from 'vitest';
import { getActionKeyStyle } from '../../../project/action-style';
import { drawKeystroke, measureKeystroke } from './keystrokes';
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

it('omits empty labels and frames too small for a legible key', () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  drawKeystroke(context, { event: { label: '' }, progress: 0.5 }, 1);
  drawKeystroke(context, { event: { label: 'Key' }, progress: 0.5 }, 1, {
    x: 0,
    y: 0,
    width: 10,
    height: 0,
  });
  expect(context.save).not.toHaveBeenCalled();
  expect(context.fillText).not.toHaveBeenCalled();
});

it('uses native canvas bounds or their fallback and preserves an unanimated key opacity', () => {
  for (const canvas of [undefined, { width: 800, height: 450 }]) {
    const context = {
      canvas,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      globalAlpha: 0.5,
      measureText: () => ({ width: 90 }),
    } as unknown as CanvasRenderingContext2D;
    const state = {
      event: { label: 'Key' },
      progress: 0.01,
      keyStyle: { ...getActionKeyStyle(), entrance: 'none' as const },
    };
    const bounds = measureKeystroke(context, state, 0.1)!;
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(canvas?.width ?? 1920);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(canvas?.height ?? 1080);
    expect(bounds.travel).toBe(0);
    drawKeystroke(context, state, 0.1);
    expect(context.fillText).toHaveBeenCalledOnce();
    expect(context.globalAlpha).toBe(0.5 * getActionKeyStyle().opacity);
    expect(vi.mocked(context.save).mock.calls.length).toBe(
      vi.mocked(context.restore).mock.calls.length
    );
  }
});
