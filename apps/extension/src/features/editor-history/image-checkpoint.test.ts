import { expect, it, vi } from 'vitest';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_BROWSER_FRAME_STATE,
} from '../editor/document/constants';
import type { EditorDocument } from '../editor/document/types';
import {
  encodeEditorImageHistorySnapshot,
  decodeEditorImageHistorySnapshot,
  IMAGE_HISTORY_VALUE_TOKEN_PREFIX,
} from './image-snapshot';
import {
  parseEditorImageHistoryCheckpoint,
  type EditorImageHistoryCheckpoint,
  type EditorImageHistoryValue,
} from './image-checkpoint';
import type { EditorHistoryAction } from './action';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';

function fixture(
  steps = 2,
  browserFrame?: EditorDocument['browserFrame'],
  extraObject?: Record<string, unknown>
): EditorImageHistoryCheckpoint {
  const values: EditorImageHistoryValue[] = [];
  const ids = new Map<string, string>();
  const snapshots: string[] = [];
  const actions: (EditorHistoryAction | null)[] = [null];
  const base: EditorDocument = {
    version: 2,
    sourceImageData: 'data:image/png;base64,' + 'A'.repeat(8_000),
    sourceName: null,
    sourceWidth: 20,
    sourceHeight: 20,
    canvasWidth: 20,
    canvasHeight: 20,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 20,
    sourceDisplayHeight: 20,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    ...(browserFrame ? { browserFrame } : {}),
    canvasJson: '{}',
  };
  for (let index = 0; index <= steps; index++) {
    const document = {
      ...base,
      canvasJson: JSON.stringify({
        objects: [
          { type: 'image', sniptaleId: 'source', src: base.sourceImageData },
          { type: 'rect', sniptaleId: 'card', sniptaleLabel: 'Card', left: index },
          ...(extraObject ? [extraObject] : []),
        ],
      }),
    };
    snapshots.push(
      encodeEditorImageHistorySnapshot(
        document,
        {
          intern(value, kind) {
            const existing = ids.get(value);
            if (existing) return existing;
            const id = `${IMAGE_HISTORY_VALUE_TOKEN_PREFIX}${ids.size}`;
            ids.set(value, id);
            values.push({ id, kind, value });
            return id;
          },
        },
        new Set()
      )
    );
    if (index) actions.push({ operation: 'move', target: { id: 'card', name: 'Card' } });
  }
  return { version: 1, epoch: 'fixture', cursor: steps, values, snapshots, actions };
}

it('admits a detached graph without serializing its unchanged image in every state', () => {
  const input = fixture(20);
  const stringify = vi.spyOn(JSON, 'stringify');
  const admitted = parseEditorImageHistoryCheckpoint(input);
  expect(admitted?.checkpoint).toEqual(input);
  const lengths = stringify.mock.results
    .filter((result) => result.type === 'return' && typeof result.value === 'string')
    .map((result) => result.value.length);
  stringify.mockRestore();
  expect(Math.max(...lengths)).toBeLessThan(8_000);
  expect(admitted?.checkpoint).not.toBe(input);
  expect(admitted?.checkpoint.actions[1]).not.toBe(input.actions[1]);
  expect(admitted?.tokensBySnapshot).toHaveLength(21);
});

it.each([
  null,
  {},
  { version: 2 },
  { epoch: '' },
  { cursor: -1 },
  { cursor: 0.5 },
  { cursor: 30 },
  { snapshots: [] },
  { snapshots: [42] },
  { actions: [] },
  { actions: [{ operation: 'move', target: null }, null, null] },
  { unknownTrustFlag: true },
])('refuses invalid checkpoint envelopes or action descriptors: %j', (patch) => {
  const input = fixture();
  expect(
    parseEditorImageHistoryCheckpoint(
      patch === null || Object.keys(patch).length === 0 ? patch : { ...input, ...patch }
    )
  ).toBeNull();
});

