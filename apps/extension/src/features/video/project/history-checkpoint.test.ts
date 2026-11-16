import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from './factories/creation';
import { createVideoProjectCursorTrack } from './defaults';
import {
  applyVideoProjectHistoryChangeValues,
  createVideoProjectHistoryChange,
  type VideoProjectHistoryChange,
} from './history-change';
import { parseVideoProjectHistoryCheckpoint as admitCheckpoint } from './history-checkpoint';
import { isHydratableVideoProjectMetadata, type VideoProjectMetadata } from './validation';
import { EDITOR_HISTORY_LIMITS } from '../../editor-history/policy';

function parseVideoProjectHistoryCheckpoint(value: unknown, current: VideoProjectMetadata) {
  return admitCheckpoint(value, current, EDITOR_HISTORY_LIMITS);
}

function fixture() {
  const first = createEmptyVideoProject('First');
  const current = { ...first, name: 'Current' };
  const last = { ...current, name: 'Last' };
  const past = createVideoProjectHistoryChange(first, current)!;
  const future = createVideoProjectHistoryChange(last, current)!;
  return {
    first,
    current,
    last,
    checkpoint: { version: 1, projectId: current.id, past: [past], future: [future] },
  };
}

function field(key: string, value: unknown) {
  return { kind: 'record', fields: [[key, { kind: 'replace', value }]] };
}

it('roundtrips both inverse directions without retaining current content or changing its clock', () => {
  const { current, first, last, checkpoint } = fixture();
  const parsed = parseVideoProjectHistoryCheckpoint(
    JSON.parse(JSON.stringify(checkpoint)),
    current
  );
  expect(parsed).not.toBeNull();
  expect(applyVideoProjectHistoryChangeValues(current, parsed!.past[0]!)).toEqual(first);
  expect(applyVideoProjectHistoryChangeValues(current, parsed!.future[0]!)).toEqual(last);
  expect(parsed).not.toHaveProperty('current');
  expect(parsed!.past).toHaveLength(1);
  expect(parsed!.future).toHaveLength(1);
});

it('validates every intermediate state in the correct direction from the current head', () => {
  const { first, current, last, checkpoint } = fixture();
  const past = [
    createVideoProjectHistoryChange(first, current)!,
    createVideoProjectHistoryChange(current, last)!,
  ];
  expect(
    parseVideoProjectHistoryCheckpoint({ ...checkpoint, past, future: [] }, last)
  ).not.toBeNull();
  const invalidWidth = field('width', -1);
  expect(
    parseVideoProjectHistoryCheckpoint(
      { ...checkpoint, past: [createVideoProjectHistoryChange(first, current)!, invalidWidth] },
      current
    )
  ).toBeNull();
  expect(
    parseVideoProjectHistoryCheckpoint({ ...checkpoint, future: [invalidWidth] }, current)
  ).toBeNull();
  expect(current.width).toBe(first.width);
});

it('rejects metadata-invalid current heads and accepts an empty legacy-independent checkpoint', () => {
  const { current, checkpoint } = fixture();
  expect(parseVideoProjectHistoryCheckpoint(checkpoint, { ...current, width: -1 })).toBeNull();
  expect(parseVideoProjectHistoryCheckpoint(undefined, current)).toBeNull();
  expect(
    parseVideoProjectHistoryCheckpoint({ ...checkpoint, past: [], future: [] }, current)
  ).toEqual({ ...checkpoint, past: [], future: [] });
});

it.each([
  { version: 2 },
  { projectId: 'other-project' },
  { extra: true },
  { past: null },
  { future: {} },
  { past: [{ kind: 'replace', value: {} }] },
  { past: [field('id', 'other-project')] },
  { past: [field('createdAt', 99)] },
  { past: [field('updatedAt', 99)] },
  { past: [{ kind: 'record', fields: [] }] },
  { past: [{ kind: 'record', fields: [['name', { kind: 'remove', extra: true }]] }] },
  { past: [{ kind: 'record', fields: [['name', { kind: 'replace' }]] }] },
  {
    past: [
      {
        kind: 'record',
        fields: [
          ['name', { kind: 'remove' }],
          ['name', { kind: 'remove' }],
        ],
      },
    ],
  },
])('refuses malformed envelopes or root identity changes: %j', (patch) => {
  const { current, checkpoint } = fixture();
  expect(parseVideoProjectHistoryCheckpoint({ ...checkpoint, ...patch }, current)).toBeNull();
});

