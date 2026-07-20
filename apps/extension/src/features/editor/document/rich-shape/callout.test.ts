import { describe, expect, it } from 'vitest';
import {
  createDefaultRichShapeCalloutGeometry,
  createDefaultRichShapeObject,
  createRichShapeCalloutGeometry,
  isEditorRichShapeDocumentObject,
  normalizeEditorDocumentRichShapes,
  normalizeEditorRichShapeObject,
  resetRichShapeCalloutTail,
  resizeRichShapeCalloutGeometry,
  switchRichShapeCalloutSide,
} from './index';

describe('rich-shape dynamic callout geometry', () => {
  registerCalloutGeometryCreationTests();
  registerCalloutNormalizationTests();
  registerCalloutMutationTests();
});

function registerCalloutGeometryCreationTests() {
  it('creates a body text frame and integrated tail path for each side', () => {
    const frame = { left: 10, top: 20, width: 200, height: 100 };

    (['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
      const shape = createDefaultRichShapeObject({
        callout: createDefaultRichShapeCalloutGeometry(frame, side),
        frame,
        shapeFamily: 'callout',
        shapeKind: 'dynamic-callout',
      });

      const geometry = createRichShapeCalloutGeometry(shape);

      expect(geometry?.type).toBe('path');
      expect(geometry?.viewBox).toEqual({ minX: 0, minY: 0, width: 200, height: 100 });
      expect(geometry?.textFrame).toEqual(shape.callout?.body);
      if (geometry?.type !== 'path') {
        throw new Error('Expected dynamic callout path geometry');
      }
      expect(geometry.paths[0]?.commands.some((command) => command[0] === 'Z')).toBe(true);
    });
  });
}

function registerCalloutNormalizationTests() {
  registerMalformedCalloutNormalizationTests();
  registerCalloutArrayNormalizationTests();
  registerCalloutHydrationTests();
}

function registerMalformedCalloutNormalizationTests() {
  it('normalizes malformed ratios and preserves legacy shapes without callout data', () => {
    const fallbackShape = normalizeEditorRichShapeObject(null);
    const legacyShape = normalizeEditorRichShapeObject({
      ...createDefaultRichShapeObject(),
      callout: undefined,
    });
    const normalized = normalizeEditorRichShapeObject({
      ...createDefaultRichShapeObject(),
      callout: {
        body: { left: -10, top: -10, width: 1000, height: 1000 },
        tail: {
          side: 'unknown',
          baseStartRatio: 0.95,
          baseEndRatio: 0.1,
          tip: { x: 1000, y: -50 },
        },
      },
      frame: { left: 0, top: 0, width: 100, height: 80 },
    });

    expect(fallbackShape.shapeKind).toBe('custom-shape');
    expect(fallbackShape.callout).toBeUndefined();
    expect(legacyShape.callout).toBeUndefined();
    expect(normalized.callout?.tail.side).toBe('top');
    expect(normalized.callout?.tail.baseEndRatio).toBeGreaterThan(
      normalized.callout?.tail.baseStartRatio ?? 0
    );
    expect(normalized.callout?.tail.tip).toEqual({ x: 100, y: 0 });
  });
}

function registerCalloutArrayNormalizationTests() {
  it('normalizes rich-shape arrays only from array inputs', () => {
    const shapes = [
      createDefaultRichShapeObject({
        shapeKind: 'rectangle',
      }),
      createDefaultRichShapeObject({
        frame: { height: 90, left: 0, top: 0, width: 160 },
        shapeFamily: 'callout',
        shapeKind: 'dynamic-callout',
      }),
    ];

    expect(normalizeEditorDocumentRichShapes(null)).toEqual([]);
    expect(normalizeEditorDocumentRichShapes(shapes)).toHaveLength(2);
    expect(normalizeEditorDocumentRichShapes(shapes)[1]?.callout?.tail.side).toBe('top');
    expect(normalizeEditorDocumentRichShapes(shapes)[1]?.callout?.body.top).toBeGreaterThan(0);
  });
}

function registerCalloutHydrationTests() {
  it('hydrates missing callout data for dynamic callout documents', () => {
    const normalized = normalizeEditorRichShapeObject({
      ...createDefaultRichShapeObject(),
      callout: undefined,
      frame: { left: 0, top: 0, width: 160, height: 90 },
      shapeFamily: 'callout',
      shapeKind: 'dynamic-callout',
    });

    expect(normalized.callout?.tail.side).toBe('top');
    expect(createRichShapeCalloutGeometry(normalized)?.textFrame).toEqual(normalized.callout?.body);
    expect(isEditorRichShapeDocumentObject(normalized)).toBe(true);
  });
}

function registerCalloutMutationTests() {
  it('switches, resets, and resizes tail geometry without losing the selected side', () => {
    const shape = createDefaultRichShapeObject({
      callout: createDefaultRichShapeCalloutGeometry(
        { left: 0, top: 0, width: 100, height: 80 },
        'top'
      ),
      frame: { left: 0, top: 0, width: 100, height: 80 },
      shapeFamily: 'callout',
      shapeKind: 'dynamic-callout',
    });

    const right = switchRichShapeCalloutSide(shape, 'right');
    const reset = resetRichShapeCalloutTail({ ...shape, callout: right }, 'bottom');
    const resized = resizeRichShapeCalloutGeometry(right, shape.frame, {
      ...shape.frame,
      width: 200,
      height: 160,
    });

    expect(right.tail.side).toBe('right');
    expect(right.tail.tip).toEqual({ x: 100, y: 40 });
    expect(reset.tail.side).toBe('bottom');
    expect(resized.tail.side).toBe('right');
    expect(resized.tail.tip).toEqual({ x: 200, y: 80 });
  });
}
