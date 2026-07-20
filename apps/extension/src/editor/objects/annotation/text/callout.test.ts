import { Point } from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyTextCalloutRendering,
  getTextCalloutBackgroundColor,
  getTextCalloutDimensions,
  getTextCalloutPadding,
  normalizeTextCalloutFormat,
  resizeTextCallout,
} from './callout';
import { getTextCalloutPath } from './formats';

interface TestTextbox {
  _setEditingProps?: () => void;
  _getNonTransformedDimensions: () => Point;
  _getTransformedDimensions: (options?: Record<string, unknown>) => Point;
  _renderBackground?: (context: unknown) => void;
  backgroundColor: string;
  fontSize: number;
  hasControls: boolean;
  height: number;
  initDimensions: ReturnType<typeof vi.fn>;
  sniptaleTextBackgroundOpacity?: number | undefined;
  sniptaleTextCalloutEditingAttached?: boolean;
  sniptaleTextCalloutFormat?: unknown;
  sniptaleTextCalloutHeight?: number | undefined;
  sniptaleTextCalloutShadow?: number | undefined;
  sniptaleTextCalloutWidth?: number | undefined;
  padding: number;
  scaleX: number;
  scaleY: number;
  set: ReturnType<typeof vi.fn>;
  strokeWidth: number;
  translateToGivenOrigin: (
    point: Point,
    fromOriginX?: unknown,
    fromOriginY?: unknown,
    toOriginX?: unknown,
    toOriginY?: unknown
  ) => Point;
  width: number;
}

function createTextbox(overrides: Partial<TestTextbox> = {}): TestTextbox {
  return {
    _setEditingProps: vi.fn(function setEditingProps(this: TestTextbox) {
      this.hasControls = false;
    }),
    _getNonTransformedDimensions() {
      return new Point(this.width, this.height);
    },
    _getTransformedDimensions(options: Record<string, unknown> = {}) {
      const height = Number(options['height'] ?? this.height);
      const scaleX = Number(options['scaleX'] ?? this.scaleX);
      const scaleY = Number(options['scaleY'] ?? this.scaleY);
      const strokeWidth = Number(options['strokeWidth'] ?? this.strokeWidth);
      const width = Number(options['width'] ?? this.width);
      return new Point((width + strokeWidth) * scaleX, (height + strokeWidth) * scaleY);
    },
    backgroundColor: '#123456',
    fontSize: 16,
    hasControls: true,
    height: 40,
    initDimensions: vi.fn(function initDimensions(this: TestTextbox) {
      this.height = 40;
    }),
    sniptaleTextCalloutFormat: 'panel',
    sniptaleTextCalloutHeight: 60,
    sniptaleTextCalloutShadow: 0,
    sniptaleTextCalloutWidth: 140,
    padding: 10,
    scaleX: 1,
    scaleY: 1,
    set: vi.fn(function set(this: TestTextbox, patch: Partial<TestTextbox>) {
      Object.assign(this, patch);
    }),
    strokeWidth: 0,
    translateToGivenOrigin(point: Point) {
      return point;
    },
    width: 120,
    ...overrides,
  };
}

