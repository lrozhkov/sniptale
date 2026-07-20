import { describe, expect, it } from 'vitest';
import {
  createDefaultRichShapeObject,
  isEditorRichShapeDocumentObject,
  normalizeEditorRichShapeObject,
} from './index';
import {
  normalizeEditorCustomShapeDefinition,
  normalizeEditorCustomShapeStoredDefinition,
  parseEditorCustomShapeGeometry,
} from './custom';

const geometry = {
  type: 'path',
  viewBox: { minX: 0, minY: 0, width: 10, height: 10 },
  paths: [
    {
      commands: [
        ['M', 0, 0],
        ['L', 10, 10],
      ],
    },
  ],
} as const;

describe('editor custom shape contracts', () => {
  registerCustomShapeGeometryTests();
  registerCustomShapeStorageTests();
  registerCustomShapeMetadataTests();
  registerCustomShapeDocumentTests();
});

function registerCustomShapeGeometryTests() {
  registerCustomShapeDefinitionTests();
  registerCustomShapeParserTests();
}

function registerCustomShapeDefinitionTests() {
  it('normalizes custom shape definitions with valid path geometry', () => {
    expect(
      normalizeEditorCustomShapeDefinition({
        id: 'custom-badge',
        label: 'Badge',
        category: '',
        tags: ['badge', 1],
        capabilities: ['fill', 'line', 'bad'],
        geometry,
        roughDefaults: { roughness: 2 },
      })
    ).toEqual(
      expect.objectContaining({
        id: 'custom-badge',
        category: 'custom',
        tags: ['badge'],
        capabilities: ['fill', 'line'],
        geometry,
      })
    );
  });
}

function registerCustomShapeParserTests() {
  it('rejects malformed geometry and accepts polyline geometry', () => {
    expect(parseEditorCustomShapeGeometry({ type: 'path', viewBox: geometry.viewBox })).toBeNull();
    expect(
      parseEditorCustomShapeGeometry({
        type: 'polyline',
        viewBox: geometry.viewBox,
        points: [
          [0, 0],
          [10, 10],
        ],
        closed: true,
      })
    ).toEqual(
      expect.objectContaining({
        type: 'polyline',
        closed: true,
      })
    );
  });

  it('preserves optional custom shape text frames when geometry is valid', () => {
    expect(
      parseEditorCustomShapeGeometry({
        ...geometry,
        textFrame: { height: 4, left: 2, top: 3, width: 5 },
      })
    ).toEqual({
      ...geometry,
      textFrame: { height: 4, left: 2, top: 3, width: 5 },
    });
    expect(
      parseEditorCustomShapeGeometry({
        ...geometry,
        textFrame: { height: 4, left: 8, top: 3, width: 5 },
      })
    ).toEqual(geometry);
  });
}

function registerCustomShapeStorageTests() {
  it('normalizes stored definitions without preserving invalid rows', () => {
    expect(normalizeEditorCustomShapeStoredDefinition({})).toBeNull();
    expect(
      normalizeEditorCustomShapeStoredDefinition({
        id: 'custom-badge',
        label: 'Badge',
        geometry,
        createdAt: 10,
        updatedAt: 20,
        enabled: false,
        sourceFileName: 'badge.svg',
      })
    ).toEqual(
      expect.objectContaining({
        enabled: false,
        sourceFileName: 'badge.svg',
      })
    );
  });
}

function registerCustomShapeMetadataTests() {
  it('normalizes custom shape import metadata and rich shape defaults', () => {
    const definition = normalizeEditorCustomShapeDefinition({
      id: 'custom-imported',
      label: 'Imported',
      geometry,
      source: {
        type: 'manual-excalidraw-import',
        name: 'Imported',
        libraryId: 'library-1',
        itemId: 'item-1',
        importedAt: null,
        formatVersion: '2',
      },
      importMetadata: {
        sourceIds: ['element-1', 2],
        groupIds: ['group-1'],
        elementTypes: ['rectangle'],
        textContent: 'Label',
      },
      richShapeDefaults: {
        shapeFamily: 'library',
        shapeKind: 'excalidraw-library-item',
        style: { line: { endArrowhead: 'triangle', width: 4 } },
        text: { content: 'Label', fontSize: 22 },
        rough: { enabled: true, seed: 9, roughness: 2 },
      },
    });

    expect(definition).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({ type: 'manual-excalidraw-import' }),
        importMetadata: expect.objectContaining({
          sourceIds: ['element-1'],
          groupIds: ['group-1'],
          textContent: 'Label',
        }),
        richShapeDefaults: expect.objectContaining({
          shapeFamily: 'library',
          shapeKind: 'excalidraw-library-item',
          style: expect.objectContaining({
            line: expect.objectContaining({ endArrowhead: 'triangle', width: 4 }),
          }),
          text: expect.objectContaining({ content: 'Label', fontSize: 22 }),
          rough: expect.objectContaining({ enabled: true, seed: 9, roughness: 2 }),
        }),
      })
    );
  });
}

function registerCustomShapeDocumentTests() {
  it('preserves valid embedded geometry on rich shape document objects', () => {
    const shape = createDefaultRichShapeObject({ geometry });
    shape.rough = { ...shape.rough, fillTransparency: 0.4 };
    delete (shape.rough as { fillColor?: string }).fillColor;
    const normalized = normalizeEditorRichShapeObject(shape);

    expect(normalized.geometry).toEqual(geometry);
    expect(isEditorRichShapeDocumentObject(normalized)).toBe(true);
    expect(
      isEditorRichShapeDocumentObject({
        ...normalized,
        rough: { ...normalized.rough, fillTransparency: '0.4' },
      })
    ).toBe(false);
    expect(isEditorRichShapeDocumentObject({ ...normalized, geometry: { type: 'path' } })).toBe(
      false
    );
    expect(normalizeEditorRichShapeObject({ shapeKind: 'custom-badge' }).geometry).toBeUndefined();
  });

  it('normalizes non-object rich shape input with default custom shape values', () => {
    const normalized = normalizeEditorRichShapeObject(null);

    expect(normalized.shapeKind).toBe('custom-shape');
    expect(normalized.shapeFamily).toBe('custom');
    expect(normalized.geometry).toBeUndefined();
  });
}
