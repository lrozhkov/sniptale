// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
  applyRichShapeDocumentObjectToObject,
  createRichShapeCalloutObject,
  createRichShapeObject,
  exportRichShapeDocumentObject,
  resizeRichShapeObjectToBounds,
} from './';

function createCalloutSettings() {
  const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).callout;
  return {
    ...settings,
    tailSide: 'right' as const,
    text: {
      ...settings.text,
      fontSize: 18,
      textColor: '#123456',
      verticalAlign: 'center' as const,
    },
  };
}

it('creates a dynamic callout rich shape with tail controls and shape-local text frame', () => {
  const object = createRichShapeCalloutObject({
    id: 'callout-1',
    labelIndex: 3,
    left: 12,
    settings: createCalloutSettings(),
    top: 24,
    width: 180,
    height: 120,
  });
  const exported = exportRichShapeDocumentObject(object);

  expect(object.sniptaleType).toBe('rich-shape');
  expect(object.sniptaleRichShapeCatalogId).toBe('dynamic-callout');
  expect(object.sniptaleLabel).toBe('Выноска 3');
  expect(Object.keys(object.controls)).toEqual(
    expect.arrayContaining(['calloutBaseStart', 'calloutBaseEnd', 'calloutTip'])
  );
  expect(exported).toEqual(
    expect.objectContaining({
      id: 'callout-1',
      shapeFamily: 'callout',
      shapeKind: 'dynamic-callout',
    })
  );
  expect(exported.callout?.tail.side).toBe('right');
  expect(exported.text).toEqual(
    expect.objectContaining({
      color: '#123456',
      fontSize: 18,
      verticalAlign: 'middle',
    })
  );
});

it('maps dashed and dotted border presets into rich shape line styles', () => {
  const dashedSettings = {
    ...createCalloutSettings(),
    style: { ...createCalloutSettings().style, strokeStyle: 'dashed' as const },
  };
  const dottedSettings = {
    ...createCalloutSettings(),
    style: { ...createCalloutSettings().style, strokeStyle: 'dotted' as const },
  };

  const dashed = createRichShapeCalloutObject({
    id: 'dashed-callout',
    labelIndex: 1,
    left: 0,
    settings: dashedSettings,
    top: 0,
  });
  const dotted = createRichShapeCalloutObject({
    id: 'dotted-callout',
    labelIndex: 2,
    left: 0,
    settings: dottedSettings,
    top: 0,
  });

  expect(dashed.sniptaleRichShape.style.line.dashStyle).toBe('dash');
  expect(dotted.sniptaleRichShape.style.line.dashStyle).toBe('dot');
});

it('applies and resizes dynamic callout geometry through the rich-shape mutation seam', () => {
  const object = createRichShapeCalloutObject({
    id: 'mutable-callout',
    labelIndex: 1,
    left: 0,
    settings: createCalloutSettings(),
    top: 0,
    width: 100,
    height: 80,
  });

  const applied = applyRichShapeDocumentObjectToObject(object, {
    ...object.sniptaleRichShape,
    text: { ...object.sniptaleRichShape.text, content: 'Callout text' },
    style: { ...object.sniptaleRichShape.style, cornerRadius: 18 },
  });
  const resized = resizeRichShapeObjectToBounds(object, {
    left: 10,
    top: 12,
    width: 200,
    height: 160,
  });
  const exported = exportRichShapeDocumentObject(object);

  expect(applied).toBe(true);
  expect(resized).toBe(true);
  expect(exported.frame).toEqual({ height: 160, left: 10, top: 12, width: 200 });
  expect(exported.callout?.tail.side).toBe('right');
  expect(object.getObjects().length).toBeGreaterThan(2);
});

function createCustomCalloutShape() {
  const geometry = {
    paths: [{ commands: [['M', 0, 0], ['L', 80, 40], ['Z']] }],
    type: 'path',
    viewBox: { height: 40, minX: 0, minY: 0, width: 80 },
  } as const;

  return createDefaultRichShapeObject({
    frame: { height: 40, left: 0, top: 0, width: 80 },
    geometry,
    shapeKind: 'custom-callout-proof',
  });
}

function createCustomCatalogSourceShape() {
  return createDefaultRichShapeObject({
    shapeKind: 'missing-callout-proof',
    source: {
      formatVersion: null,
      importedAt: null,
      itemId: null,
      libraryId: null,
      name: null,
      type: 'custom',
    },
  });
}

it('keeps static fallback geometry visible for custom and catalog shapes', () => {
  const shape = createCustomCalloutShape();
  const custom = createRichShapeObject(shape);
  const catalogFallback = createRichShapeObject(
    createDefaultRichShapeObject({
      frame: { height: 40, left: 0, top: 0, width: 80 },
      shapeKind: 'rectangle',
      source: {
        formatVersion: null,
        importedAt: null,
        itemId: null,
        libraryId: null,
        name: null,
        type: 'custom',
      },
    })
  );

  if (!custom || !catalogFallback) {
    throw new Error('Expected rich shape objects');
  }

  expect(custom.getObjects().length).toBeGreaterThan(1);
  expect(catalogFallback.getObjects().length).toBeGreaterThan(1);
  expect(applyRichShapeDocumentObjectToObject(custom, shape)).toBe(true);
  expect(
    resizeRichShapeObjectToBounds(custom, {
      height: 60,
      left: 5,
      top: 6,
      width: 120,
    })
  ).toBe(true);
  expect(exportRichShapeDocumentObject(custom).callout).toBeUndefined();
});

it('keeps non-rich-shape mutation guards intact', () => {
  const shape = createCustomCalloutShape();
  const custom = createRichShapeObject(shape);
  const unsupported = createCustomCatalogSourceShape();
  const catalogFallback = createRichShapeObject(
    createDefaultRichShapeObject({
      frame: { height: 40, left: 0, top: 0, width: 80 },
      shapeKind: 'rectangle',
      source: {
        formatVersion: null,
        importedAt: null,
        itemId: null,
        libraryId: null,
        name: null,
        type: 'custom',
      },
    })
  );

  if (!custom || !catalogFallback) {
    throw new Error('Expected rich shape objects');
  }

  expect(createRichShapeObject(unsupported)).toBeNull();
  expect(applyRichShapeDocumentObjectToObject(catalogFallback, unsupported)).toBe(false);
  expect(
    applyRichShapeDocumentObjectToObject(custom, {
      ...createDefaultRichShapeObject({
        frame: { height: 40, left: 0, top: 0, width: 80 },
        shapeKind: 'rectangle',
      }),
      source: {
        formatVersion: '1',
        importedAt: null,
        itemId: 'rectangle',
        libraryId: null,
        name: 'Rectangle',
        type: 'built-in',
      },
    })
  ).toBe(true);
  expect(applyRichShapeDocumentObjectToObject({ sniptaleType: 'rectangle' } as never, shape)).toBe(
    false
  );
  expect(resizeRichShapeObjectToBounds({ sniptaleType: 'rectangle' } as never, shape.frame)).toBe(
    false
  );
});
