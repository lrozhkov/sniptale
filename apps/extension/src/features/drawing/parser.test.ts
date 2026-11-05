import { createDefaultSimplifySettings } from '../simplify/settings';
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
  { version: 3, objects: [] },
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

const simplifyObject = {
  id: 'simplify',
  kind: 'simplify' as const,
  bounds: { x: 10, y: 20, width: 100, height: 50 },
  settings: {
    ...createDefaultSimplifySettings(),
    automatic: false,
    content: 'all' as const,
    manualKind: 'image' as const,
  },
};
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const raster = { dataUrl: png, width: 1, height: 1 };
it('admits V2 simplify drafts and retains independent source/result settings through roundtrip', () => {
  expect(parseDrawingDocument({ version: 1, objects: [simplifyObject] })).toBeNull();
  expect(parseDrawingDocument({ version: 2, objects: [simplifyObject] })).toEqual({
    version: 2,
    objects: [simplifyObject],
  });
  const raw = {
    version: 2,
    objects: [
      {
        ...simplifyObject,
        rotation: 25,
        result: raster,
        source: { ...raster, bounds: { x: -10, y: -20, width: 500, height: 300 } },
      },
    ],
  };
  const original = structuredClone(raw);
  const parsed = parseDrawingDocument(raw);
  expect(parsed).toEqual(original);
  expect(parseDrawingDocument(JSON.parse(JSON.stringify(parsed)))).toEqual(original);
  expect(raw).toEqual(original);
  expect(parsed?.objects[0]).not.toBe(raw.objects[0]);
});
it.each([
  { ...raster, width: 0 },
  { ...raster, height: 1.5 },
  { ...raster, width: 16_777_217 },
  { ...raster, width: 2 },
  { ...raster, dataUrl: 'https://example.test/source.png' },
  { ...raster, dataUrl: 'data:image/jpeg;base64,QUJDRA==' },
  { ...raster, dataUrl: 'data:image/png;base64,QUJDRA==' },
  { ...raster, dataUrl: 'data:image/png;base64,invalid!' },
  null,
])('refuses invalid simplify result or source snapshots %j', (bad) => {
  expect(
    parseDrawingDocument({ version: 2, objects: [{ ...simplifyObject, result: bad }] })
  ).toBeNull();
  expect(
    parseDrawingDocument({
      version: 2,
      objects: [{ ...simplifyObject, source: bad && { ...bad, bounds: simplifyObject.bounds } }],
    })
  ).toBeNull();
});
it('refuses invalid simplify settings and source geometry without mutating input', () => {
  for (const extra of [
    { settings: { ...simplifyObject.settings, sensitivity: 100 } },
    { source: { ...raster, bounds: { ...simplifyObject.bounds, width: -1 } } },
  ]) {
    const raw = { version: 2, objects: [{ ...simplifyObject, ...extra }] };
    const original = structuredClone(raw);
    expect(parseDrawingDocument(raw)).toBeNull();
    expect(raw).toEqual(original);
  }
});

// Admission reads PNG dimensions without decoding a bitmap. Distinct header fixtures
// exercise pixel budgets without allocating full 16-megapixel decoded planes.
function fullPlane(tag: number) {
  const bytes = Uint8Array.from(atob(png.slice(png.indexOf(',') + 1)), (char) =>
    char.charCodeAt(0)
  );
  const header = new DataView(bytes.buffer);
  header.setUint32(16, 4096);
  header.setUint32(20, 4096);
  bytes[bytes.length - 1] = tag;
  return {
    dataUrl: `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`,
    width: 4096,
    height: 4096,
  };
}

it('charges a shared retained PNG once while preserving each source coordinate mapping', () => {
  const shared = fullPlane(1);
  const raw = {
    version: 2,
    objects: Array.from({ length: 4 }, (_, index) => ({
      ...simplifyObject,
      id: `shared-${index}`,
      result: raster,
      source: { ...shared, bounds: { x: index * 10, y: 0, width: 4096, height: 4096 } },
    })),
  };
  const original = structuredClone(raw);
  const parsed = parseDrawingDocument(raw);
  expect(parsed).toEqual(original);
  expect(raw).toEqual(original);
  const first = parsed?.objects[0];
  const second = parsed?.objects[1];
  if (first?.kind !== 'simplify' || second?.kind !== 'simplify')
    throw new Error('Expected simplify layers');
  expect(first.source).not.toBe(second.source);
  expect(first.source?.bounds).not.toBe(second.source?.bounds);
  expect(first.source?.bounds.x).toBe(0);
  expect(second.source?.bounds.x).toBe(10);
});

it('charges distinct retained PNGs against the unchanged aggregate pixel budget', () => {
  const layers = [1, 2, 3].map((tag) => ({
    ...simplifyObject,
    id: `unique-${tag}`,
    source: { ...fullPlane(tag), bounds: { x: 0, y: 0, width: 4096, height: 4096 } },
  }));
  expect(parseDrawingDocument({ version: 2, objects: layers.slice(0, 2) })).toEqual({
    version: 2,
    objects: layers.slice(0, 2),
  });
  expect(parseDrawingDocument({ version: 2, objects: layers })).toBeNull();
});

it('rejects mismatched declared dimensions on a cached PNG in the same document', () => {
  const shared = fullPlane(1);
  expect(
    parseDrawingDocument({
      version: 2,
      objects: [
        { ...simplifyObject, id: 'original', source: { ...shared, bounds: simplifyObject.bounds } },
        { ...simplifyObject, id: 'mismatch', result: { ...shared, width: 4095 } },
      ],
    })
  ).toBeNull();
});

it.each([true, false])(
  'retains simplify sourceDirty=%s through document roundtrip',
  (sourceDirty) => {
    const raw = {
      version: 2,
      objects: [
        {
          ...simplifyObject,
          result: raster,
          source: { ...raster, bounds: simplifyObject.bounds },
          sourceDirty,
        },
      ],
    };
    const original = structuredClone(raw);
    const parsed = parseDrawingDocument(raw);
    expect(parsed).toEqual(original);
    expect(parseDrawingDocument(JSON.parse(JSON.stringify(parsed)))).toEqual(original);
    expect(raw).toEqual(original);
  }
);

it.each([null, 0, 1, 'true', {}, []])(
  'refuses nonboolean simplify sourceDirty %j',
  (sourceDirty) => {
    expect(
      parseDrawingDocument({ version: 2, objects: [{ ...simplifyObject, sourceDirty }] })
    ).toBeNull();
  }
);

it.each(['performance4', 'engine-2.1_release', 'v'.repeat(128)])(
  'preserves bounded engine provenance %s',
  (engineVersion) => {
    const raw = { version: 2, objects: [{ ...simplifyObject, result: raster, engineVersion }] };
    const parsed = parseDrawingDocument(raw);
    expect(parsed).toEqual(raw);
    expect(parseDrawingDocument(JSON.parse(JSON.stringify(parsed)))).toEqual(raw);
  }
);
it.each(['', ' ', 'engine version', 'v'.repeat(129), 'engine/../next', null, 4, {}])(
  'refuses malformed engine provenance %j',
  (engineVersion) => {
    expect(
      parseDrawingDocument({ version: 2, objects: [{ ...simplifyObject, engineVersion }] })
    ).toBeNull();
  }
);