function createCanvasContext() {
  return {
    arcTo: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    globalAlpha: 1,
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    shadowBlur: 0,
    shadowColor: 'transparent',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    scale: vi.fn(),
    translate: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function registerCatalogTests() {
  it('keeps only supported formats and normalizes removed values to bubble', () => {
    expect(normalizeTextCalloutFormat('plain')).toBe('plain');
    expect(normalizeTextCalloutFormat('panel')).toBe('panel');
    expect(normalizeTextCalloutFormat('bubble')).toBe('bubble');
    expect(normalizeTextCalloutFormat('pointer')).toBe('pointer');
    expect(normalizeTextCalloutFormat('flag')).toBe('flag');
    expect(normalizeTextCalloutFormat('arrow-bubble')).toBe('arrow-bubble');
    expect(normalizeTextCalloutFormat('ribbon')).toBe('bubble');
    expect(normalizeTextCalloutFormat('burst')).toBe('bubble');
    expect(normalizeTextCalloutFormat('legacy')).toBe('bubble');
    expect(getTextCalloutPadding('plain')).toBe(0);
    expect(getTextCalloutPadding('panel')).toBe(10);
    expect(getTextCalloutBackgroundColor({ calloutFormat: 'plain' } as never)).toBe('');
    expect(
      getTextCalloutBackgroundColor({
        backgroundColor: '#abcdef',
        calloutFormat: 'bubble',
      } as never)
    ).toBe('#abcdef');
    expect(getTextCalloutPath('bubble')).toContain('L 50 60');
    expect(getTextCalloutPath('arrow-bubble')).toContain('L 50 60');
  });
}

function registerCanvasRenderTests() {
  it('renders SVG path backgrounds through Path2D and traced canvas fallback', () => {
    const textbox = createTextbox();
    const pathCtor = vi.fn();
    vi.stubGlobal('Path2D', pathCtor);

    applyTextCalloutRendering(textbox as never);
    const pathContext = createCanvasContext();
    textbox._renderBackground?.(pathContext as never);

    expect(pathCtor).toHaveBeenCalledOnce();
    expect(pathContext.fill).toHaveBeenCalledOnce();

    vi.stubGlobal('Path2D', undefined);
    const fallbackContext = createCanvasContext();
    textbox._renderBackground?.(fallbackContext as never);

    expect(fallbackContext.fill).toHaveBeenCalledOnce();
    expect(fallbackContext.fillRect).not.toHaveBeenCalled();
  });
}

function registerCanvasFrameTests() {
  it('renders callout fills against the authoritative surface frame', () => {
    const textbox = createTextbox({ height: 60, width: 140 });
    vi.stubGlobal('Path2D', vi.fn());

    applyTextCalloutRendering(textbox as never);
    const pathContext = createCanvasContext();
    textbox._renderBackground?.(pathContext as never);

    expect(pathContext.translate).not.toHaveBeenCalled();
    expect(pathContext.scale).not.toHaveBeenCalled();

    vi.stubGlobal('Path2D', undefined);
    const fallbackContext = createCanvasContext();
    textbox._renderBackground?.(fallbackContext as never);

    expect(fallbackContext.fill).toHaveBeenCalledOnce();
    expect(fallbackContext.fillRect).not.toHaveBeenCalled();
  });
}

function registerCanvasSurfaceTests() {
  it('clamps rendered callout dimensions to the minimum outer surface', () => {
    const textbox = createTextbox({
      sniptaleTextCalloutHeight: 10,
      sniptaleTextCalloutWidth: 40,
    });

    expect(getTextCalloutDimensions(textbox as never)).toEqual({ height: 76, width: 156 });
  });
}

function registerCanvasOpacityTests() {
  it('applies background opacity only while rendering the callout fill', () => {
    const textbox = createTextbox({
      sniptaleTextBackgroundOpacity: 0.35,
      sniptaleTextCalloutShadow: 100,
    });
    vi.stubGlobal('Path2D', vi.fn());

    applyTextCalloutRendering(textbox as never);
    const context = createCanvasContext();
    textbox._renderBackground?.(context as never);

    expect(context.globalAlpha).toBe(0.35);
    expect(context.shadowBlur).toBe(12);
    expect(context.shadowOffsetY).toBe(4);
    expect(context.fill).toHaveBeenCalledOnce();
  });
}

function registerRoundedPathTests() {
  it('builds rounded callout paths with symmetric clamped corner radii on wide short frames', () => {
    const wideShortFrame = {
      height: 40,
      left: -100,
      top: -20,
      width: 200,
    };

    expect(getTextCalloutPath('panel', wideShortFrame)).toContain('A 5.333 5.333');
    expect(getTextCalloutPath('bubble', wideShortFrame)).toContain('A 7.2 7.2');
    expect(getTextCalloutPath('arrow-bubble', wideShortFrame)).toContain('A 7 7');
  });
}

function registerRenderGuardTests() {
  it('skips background drawing for plain or empty callout surfaces', () => {
    const plain = createTextbox({
      backgroundColor: '',
      sniptaleTextCalloutFormat: 'plain',
    });
    const context = createCanvasContext();

    applyTextCalloutRendering(plain as never);
    plain._renderBackground?.(context as never);

    expect(context.fill).not.toHaveBeenCalled();
    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it('hides resize controls while the text callout is in editing mode', () => {
    const textbox = createTextbox();

    applyTextCalloutRendering(textbox as never);
    textbox._setEditingProps?.();

    expect(textbox.hasControls).toBe(false);
    expect(textbox.sniptaleTextCalloutEditingAttached).toBe(true);
  });
}

function registerResizeBehaviorTests() {
  it('resizes bubble callouts through the outer surface and plain text through a simple box', () => {
    const bubble = createTextbox({
      sniptaleTextCalloutFormat: 'bubble',
      scaleX: 2,
      scaleY: 0.5,
    });

    resizeTextCallout(bubble as never, 220, 48);

    expect(bubble['scaleX']).toBe(1);
    expect(bubble['scaleY']).toBe(1);
    expect(bubble['width']).toBe(184);
    expect(bubble['sniptaleTextCalloutWidth']).toBe(220);
    expect(bubble['sniptaleTextCalloutHeight']).toBe(76);
    expect(bubble['initDimensions']).toHaveBeenCalledOnce();

    const plain = createTextbox({
      sniptaleTextCalloutFormat: 'plain',
      padding: 0,
      scaleX: 1.5,
      scaleY: 0.75,
    });

    resizeTextCallout(plain as never, 180, 40);

    expect(plain['scaleX']).toBe(1);
    expect(plain['scaleY']).toBe(1);
    expect(plain['width']).toBe(180);
    expect(plain['sniptaleTextCalloutWidth']).toBe(180);
    expect(plain['sniptaleTextCalloutHeight']).toBe(40);
    expect(plain['initDimensions']).toHaveBeenCalledOnce();
  });
}

describe('text callout rendering', () => {
  registerCatalogTests();
  registerCanvasRenderTests();
  registerCanvasFrameTests();
  registerCanvasSurfaceTests();
  registerCanvasOpacityTests();
  registerRoundedPathTests();
  registerRenderGuardTests();
  registerResizeBehaviorTests();
});
