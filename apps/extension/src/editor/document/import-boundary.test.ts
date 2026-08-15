import { describe, expect, it } from 'vitest';
import type { DrawingObject } from '../../features/drawing/public';
import { assertValidEditorDrawingCanvasJson, parseEditorDrawingMetadata } from './import-boundary';

const objects: readonly DrawingObject[] = [
  { id: 'p', kind: 'pencil', color: '#111', width: 4, samples: [{ x: 1, y: 2, t: 3 }] },
  {
    id: 'm',
    kind: 'marker',
    color: '#ff0',
    opacity: 0.3,
    width: 28,
    samples: [{ x: 2, y: 3, t: 4 }],
  },
  {
    id: 's',
    kind: 'rectangle',
    bounds: { x: 1, y: 2, width: 30, height: 20 },
    color: '#f00',
    fillColor: null,
    width: 4,
  },
  {
    id: 'a',
    kind: 'arrow',
    start: { x: 0, y: 0 },
    end: { x: 40, y: 20 },
    color: '#f00',
    dynamicWidth: true,
    width: 18,
  },
  { id: 'b', kind: 'blur', bounds: { x: 1, y: 2, width: 30, height: 20 } },
  {
    id: 't',
    kind: 'text',
    bounds: { x: 1, y: 2, width: 90, height: 30 },
    text: 'Hello',
    color: '#111',
    backgroundColor: null,
    fontFamily: 'handwritten',
    fontSize: 24,
  },
];

function fabricObject(object: DrawingObject) {
  const type = ['rectangle', 'ellipse', 'triangle', 'parallelogram'].includes(object.kind)
    ? 'shape'
    : object.kind;
  return {
    sniptaleId: object.id,
    sniptaleType: type,
    sniptaleDrawingJson: JSON.stringify({ version: 1, object }),
  };
}

describe('editor drawing import boundary', () => {
  it('accepts every current shared drawing kind and parses its metadata', () => {
    expect(() =>
      assertValidEditorDrawingCanvasJson(JSON.stringify({ objects: objects.map(fabricObject) }))
    ).not.toThrow();
    expect(parseEditorDrawingMetadata(fabricObject(objects[0]!).sniptaleDrawingJson)).toEqual(
      objects[0]
    );
  });

  it('accepts pointer timestamps beyond the coordinate ceiling', () => {
    const pencil = objects[0]!;
    if (pencil.kind !== 'pencil') throw new Error('Expected pencil fixture');
    const elapsedPencil = {
      ...pencil,
      samples: [
        { x: 1, y: 2, t: 131_073 },
        { x: 4, y: 6, t: 180_000.5 },
      ],
    } satisfies DrawingObject;

    expect(parseEditorDrawingMetadata(fabricObject(elapsedPencil).sniptaleDrawingJson)).toEqual(
      elapsedPencil
    );
    expect(() =>
      assertValidEditorDrawingCanvasJson(JSON.stringify({ objects: [fabricObject(elapsedPencil)] }))
    ).not.toThrow();
  });

  it.each([-1, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid drawing timestamp %s',
    (timestamp) => {
      const pencil = objects[0]!;
      if (pencil.kind !== 'pencil') throw new Error('Expected pencil fixture');
      expect(
        parseEditorDrawingMetadata(
          fabricObject({ ...pencil, samples: [{ x: 1, y: 2, t: timestamp }] }).sniptaleDrawingJson
        )
      ).toBeNull();
    }
  );

  it.each(['highlighter', 'line', 'callout', 'brush', 'eraser', 'fill'])(
    'rejects removed %s objects before Fabric hydration',
    (sniptaleType) => {
      expect(() =>
        assertValidEditorDrawingCanvasJson(JSON.stringify({ objects: [{ sniptaleType }] }))
      ).toThrow('Removed editor drawing object');
    }
  );

  it('rejects malformed, mismatched, and removed metadata', () => {
    const valid = fabricObject(objects[0]!);
    expect(() =>
      assertValidEditorDrawingCanvasJson(
        JSON.stringify({ objects: [{ ...valid, sniptaleId: 'other' }] })
      )
    ).toThrow('Mismatched');
    expect(() =>
      assertValidEditorDrawingCanvasJson(
        JSON.stringify({ objects: [{ ...valid, sniptaleDrawingJson: '{}' }] })
      )
    ).toThrow('Invalid editor drawing metadata');
    expect(() =>
      assertValidEditorDrawingCanvasJson(
        JSON.stringify({ objects: [{ sniptaleType: 'image', sniptaleBrushWidth: 10 }] })
      )
    ).toThrow('Removed editor drawing object');
  });

  it.each([
    { type: 'Group', objects: [{ sniptaleType: 'line' }] },
    { type: 'Rect', clipPath: { sniptaleTextCalloutMode: 'legacy' } },
    { type: 'Group', objects: [{ sniptaleType: 'pencil', sniptaleDrawingJson: '{}' }] },
    { type: 'Rect', clipPath: { sniptaleType: 'brush' } },
  ])('rejects removed or malformed drawing metadata throughout the Fabric tree', (object) => {
    expect(() =>
      assertValidEditorDrawingCanvasJson(JSON.stringify({ objects: [object] }))
    ).toThrow();
  });

  it('accepts current drawing metadata inside a Fabric group and clip path', () => {
    expect(() =>
      assertValidEditorDrawingCanvasJson(
        JSON.stringify({
          objects: [
            {
              type: 'Group',
              objects: [fabricObject(objects[0]!)],
              clipPath: fabricObject(objects[2]!),
            },
          ],
        })
      )
    ).not.toThrow();
  });

  it('enforces one aggregate Fabric node budget across all root objects', () => {
    const atLimit = Array.from({ length: 20_000 }, () => ({ type: 'Rect' }));
    expect(() =>
      assertValidEditorDrawingCanvasJson(JSON.stringify({ objects: atLimit }))
    ).not.toThrow();
    expect(() =>
      assertValidEditorDrawingCanvasJson(
        JSON.stringify({ objects: [...atLimit, { type: 'Rect' }] })
      )
    ).toThrow('Invalid editor canvas object tree');
  });

  it('accepts the depth limit and rejects the next nested Fabric level', () => {
    const nested = (depth: number) => {
      let object: Record<string, unknown> = { type: 'Rect' };
      for (let index = 0; index < depth; index += 1) {
        object = { type: 'Group', objects: [object] };
      }
      return object;
    };

    expect(() =>
      assertValidEditorDrawingCanvasJson(JSON.stringify({ objects: [nested(40)] }))
    ).not.toThrow();
    expect(() =>
      assertValidEditorDrawingCanvasJson(JSON.stringify({ objects: [nested(41)] }))
    ).toThrow('Invalid editor canvas object tree');
  });
});
