import { expect, it } from 'vitest';
import { createExcalidrawDefinition } from './definition';
import { combineExcalidrawElementGeometries, createExcalidrawElementGeometry } from './geometry';
import type { ExcalidrawElementModel, ExcalidrawMappedElement } from './types';

function createElement(overrides: Partial<ExcalidrawElementModel> = {}): ExcalidrawElementModel {
  return {
    id: 'element-1',
    type: 'line',
    x: 10,
    y: 20,
    width: 40,
    height: 30,
    angle: 0,
    strokeColor: '#111111',
    backgroundColor: '#ffffff',
    fillStyle: null,
    strokeWidth: null,
    strokeStyle: null,
    roughness: null,
    opacity: null,
    seed: null,
    groupIds: [],
    points: [],
    startArrowhead: null,
    endArrowhead: null,
    text: null,
    fontSize: null,
    textAlign: null,
    verticalAlign: null,
    containerId: null,
    ...overrides,
  };
}

function createMapped(element: ExcalidrawElementModel): ExcalidrawMappedElement {
  const geometry = createExcalidrawElementGeometry(element);
  if (!geometry) {
    throw new Error('Expected mapped geometry');
  }

  return {
    element,
    geometry,
    bounds: { left: element.x, top: element.y, width: element.width, height: element.height },
    shapeFamily: 'line',
    shapeKind: 'line',
    style: {
      fill: { type: 'solid', color: '#ffffff' },
      fillTransparency: 0,
      line: {
        color: '#111111',
        transparency: 0,
        width: 2,
        dashStyle: 'solid',
        cap: 'round',
        join: 'round',
        beginArrowhead: 'none',
        endArrowhead: 'none',
      },
      opacity: 1,
      cornerRadius: 0,
    },
    text: null,
  };
}

it('builds fallback line geometry and combines mixed Excalidraw geometries', () => {
  const line = createMapped(createElement());
  const rectangle = createMapped(createElement({ id: 'rect-1', type: 'rectangle', x: 80 }));

  expect(line.geometry).toEqual(
    expect.objectContaining({
      type: 'polyline',
      points: [
        [0, 0],
        [40, 30],
      ],
    })
  );
  expect(combineExcalidrawElementGeometries([])).toBeNull();
  expect(combineExcalidrawElementGeometries([line])).toBe(line.geometry);
  expect(combineExcalidrawElementGeometries([line, rectangle])).toEqual(
    expect.objectContaining({ type: 'path' })
  );
  expect(createExcalidrawElementGeometry(createElement({ type: 'image' }))).toBeNull();
});

it('creates imported custom shape definitions with rough fill defaults', () => {
  const mapped = createMapped(createElement({ fillStyle: 'cross-hatch', roughness: null }));

  expect(
    createExcalidrawDefinition({
      document: {
        fileName: 'library.excalidrawlib',
        items: [],
        kind: 'library',
        libraryId: 'library-1',
        libraryName: 'Library',
        version: '2',
      },
      item: {
        id: 'item-1',
        name: 'Imported line',
        category: null,
        elements: [mapped.element],
        tags: ['wire'],
      },
      label: 'Imported line',
      mappedElements: [mapped],
    })
  ).toEqual(
    expect.objectContaining({
      label: 'Imported line',
      richShapeDefaults: expect.objectContaining({
        rough: expect.objectContaining({
          fillBowing: 1,
          fillRoughness: 1,
          fillStyle: 'cross-hatch',
          fillTransparency: 0,
        }),
      }),
    })
  );
});

it('handles empty imports and export item shape-kind replacements', () => {
  const mapped = {
    ...createMapped(createElement({ type: 'rectangle' })),
    shapeFamily: 'library',
    shapeKind: 'excalidraw-library-item',
  } as ExcalidrawMappedElement;
  const document = {
    fileName: 'export.excalidraw',
    items: [],
    kind: 'export' as const,
    libraryId: 'library-1',
    libraryName: 'Library',
    version: '2',
  };
  const item = {
    id: 'item-1',
    name: 'Cloud',
    category: 'imported',
    elements: [mapped.element],
    tags: ['cloud'],
  };

  expect(
    createExcalidrawDefinition({
      document,
      item,
      label: 'Cloud',
      mappedElements: [],
    })
  ).toBeNull();
  const definition = createExcalidrawDefinition({
    document,
    item,
    label: 'Cloud',
    mappedElements: [mapped],
  });
  expect(definition?.richShapeDefaults?.shapeKind).toBe('cloud-callout');
});