it.each([
  { kind: 'items', items: [[-1, { kind: 'remove' }]] },
  { kind: 'items', items: [[0.5, { kind: 'remove' }]] },
  { kind: 'items', items: [[Number.MAX_SAFE_INTEGER, { kind: 'replace', value: {} }]] },
  {
    kind: 'items',
    items: [
      [0, { kind: 'remove' }],
      [0, { kind: 'remove' }],
    ],
  },
  { kind: 'items', items: [] },
  { kind: 'splice', start: -1, deleteCount: 0, values: [] },
  { kind: 'splice', start: 999, deleteCount: 0, values: [] },
  { kind: 'splice', start: 0, deleteCount: 999, values: [] },
  { kind: 'splice', start: 0, deleteCount: 0, values: null },
])('refuses malformed or out-of-range array changes: %j', (change) => {
  const { current, checkpoint } = fixture();
  expect(
    parseVideoProjectHistoryCheckpoint(
      { ...checkpoint, past: [{ kind: 'record', fields: [['tracks', change]] }] },
      current
    )
  ).toBeNull();
});

it('roundtrips middle insertions, sparse values and optional absence over large cursor metadata', () => {
  const before = createEmptyVideoProject('Cursor');
  before.duration = 5;
  before.cursorTrack = {
    ...createVideoProjectCursorTrack(),
    samples: Array.from({ length: 4999 }, (_, index) => ({
      id: `cursor-${index}`,
      time: index / 1000,
      x: 0.4,
      y: 0.4,
      visible: true,
    })),
  };
  const sparse = structuredClone(before);
  sparse.cursorTrack!.samples[2500]!.x = 0.6;
  const insertion = structuredClone(sparse);
  insertion.cursorTrack!.samples.splice(2500, 0, {
    id: 'inserted',
    time: 2.5,
    x: 0.2,
    y: 0.3,
    visible: true,
  });
  expect(isHydratableVideoProjectMetadata(sparse), 'current cursor fixture validity').toBe(true);
  expect(isHydratableVideoProjectMetadata(insertion), 'future cursor fixture validity').toBe(true);
  const change = createVideoProjectHistoryChange(before, sparse)!;
  const insert = createVideoProjectHistoryChange(insertion, sparse)!;
  const checkpoint = { version: 1, projectId: sparse.id, past: [change], future: [insert] };
  expect(JSON.stringify(checkpoint).length).toBeLessThan(1024);
  const parsed = parseVideoProjectHistoryCheckpoint(
    JSON.parse(JSON.stringify(checkpoint)),
    sparse
  )!;
  expect(parsed).not.toBeNull();
  expect(applyVideoProjectHistoryChangeValues(sparse, parsed.past[0]!)).toEqual(before);
  expect(applyVideoProjectHistoryChangeValues(sparse, parsed.future[0]!)).toEqual(insertion);
  const optional = { ...before, version: 36 as const, watermarkEnabled: false as const };
  const remove = createVideoProjectHistoryChange(before, optional)!;
  const removed = applyVideoProjectHistoryChangeValues(optional, remove);
  expect(removed).not.toHaveProperty('watermarkEnabled');
});

it('checks the combined action budget and counts UTF-8 payload bytes', () => {
  const { current, checkpoint } = fixture();
  const full = Array.from({ length: EDITOR_HISTORY_LIMITS.maxActions }, () => checkpoint.past[0]);
  expect(parseVideoProjectHistoryCheckpoint({ ...checkpoint, past: full }, current)).toBeNull();
  const large = field('name', '雪'.repeat(Math.ceil(EDITOR_HISTORY_LIMITS.maxBytes / 3)));
  expect(parseVideoProjectHistoryCheckpoint({ ...checkpoint, past: [large] }, current)).toBeNull();
});

it.each([new Blob(['immutable bytes']), new Date(), undefined, Infinity, NaN, () => 1])(
  'rejects non-JSON inverse values without changing current content: %s',
  (value) => {
    const { current, checkpoint } = fixture();
    const before = structuredClone(current);
    expect(
      parseVideoProjectHistoryCheckpoint({ ...checkpoint, past: [field('name', value)] }, current)
    ).toBeNull();
    expect(current).toEqual(before);
  }
);