it.each([
  null,
  { operation: 'futureTool', target: null },
  { operation: 'move', target: 'card' },
  { operation: 'move', target: { id: '', name: 'Card' } },
  { operation: 'move', target: { id: 'card', name: 42 } },
  { operation: 'move', target: { id: 'card', name: 'Card', trusted: true } },
  { operation: 'fill', target: null, color: { before: null } },
  { operation: 'fill', target: null, color: { before: 42, after: '#c759ed' } },
  { operation: 'fill', target: null, color: { before: null, after: false } },
  { operation: 'move', target: null, trusted: true },
])('rejects an invalid leaf action without another malformed field masking it: %j', (action) => {
  const input = fixture();
  expect(
    parseEditorImageHistoryCheckpoint({
      ...input,
      actions: input.actions.map((current, index) => (index === 1 ? action : current)),
    })
  ).toBeNull();
});

it('preserves exact paint values and detached target names without inferring color names', () => {
  const input = fixture();
  const action = {
    operation: 'fill',
    target: { id: 'card', name: 'Caption' },
    color: { before: '#000000', after: '#c759ed' },
  };
  const parsed = parseEditorImageHistoryCheckpoint({
    ...input,
    actions: [null, action, input.actions[2]],
  });
  expect(parsed?.checkpoint.actions[1]).toEqual(action);
  action.target.name = 'Mutation';
  expect(parsed?.checkpoint.actions[1]?.target?.name).toBe('Caption');
});

it('refuses missing, duplicate, orphan and wrongly typed immutable values', () => {
  const input = fixture();
  const unit = input.values[0]!;
  const variants = [
    input.values.slice(1),
    [...input.values, unit],
    [...input.values, { ...unit, id: IMAGE_HISTORY_VALUE_TOKEN_PREFIX + 'duplicate' }],
    [
      ...input.values,
      { id: IMAGE_HISTORY_VALUE_TOKEN_PREFIX + 'orphan', kind: 'json', value: '{"unused":true}' },
    ],
    input.values.map((value) => (value === unit ? { ...unit, kind: 'json' } : value)),
    input.values.map((value) =>
      value === unit ? { ...unit, value: 'data:text/html;base64,QUJDRA==' } : value
    ),
    input.values.map((value) => (value.kind === 'json' ? { ...value, value: 'not JSON' } : value)),
  ];
  for (const values of variants)
    expect(parseEditorImageHistoryCheckpoint({ ...input, values })).toBeNull();
});

it('rejects cyclic object references within a bounded traversal', () => {
  const input = fixture();
  const canvasUnit = input.values.find(
    (unit) => unit.kind === 'json' && unit.value.includes('"card"')
  )!;
  const values = input.values.map((unit) =>
    unit === canvasUnit
      ? { ...unit, value: JSON.stringify({ sniptaleId: 'card', objects: [unit.id] }) }
      : unit
  );
  expect(parseEditorImageHistoryCheckpoint({ ...input, values })).toBeNull();
});

it('refuses inline object versions that bypass the checkpoint pool contract', () => {
  const input = fixture(0);
  const metadata: unknown = JSON.parse(input.snapshots[0]!);
  if (!isPlainRecord(metadata)) throw new Error('Fixture document is invalid');
  const snapshot = JSON.stringify({
    ...metadata,
    sourceImageData: 'data:image/png;base64,abc',
    canvasJson: JSON.stringify({ objects: [{ type: 'rect', sniptaleId: 'unpooled', left: 10 }] }),
  });
  expect(
    parseEditorImageHistoryCheckpoint({
      ...input,
      cursor: 0,
      snapshots: [snapshot],
      values: [],
      actions: [null],
    })
  ).toBeNull();
});

