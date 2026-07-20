import { describe, expect, it, vi } from 'vitest';

import {
  getTextCalloutBodyRect,
  getTextCalloutContentRect,
  getTextCalloutTailMetrics,
  setTextCalloutMeasuredContentHeight,
} from './geometry';
import { applyTextLayout, attachTextLayoutLifecycle } from './layout';

function createTextbox(overrides: Record<string, unknown> = {}) {
  const handlers = new Map<string, () => void>();
  return {
    calcTextWidth: vi.fn(() => 84.4),
    canvas: { requestRenderAll: vi.fn() },
    fontSize: 16,
    height: 40,
    initDimensions: vi.fn(),
    sniptaleTextCalloutFormat: 'panel',
    sniptaleTextCalloutHeight: 60,
    sniptaleTextCalloutWidth: 140,
    sniptaleTextLayoutMode: 'auto',
    on: vi.fn((eventName: string, handler: () => void) => handlers.set(eventName, handler)),
    padding: 10,
    set: vi.fn(function set(this: Record<string, unknown>, patch: Record<string, unknown>) {
      Object.assign(this, patch);
    }),
    setCoords: vi.fn(),
    width: 120,
    __handlers: handlers,
    ...overrides,
  };
}

function registerSurfaceStorageTests() {
  it('stores auto-layout surfaces from the measured textbox width', () => {
    const textbox = createTextbox();

    applyTextLayout(textbox as never);

    expect(textbox.width).toBe(84);
    expect(textbox.sniptaleTextCalloutWidth).toBe(120);
    expect(textbox.sniptaleTextCalloutHeight).toBe(76);
  });

  it('keeps fixed-width callouts authoritative on explicit surface dimensions', () => {
    const textbox = createTextbox({ sniptaleTextLayoutMode: 'fixed-width' });

    applyTextLayout(textbox as never, {
      layoutMode: 'fixed-width',
      surfaceHeight: 140,
      surfaceWidth: 240,
    });

    expect(textbox.width).toBe(204);
    expect(textbox.sniptaleTextCalloutWidth).toBe(240);
    expect(textbox.sniptaleTextCalloutHeight).toBe(140);
  });

  it('stores plain fixed-width surfaces from explicit width and measured height fallback', () => {
    const textbox = createTextbox({
      sniptaleTextCalloutFormat: 'plain',
      sniptaleTextLayoutMode: 'fixed-width',
      sniptaleTextCalloutHeight: undefined,
      sniptaleTextCalloutWidth: undefined,
      padding: 0,
    });

    applyTextLayout(textbox as never, {
      layoutMode: 'fixed-width',
      surfaceWidth: 180,
    });

    expect(textbox.width).toBe(180);
    expect(textbox.height).toBe(40);
    expect(textbox.sniptaleTextCalloutWidth).toBe(180);
    expect(textbox.sniptaleTextCalloutHeight).toBe(40);
  });
}

function registerPlainFixedSurfaceTests() {
  it('keeps plain fixed-height textboxes aligned with the resize surface', () => {
    const textbox = createTextbox({
      height: 64,
      sniptaleTextCalloutFormat: 'plain',
      sniptaleTextCalloutHeight: 220,
      sniptaleTextCalloutWidth: 180,
      sniptaleTextLayoutMode: 'fixed-width',
      sniptaleTextVerticalAlign: 'bottom',
      padding: 0,
    });

    applyTextLayout(textbox as never, {
      layoutMode: 'fixed-width',
      surfaceHeight: 220,
      surfaceWidth: 180,
    });

    expect(textbox.height).toBe(220);
    expect(textbox.sniptaleTextCalloutHeight).toBe(220);
    expect(
      getTextCalloutContentRect({ height: 220, width: 180 }, textbox as never, 'plain').top
    ).toBe(156);
    expect(Object.keys(textbox)).not.toContain('__sniptaleTextCalloutContentHeight');
  });

  it('uses measured content height for fixed-width vertical alignment', () => {
    const textbox = createTextbox({
      height: 220,
      sniptaleTextCalloutFormat: 'plain',
      sniptaleTextLayoutMode: 'fixed-width',
      sniptaleTextVerticalAlign: 'bottom',
      padding: 0,
    });

    setTextCalloutMeasuredContentHeight(textbox as never, 48);

    expect(
      getTextCalloutContentRect({ height: 220, width: 180 }, textbox as never, 'plain').top
    ).toBe(172);
    expect(Object.keys(textbox)).not.toContain('__sniptaleTextCalloutContentHeight');
  });
}