it('bounds depth, node count, cycles, sparse arrays and accessor reads', () => {
  const { current, checkpoint } = fixture();
  let deep: unknown = 'deep';
  for (let i = 0; i < 70; i++) deep = { nested: deep };
  const cyclic: { self?: object } = {};
  cyclic.self = cyclic;
  const getter = vi.fn(() => 'read');
  const accessor = Object.defineProperty({}, 'name', { get: getter, enumerable: true });
  for (const value of [
    deep,
    cyclic,
    Array.from({ length: 100_001 }, () => 0),
    new Array(2),
    accessor,
  ])
    expect(
      parseVideoProjectHistoryCheckpoint({ ...checkpoint, past: [field('name', value)] }, current)
    ).toBeNull();
  expect(getter).not.toHaveBeenCalled();
});

it('owns frozen admitted changes and keeps prototype-named keys as data', () => {
  const { current, checkpoint } = fixture();
  const withOwnData = { ...checkpoint, past: [field('__proto__', { safe: true })] };
  const parsed = parseVideoProjectHistoryCheckpoint(withOwnData, current)!;
  expect(parsed).not.toBeNull();
  withOwnData.past[0]!.fields.length = 0;
  const restored = applyVideoProjectHistoryChangeValues(current, parsed.past[0]!);
  expect(Object.getPrototypeOf(restored)).toBe(Object.prototype);
  expect(Object.hasOwn(restored, '__proto__')).toBe(true);
  expect(Object.isFrozen(parsed)).toBe(true);
  expect(Object.isFrozen(parsed.past[0])).toBe(true);
  expect(Object.isFrozen(parsed.past)).toBe(true);
  expect(Object.getPrototypeOf(current)).toBe(Object.prototype);
});

it('keeps caller metadata detached when replay replaces a retained branch', () => {
  const { current, checkpoint } = fixture();
  const originalTracks = current.tracks;
  const change: VideoProjectHistoryChange = {
    kind: 'record',
    fields: [['tracks', { kind: 'replace', value: structuredClone(originalTracks) }]],
  };
  const parsed = parseVideoProjectHistoryCheckpoint({ ...checkpoint, past: [change] }, current)!;
  const restored = applyVideoProjectHistoryChangeValues(current, parsed.past[0]!);
  restored.tracks[0]!.name = 'Edited after restore';
  expect(current.tracks).toBe(originalTracks);
  expect(current.tracks[0]!.name).not.toBe('Edited after restore');
  expect(applyVideoProjectHistoryChangeValues(current, parsed.past[0]!).tracks).toEqual(
    originalTracks
  );
});

it('replays past from newest to oldest and future from nearest to farthest', () => {
  const base = createEmptyVideoProject('Ordered history');
  base.duration = 5;
  const sample = (index: number) => ({
    id: `point-${index}`,
    time: index / 10,
    x: 0.4,
    y: 0.4,
    visible: true,
  });
  const first = {
    ...base,
    cursorTrack: { ...createVideoProjectCursorTrack(), samples: [sample(0)] },
  };
  const current = {
    ...first,
    cursorTrack: { ...first.cursorTrack, samples: [sample(0), sample(1)] },
  };
  const last = {
    ...current,
    cursorTrack: { ...current.cursorTrack, samples: [sample(0), sample(1), sample(2)] },
  };
  const past = [
    createVideoProjectHistoryChange(first, current)!,
    createVideoProjectHistoryChange(current, last)!,
  ];
  const future = [
    createVideoProjectHistoryChange(current, first)!,
    createVideoProjectHistoryChange(last, current)!,
  ];
  const checkpoint = { version: 1, projectId: base.id, past, future: [] };
  expect(parseVideoProjectHistoryCheckpoint(checkpoint, last)).not.toBeNull();
  expect(
    parseVideoProjectHistoryCheckpoint({ ...checkpoint, past: [...past].reverse() }, last)
  ).toBeNull();
  expect(
    parseVideoProjectHistoryCheckpoint({ ...checkpoint, past: [], future }, first)
  ).not.toBeNull();
  expect(
    parseVideoProjectHistoryCheckpoint(
      { ...checkpoint, past: [], future: [...future].reverse() },
      first
    )
  ).toBeNull();
});