it('retains SVG image sources once inside their shared JSON object version', () => {
  const svg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><text>' + 'Frame '.repeat(1500) + '</text></svg>')}`;
  const input = fixture(4, undefined, { type: 'image', sniptaleType: 'browser-frame', src: svg });
  expect(input.values.some((unit) => unit.kind === 'image' && unit.value === svg)).toBe(false);
  expect(
    input.values.filter((unit) => unit.kind === 'json' && unit.value.includes(svg))
  ).toHaveLength(1);
  expect(parseEditorImageHistoryCheckpoint(input)?.checkpoint).toEqual(input);
  const units = new Map(input.values.map((unit) => [unit.id, unit.value]));
  const decoded = decodeEditorImageHistorySnapshot(input.snapshots[0]!, (token) =>
    units.get(token)
  );
  expect(decoded).toMatchObject({ canvasJson: expect.stringContaining(svg) });
});

it('refuses an embedded large bitmap in an object version instead of expanding it for each state', () => {
  const input = fixture();
  const image = input.values.find((unit) => unit.kind === 'image')!;
  const object = input.values.find(
    (unit) => unit.kind === 'json' && unit.value.includes('"source"')
  )!;
  const values = input.values.map((unit) =>
    unit === object
      ? {
          ...unit,
          value: JSON.stringify({ type: 'image', sniptaleId: 'source', src: image.value }),
        }
      : unit
  );
  expect(parseEditorImageHistoryCheckpoint({ ...input, values })).toBeNull();
});

it('bounds object-list and metadata expansion before allocating every repeated version', () => {
  const input = fixture(0);
  const metadata: unknown = JSON.parse(input.snapshots[0]!);
  if (!isPlainRecord(metadata)) throw new Error('Fixture document is invalid');
  const object = input.values.find(
    (unit) => unit.kind === 'json' && unit.value.includes('"card"')
  )!;
  const snapshot = JSON.stringify({
    ...metadata,
    canvasJson: JSON.stringify({ objects: Array.from({ length: 20 }, () => object.id) }),
  });
  const values = new Map(input.values.map((unit) => [unit.id, unit.value]));
  const read = vi.fn((id: string) => values.get(id));
  expect(() =>
    decodeEditorImageHistorySnapshot(snapshot, read, {
      requirePooledObjects: true,
      bounds: { maxDepth: 64, maxNodes: 10 },
    })
  ).toThrow('object list');
  read.mockClear();
  expect(() =>
    decodeEditorImageHistorySnapshot(snapshot, read, {
      requirePooledObjects: true,
      bounds: { maxDepth: 64, maxNodes: 100, maxObjectCharacters: 200 },
    })
  ).toThrow('expanded metadata');
  expect(read.mock.calls.filter(([id]) => id === object.id).length).toBeLessThan(20);
});

it('retains current content outside the byte budget and rejects excess actions or extra history bytes', () => {
  expect(
    parseEditorImageHistoryCheckpoint(fixture(0), { maxActions: 0, maxBytes: 0 })
  ).not.toBeNull();
  expect(
    parseEditorImageHistoryCheckpoint(fixture(1), { maxActions: 0, maxBytes: 100_000 })
  ).toBeNull();
  expect(parseEditorImageHistoryCheckpoint(fixture(1), { maxActions: 2, maxBytes: 0 })).toBeNull();
});

it('admits a pooled normalized PNG favicon across the retained graph and rejects a malformed one', () => {
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';
  const favicon = 'data:image/png;base64,' + btoa(atob(png) + '\0'.repeat(7000));
  const checkpoint = fixture(20, {
    ...DEFAULT_BROWSER_FRAME_STATE,
    faviconEnabled: true,
    faviconDataUrl: favicon,
  });
  expect(checkpoint.values.some((unit) => unit.kind === 'image' && unit.value === favicon)).toBe(
    true
  );
  expect(parseEditorImageHistoryCheckpoint(checkpoint)?.checkpoint).toEqual(checkpoint);
  const invalid = fixture(2, {
    ...DEFAULT_BROWSER_FRAME_STATE,
    faviconEnabled: true,
    faviconDataUrl: 'data:image/png;base64,' + 'QUJD'.repeat(2300),
  });
  expect(parseEditorImageHistoryCheckpoint(invalid)).toBeNull();
});
