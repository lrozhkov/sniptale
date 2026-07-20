// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { createRichShapeObject, exportRichShapeDocumentObject } from './object';

describe('rich-shape object owner', () => {
  it('returns null when neither fallback, embedded, nor catalog geometry exists', () => {
    expect(
      createRichShapeObject(
        createDefaultRichShapeObject({
          shapeFamily: 'custom',
          shapeKind: 'unknown-rich-shape',
          source: {
            formatVersion: null,
            importedAt: null,
            itemId: null,
            libraryId: null,
            name: null,
            type: 'custom',
          },
        })
      )
    ).toBeNull();
  });

  it('creates rich shape Fabric groups with metadata and exportable document state', () => {
    const object = createRichShapeObject(
      createDefaultRichShapeObject({
        frame: { height: 30, left: 10, top: 20, width: 40 },
        id: 'shape-1',
        shapeKind: 'rectangle',
      }),
      undefined,
      'Rectangle 1'
    );

    expect(object?.sniptaleType).toBe('rich-shape');
    expect(object?.sniptaleLabel).toBe('Rectangle 1');
    expect(exportRichShapeDocumentObject(object!).frame).toEqual({
      height: 30,
      left: 10,
      top: 20,
      width: 40,
    });
  });
});
