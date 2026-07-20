import { describe, expect, it, vi } from 'vitest';

import { applyTextLayout } from './apply';
import { attachTextLayoutLifecycle } from './lifecycle';
import { resolveFixedSurfaceWidth, resolveMeasuredTextWidth } from './measure';

function createTextbox(overrides: Record<string, unknown> = {}) {
  const handlers = new Map<string, () => void>();
  return {
    calcTextWidth: vi.fn(() => 23.4),
    canvas: { requestRenderAll: vi.fn() },
    height: 40,
    initDimensions: vi.fn(),
    sniptaleTextCalloutFormat: 'plain',
    sniptaleTextLayoutMode: 'auto',
    on: vi.fn((eventName: string, handler: () => void) => handlers.set(eventName, handler)),
    set: vi.fn(function set(this: Record<string, unknown>, patch: Record<string, unknown>) {
      Object.assign(this, patch);
    }),
    setCoords: vi.fn(),
    width: 120,
    __handlers: handlers,
    ...overrides,
  };
}

describe('text layout role owners', () => {
  it('keeps width measurement and fixed surface resolution as pure layout inputs', () => {
    const textbox = createTextbox();

    expect(resolveMeasuredTextWidth(textbox as never)).toBe(32);
    expect(resolveFixedSurfaceWidth(textbox as never, 180.4, 'plain')).toBe(180);
  });

  it('applies layout mutations separately from lifecycle attachment', () => {
    const textbox = createTextbox();

    applyTextLayout(textbox as never);
    attachTextLayoutLifecycle(textbox as never);
    textbox.__handlers.get('changed')?.();

    expect(textbox.set).toHaveBeenCalled();
    expect(textbox.initDimensions).toHaveBeenCalled();
    expect(textbox.setCoords).toHaveBeenCalledOnce();
    expect(textbox.canvas.requestRenderAll).toHaveBeenCalledOnce();
  });
});