function registerSurfaceGeometryTests() {
  it('resolves every callout body and tail branch from the shared surface geometry', () => {
    const surface = { height: 120, width: 180 };

    expect(getTextCalloutBodyRect(surface, 'plain')).toEqual({
      height: 120,
      left: 0,
      top: 0,
      width: 180,
    });
    expect(getTextCalloutBodyRect(surface, 'panel')).toMatchObject({ left: 8, top: 8 });
    expect(getTextCalloutBodyRect(surface, 'bubble').height).toBeLessThan(
      getTextCalloutBodyRect(surface, 'panel').height
    );
    expect(getTextCalloutBodyRect(surface, 'arrow-bubble').height).toBeLessThan(
      getTextCalloutBodyRect(surface, 'panel').height
    );
    expect(getTextCalloutBodyRect(surface, 'pointer').left).toBeGreaterThan(12);
    expect(getTextCalloutBodyRect(surface, 'flag').width).toBeLessThan(
      getTextCalloutBodyRect(surface, 'panel').width
    );
    expect(getTextCalloutTailMetrics(surface, 'bubble')).toHaveProperty('halfWidth');
    expect(getTextCalloutTailMetrics(surface, 'arrow-bubble')).toHaveProperty('shoulderOffset');
    expect(getTextCalloutTailMetrics(surface, 'pointer')).toHaveProperty('width');
    expect(getTextCalloutTailMetrics(surface, 'flag')).toHaveProperty('notchWidth');
  });

  it('normalizes invalid measured heights and non-numeric padding in content placement', () => {
    const textbox = createTextbox({
      fontSize: 18,
      height: undefined,
      sniptaleTextCalloutFormat: 'plain',
      sniptaleTextLayoutMode: 'fixed-width',
      sniptaleTextVerticalAlign: 'center',
      padding: null,
    });

    setTextCalloutMeasuredContentHeight(textbox as never, -1);

    expect(
      getTextCalloutContentRect({ height: 100, width: 160 }, textbox as never, 'plain')
    ).toEqual({
      height: 100,
      left: 0,
      top: 41,
      width: 160,
    });
  });
}

function registerLifecycleTests() {
  it('keeps layout metadata only when Fabric set support is unavailable', () => {
    const textbox = createTextbox({ set: undefined });

    applyTextLayout(textbox as never, { layoutMode: 'fixed-width' });

    expect(textbox.sniptaleTextLayoutMode).toBe('fixed-width');
    expect(textbox.initDimensions).not.toHaveBeenCalled();
  });

  it('attaches one auto-layout lifecycle and skips rerenders for fixed-width mode', () => {
    const textbox = createTextbox();

    attachTextLayoutLifecycle(textbox as never);
    attachTextLayoutLifecycle(textbox as never);
    textbox.__handlers.get('changed')?.();
    textbox.sniptaleTextLayoutMode = 'fixed-width';
    textbox.__handlers.get('editing:entered')?.();

    expect(textbox.on).toHaveBeenCalledTimes(3);
    expect(textbox.setCoords).toHaveBeenCalledOnce();
    expect(textbox.canvas.requestRenderAll).toHaveBeenCalledOnce();
  });
}

describe('text callout layout', () => {
  registerSurfaceStorageTests();
  registerPlainFixedSurfaceTests();
  registerSurfaceGeometryTests();
  registerLifecycleTests();
});
