import { expect, it } from 'vitest';
import { parseDrawingDocument } from './parser';
import type { DrawingObject } from './model';

const objects: DrawingObject[] = [
  {
    id: 'pencil',
    kind: 'pencil',
    samples: [{ x: -5, y: 1000000, t: 3 }],
    color: '#f97316',
    width: 4,
    rotation: 20,
  },
  {
    id: 'marker',
    kind: 'marker',
    samples: [{ x: 1, y: 2, t: 3 }],
    color: '#11223380',
    width: 28,
    opacity: 0.3,
  },
  ...(['rectangle', 'ellipse', 'triangle', 'parallelogram'] as const).map((kind) => ({
    id: kind,
    kind,
    bounds: { x: 1, y: 2, width: 20, height: 30 },
    color: '#abcdef',
    fillColor: 'transparent',
    skewX: 12,
    width: 4,
    rotation: 30,
  })),
  {
    id: 'arrow',
    kind: 'arrow',
    start: { x: -1, y: 2 },
    end: { x: 5, y: 6 },
    bendPoints: [{ x: 2, y: 3 }],
    design: 'freehand',
    color: 'rgba(10, 20, 30, 0.5)',
    dynamicWidth: true,
    width: 18,
  },
  {
    id: 'blur',
    kind: 'blur',
    bounds: { x: 1, y: 2, width: 0, height: 0 },
    amount: 0,
    rotation: -45,
  },
  {
    id: 'text',
    kind: 'text',
    bounds: { x: 1, y: 2, width: 30, height: 40 },
    text: '<b>plain text</b>',
    color: '#111111',
    backgroundColor: null,
    fontSize: 24,
    fontFamily: 'handwritten',
    rotation: 5,
  },
];
it('retains every current drawing kind and its optional authored fields without coordinate clipping', () => {
  expect(parseDrawingDocument({ version: 1, objects })).toEqual({ version: 1, objects });
  expect(parseDrawingDocument({ version: 1, objects: [] })).toEqual({ version: 1, objects: [] });
});
it('returns independent versions and does not copy unknown fields', () => {
  const raw = { version: 1, objects: structuredClone(objects), authority: 'foreign' };
  Object.assign(raw.objects[0]!, { payload: 'foreign' });
  const parsed = parseDrawingDocument(raw)!;
  expect(parsed).not.toHaveProperty('authority');
  expect(parsed.objects[0]).not.toHaveProperty('payload');
  expect(parsed.objects[0]).not.toBe(raw.objects[0]);
  const pencil = raw.objects[0]!;
  if (pencil.kind === 'pencil') {
    Object.assign(pencil.samples[0]!, { x: 200 });
    expect(parsed.objects[0]).toMatchObject({ samples: [{ x: -5, y: 1000000, t: 3 }] });
  }
});
it.each([
  null,
  [],
  {},
  { version: 2, objects: [] },
  { version: 1, objects: 'wrong' },
  { version: 1, objects: [{ ...objects[0], id: '' }] },
  { version: 1, objects: [objects[0], objects[0]] },
  { version: 1, objects: [{ ...objects[0], kind: 'future' }] },
  { version: 1, objects: [{ ...objects[0], width: 0 }] },
  { version: 1, objects: [{ ...objects[0], rotation: Infinity }] },
  { version: 1, objects: [{ ...objects[0], samples: [{ x: NaN, y: 2, t: 3 }] }] },
  { version: 1, objects: [{ ...objects[0], samples: [{ x: 1, y: 2, t: Infinity }] }] },
  { version: 1, objects: [{ ...objects[0], samples: [] }] },
  { version: 1, objects: [{ ...objects[1], opacity: 1.1 }] },
  { version: 1, objects: [{ ...objects[2], bounds: { x: 0, y: 0, width: -1, height: 1 } }] },
  { version: 1, objects: [{ ...objects[6], dynamicWidth: 'true' }] },
  { version: 1, objects: [{ ...objects[6], design: 'unknown' }] },
  {
    version: 1,
    objects: [{ ...objects[6], bendPoints: Array.from({ length: 129 }, () => ({ x: 0, y: 0 })) }],
  },
  { version: 1, objects: [{ ...objects[7], amount: -1 }] },
  { version: 1, objects: [{ ...objects[8], fontSize: 0 }] },
  { version: 1, objects: [{ ...objects[8], fontFamily: 'url(remote)' }] },
])('refuses malformed drawing input %j', (raw) => {
  expect(parseDrawingDocument(raw)).toBeNull();
});
it.each([
  'url(https://example.test/image)',
  'var(--page-color)',
  '#fff; color: red',
  'expression(1)',
])('refuses unsafe color %s in every paint role', (color) => {
  for (const raw of [
    { ...objects[0], color },
    { ...objects[2], fillColor: color },
    { ...objects[8], backgroundColor: color },
  ])
    expect(parseDrawingDocument({ version: 1, objects: [raw] })).toBeNull();
});
it('refuses resource overflow before returning an accepted document', () => {
  expect(
    parseDrawingDocument({
      version: 1,
      objects: Array.from({ length: 10001 }, (_, index) => ({
        ...objects[7],
        id: `blur-${index}`,
      })),
    })
  ).toBeNull();
  expect(
    parseDrawingDocument({ version: 1, objects: [{ ...objects[0], samples: new Array(1000001) }] })
  ).toBeNull();
  expect(
    parseDrawingDocument({ version: 1, objects: [{ ...objects[8], text: 'x'.repeat(1000001) }] })
  ).toBeNull();
});
