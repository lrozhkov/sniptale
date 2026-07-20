import { describe, expect, it, vi } from 'vitest';

vi.mock('fabric', () => ({
  Point: class Point {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
  Rect: class Rect {
    constructor(values: Record<string, unknown> = {}) {
      Object.assign(this, values);
    }
    set(values: Record<string, unknown>) {
      Object.assign(this, values);
      return this;
    }
    getCenterPoint() {
      const rect = this as unknown as Record<string, unknown>;
      const width = Number(rect['width'] ?? 0) * Math.abs(Number(rect['scaleX'] ?? 1));
      const height = Number(rect['height'] ?? 0) * Math.abs(Number(rect['scaleY'] ?? 1));
      return {
        x: Number(rect['left'] ?? 0) + width / 2,
        y: Number(rect['top'] ?? 0) + height / 2,
      };
    }
    setPositionByOrigin(point: { x: number; y: number }) {
      const rect = this as unknown as Record<string, unknown>;
      const width = Number(rect['width'] ?? 0) * Math.abs(Number(rect['scaleX'] ?? 1));
      const height = Number(rect['height'] ?? 0) * Math.abs(Number(rect['scaleY'] ?? 1));
      rect['left'] = point.x - width / 2;
      rect['top'] = point.y - height / 2;
      return this;
    }
  },
  Shadow: class Shadow {
    constructor(values: Record<string, unknown>) {
      Object.assign(this, values);
    }
  },
}));

import { Rect, Shadow } from 'fabric';
import { applyShapeSettings } from './shape-style';

function registerRectangleStyleSuite() {
  it('applies dash arrays, rounded corners, and shadows to rectangles', () => {
    const rect = new Rect({
      height: 30,
      left: 10,
      scaleX: 1,
      scaleY: 1,
      strokeWidth: 1,
      top: 20,
      width: 40,
    }) as unknown as Record<string, unknown>;

    applyShapeSettings(rect as never, 'rectangle', {
      borderPresetId: 'preset',
      customCss: 'outline: 2px solid #abcdef;',
      fillColor: '#ffffff',
      fillOpacity: 0.3,
      inheritCustomCss: true,
      opacity: 0.8,
      radius: 12,
      shadow: 30,
      strokeColor: '#112233',
      strokeOpacity: 0.6,
      strokeStyle: 'dashed',
      strokeWidth: 3,
    });

    expect(rect['sniptaleBorderPresetId']).toBe('preset');
    expect(rect['sniptaleShapeCustomCss']).toBe('');
    expect(rect['sniptaleShapeFillOpacity']).toBe(0.3);
    expect(rect['sniptaleShapeInheritCustomCss']).toBe(false);
    expect(rect['sniptaleShapeRadius']).toBe(12);
    expect(rect['sniptaleShapeStrokeOpacity']).toBe(0.6);
    expect(rect['fill']).toBe('rgba(255, 255, 255, 0.3)');
    expect(rect['opacity']).toBe(1);
    expect(rect['stroke']).toBe('rgba(17, 34, 51, 0.6)');
    expect(rect['strokeDashArray']).toEqual([10, 6]);
    expect(rect['shadow']).toBeInstanceOf(Shadow);
    expect(rect['rx']).toBe(12);
  });
}

function registerRectangleGeometrySuite() {
  it('keeps the rectangle outer bbox stable when stroke grows', () => {
    const rect = new Rect({
      height: 30,
      left: 10,
      scaleX: 2,
      scaleY: 3,
      strokeWidth: 4,
      top: 20,
      width: 40,
    }) as unknown as Record<string, unknown>;

    applyShapeSettings(rect as never, 'rectangle', {
      borderPresetId: null,
      customCss: '',
      fillColor: '#ffffff',
      fillOpacity: 0.3,
      inheritCustomCss: false,
      opacity: 1,
      radius: 8,
      shadow: 0,
      strokeColor: '#112233',
      strokeOpacity: 1,
      strokeStyle: 'solid',
      strokeWidth: 10,
    });

    expect(rect['width']).toBe(37);
    expect(rect['height']).toBeCloseTo(28);
    expect(rect['left']).toBe(13);
    expect(rect['top']).toBe(23);
  });
}

function registerRectangleClampSuite() {
  it('clamps rectangle geometry when the next stroke would exceed the preserved outer size', () => {
    const rect = new Rect({
      height: 2,
      left: 10,
      strokeWidth: 2,
      top: 20,
      width: 2,
    }) as unknown as Record<string, unknown>;

    applyShapeSettings(rect as never, 'rectangle', {
      borderPresetId: null,
      customCss: '',
      fillColor: '#ffffff',
      fillOpacity: 1,
      inheritCustomCss: false,
      opacity: 1,
      radius: 0,
      shadow: 0,
      strokeColor: '#112233',
      strokeOpacity: 1,
      strokeStyle: 'solid',
      strokeWidth: 12,
    });

    expect(rect['width']).toBe(1);
    expect(rect['height']).toBe(1);
  });
}

function registerRectangleRadiusAuthoritySuite() {
  it('clamps rendered rectangle corners by the short side while keeping user radius as intent', () => {
    const rect = new Rect({
      height: 20,
      left: 10,
      strokeWidth: 2,
      top: 20,
      width: 200,
    }) as unknown as Record<string, unknown>;

    applyShapeSettings(rect as never, 'rectangle', {
      borderPresetId: null,
      customCss: '',
      fillColor: '#ffffff',
      fillOpacity: 1,
      inheritCustomCss: false,
      opacity: 1,
      radius: 50,
      shadow: 0,
      strokeColor: '#112233',
      strokeOpacity: 1,
      strokeStyle: 'solid',
      strokeWidth: 2,
    });

    expect(rect['sniptaleShapeRadius']).toBe(50);
    expect(rect['rx']).toBe(10);
    expect(rect['ry']).toBe(10);
  });
}

function registerEllipseTests() {
  it('applies dotted stroke settings with uniform stroke and no rectangle-only corners', () => {
    const ellipse = {
      set: vi.fn(function setEllipseValues(
        this: Record<string, unknown>,
        values: Record<string, unknown>
      ) {
        Object.assign(this, values);
        return this;
      }),
    };

    applyShapeSettings(ellipse as never, 'ellipse', {
      borderPresetId: null,
      customCss: '',
      fillColor: '#ffffff',
      fillOpacity: 1,
      inheritCustomCss: false,
      opacity: 1,
      radius: 10,
      shadow: 0,
      strokeColor: 'transparent',
      strokeOpacity: 1,
      strokeStyle: 'dotted',
      strokeWidth: 2,
    });

    expect(ellipse.set).toHaveBeenCalledWith(
      expect.objectContaining({
        shadow: undefined,
        strokeDashArray: [2, 6],
        strokeUniform: true,
      })
    );
    expect(ellipse).not.toHaveProperty('rx');
    expect(ellipse).not.toHaveProperty('ry');
  });
}

function registerDiamondShadowTests() {
  it('applies hard shadows to non-rectangle shapes through the shared shadow helper', () => {
    const diamond = {
      set: vi.fn(function setDiamondValues(
        this: Record<string, unknown>,
        values: Record<string, unknown>
      ) {
        Object.assign(this, values);
        return this;
      }),
    } as Record<string, unknown>;

    applyShapeSettings(diamond as never, 'diamond', {
      borderPresetId: null,
      customCss: '',
      fillColor: '#ffffff',
      fillOpacity: 0.2,
      inheritCustomCss: false,
      opacity: 1,
      radius: 0,
      shadow: 100,
      strokeColor: '#112233',
      strokeOpacity: 1,
      strokeStyle: 'solid',
      strokeWidth: 4,
    });

    expect(diamond['shadow']).toBeInstanceOf(Shadow);
    expect(diamond['shadow']).toMatchObject({ blur: 12, offsetY: 4 });
  });
}

function runShapeStyleSuite() {
  registerRectangleStyleSuite();
  registerRectangleGeometrySuite();
  registerRectangleClampSuite();
  registerRectangleRadiusAuthoritySuite();
  registerEllipseTests();
  registerDiamondShadowTests();
}

describe('object-factory shape-style seam', runShapeStyleSuite);
