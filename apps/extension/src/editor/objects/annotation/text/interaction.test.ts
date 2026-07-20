import { Point } from 'fabric';
import { expect, it, vi } from 'vitest';

import { DEFAULT_TEXT_CALLOUT_HEIGHT, DEFAULT_TEXT_CALLOUT_WIDTH } from './callout';
import { getScaledTextCalloutDimensions } from './callout';
import { attachTextCalloutGeometry, normalizeTextCalloutFormat } from './interaction';

interface TestTextbox {
  _getNonTransformedDimensions: () => Point;
  _getTransformedDimensions: (options?: Record<string, unknown>) => Point;
  height: number;
  sniptaleTextCalloutFormat?: unknown;
  sniptaleTextCalloutHeight?: number | undefined;
  sniptaleTextCalloutGeometryAttached?: boolean;
  sniptaleTextLayoutMode?: 'auto' | 'fixed-width' | undefined;
  sniptaleTextCalloutWidth?: number | undefined;
  padding: number;
  scaleX: number;
  scaleY: number;
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
    height: 40,
    sniptaleTextCalloutFormat: 'bubble',
    sniptaleTextCalloutHeight: DEFAULT_TEXT_CALLOUT_HEIGHT,
    sniptaleTextCalloutWidth: DEFAULT_TEXT_CALLOUT_WIDTH,
    padding: 10,
    scaleX: 1,
    scaleY: 1,
    strokeWidth: 0,
    translateToGivenOrigin: vi.fn((point: Point) => point),
    width: 120,
    ...overrides,
  };
}

function expectAutoSurfaceGeometry(transformed: Point, originPoint: Point) {
  expect(transformed).toEqual(new Point(840, 60));
  expect(originPoint).toEqual(new Point(420, 30));
}

it('normalizes removed formats to bubble and attaches reusable outer-surface geometry', () => {
  const textbox = createTextbox({
    sniptaleTextCalloutFormat: 'unknown',
    sniptaleTextCalloutHeight: undefined,
    sniptaleTextLayoutMode: 'fixed-width',
    sniptaleTextCalloutWidth: undefined,
    scaleX: 2,
    scaleY: 0.5,
  });

  expect(normalizeTextCalloutFormat('ribbon')).toBe('bubble');
  expect(normalizeTextCalloutFormat('burst')).toBe('bubble');

  attachTextCalloutGeometry(textbox as never);
  const transformed = textbox._getTransformedDimensions();
  const originPoint = textbox.translateToGivenOrigin(
    new Point(0, 0),
    'left',
    'top',
    'center',
    'center'
  );

  attachTextCalloutGeometry(textbox as never);

  expectAutoSurfaceGeometry(transformed, originPoint);
});

it('uses the stored plain text box for geometry and preserves zero-offset conversion', () => {
  const textbox = createTextbox({
    sniptaleTextCalloutFormat: 'plain',
    sniptaleTextCalloutHeight: 120,
    sniptaleTextCalloutWidth: 420,
    sniptaleTextLayoutMode: 'fixed-width',
    translateToGivenOrigin: vi.fn((point: Point) => new Point(point.x + 1, point.y + 2)),
  });

  attachTextCalloutGeometry(textbox as never);

  expect(textbox._getNonTransformedDimensions()).toEqual(new Point(420, 120));
  expect(textbox._getTransformedDimensions()).toEqual(new Point(420, 120));
  expect(
    textbox.translateToGivenOrigin(new Point(3, 4), 'center', 'center', 'center', 'center')
  ).toEqual(new Point(3, 4));
});

it('reports scaled dimensions from the outer callout surface', () => {
  const textbox = createTextbox({
    sniptaleTextCalloutHeight: 120,
    sniptaleTextLayoutMode: 'fixed-width',
    sniptaleTextCalloutWidth: 420,
    scaleX: 1.5,
    scaleY: 0.5,
  });

  expect(getScaledTextCalloutDimensions(textbox as never)).toEqual({
    height: 60,
    width: 630,
  });
});
