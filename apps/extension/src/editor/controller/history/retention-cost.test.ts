import { expect, it } from 'vitest';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { createEditorHistoryCostIndex } from './retention-cost';

function referenceCost(
  values: readonly string[],
  resources: ReadonlyMap<string, ReadonlySet<string>>,
  bytes: ReadonlyMap<string, number>
) {
  let metadata = 0;
  let minimum = Number.POSITIVE_INFINITY;
  const retained = new Set<string>();
  for (const value of values) {
    const size = new TextEncoder().encode(value).byteLength;
    metadata += size;
    let baseline = size;
    for (const token of resources.get(value) ?? []) {
      baseline += bytes.get(token) ?? 0;
      retained.add(token);
    }
    minimum = Math.min(minimum, baseline);
  }
  let total = metadata;
  for (const token of retained) total += bytes.get(token) ?? 0;
  return values.length ? total - minimum : 0;
}

it('matches distinct UTF8 resource costs while ranges grow, shrink and reject either side', () => {
  const bytes = new Map([
    ['shared', 20_000],
    ['a', 7],
    ['b', 31],
    ['c', 113],
  ]);
  const index = createEditorHistoryCostIndex(bytes);
  const resources = new Map<string, ReadonlySet<string>>();
  const values = Array.from({ length: 12 }, (_, i) => {
    const value = `界-${i}`;
    const tokens = new Set(['shared']);
    if (i % 2) tokens.add('a');
    if (i % 3) tokens.add('b');
    if (i % 5) tokens.add('c');
    resources.set(value, tokens);
    index.register(value, tokens);
    return value;
  });
  index.measure(values);
  for (let cursor = 0; cursor < values.length; cursor++) {
    const measure = index.measureWindow(values, cursor);
    for (let start = 0; start <= cursor; start++) {
      for (let end = values.length - 1; end >= cursor; end--) {
        expect(measure(start, end)).toBe(
          referenceCost(values.slice(start, end + 1), resources, bytes)
        );
      }
    }
  }
});

it('releases only resources absent from every retained occurrence, including repeated snapshots', () => {
  const index = createEditorHistoryCostIndex(
    new Map([
      ['source', 100],
      ['old', 20],
      ['new', 30],
    ])
  );
  index.register('first', new Set(['source', 'old']));
  index.register('second', new Set(['source', 'new']));
  index.measure(['first', 'second', 'first']);
  expect(index.retain(['second', 'first'])).toEqual({ snapshots: [], tokens: [] });
  expect(index.retain(['second'])).toEqual({ snapshots: ['first'], tokens: ['old'] });
  index.register('third', new Set(['new']));
  index.measure(['second', 'third']);
  expect(index.retain(['third'])).toEqual({ snapshots: ['second'], tokens: ['source'] });
});

it('preserves the existing nearest-cursor retention through push, branch, replace and reset', () => {
  const bytes = new Map([
    ['source', 50_000],
    ['a', 40],
    ['b', 90],
    ['c', 160],
  ]);
  const resources = new Map<string, ReadonlySet<string>>();
  const index = createEditorHistoryCostIndex(bytes);
  function register(value: string, step: number) {
    const tokens = new Set(['source']);
    if (step % 2) tokens.add('a');
    if (step % 3) tokens.add('b');
    if (step % 5) tokens.add('c');
    resources.set(value, tokens);
    index.register(value, tokens);
  }
  register('initial', 0);
  const limits = { limit: 7, maxBytes: 220 };
  const expected = new SnapshotHistory<string>('initial', {
    ...limits,
    measureBytes: (values) => referenceCost(values, resources, bytes),
  });
  const actual = new SnapshotHistory<string>('initial', {
    ...limits,
    measureBytes: index.measure,
    measureWindowBytes: index.measureWindow,
  });
  for (let step = 1; step <= 120; step++) {
    if (step % 17 === 0) {
      const value = `reset-${step}`;
      register(value, step);
      expected.reset(value);
      actual.reset(value);
    } else if (step % 7 === 0) {
      expect(actual.undo()).toEqual(expected.undo());
    } else if (step % 11 === 0) {
      expect(actual.redo()).toEqual(expected.redo());
    } else {
      const value = `value-${step}`;
      register(value, step);
      if (step % 5 === 0) {
        expect(actual.replaceCurrent(actual.getRevision(), value)).toEqual(
          expected.replaceCurrent(expected.getRevision(), value)
        );
      } else expect(actual.push(value)).toEqual(expected.push(value));
    }
    index.retain(actual.getSnapshots());
    expect(actual.getSnapshots()).toEqual(expected.getSnapshots());
    expect(actual.getState()).toEqual(expected.getState());
  }
});

it('keeps project rasters outside metadata while bounding older unique raster versions', () => {
  const mib = 1024 * 1024;
  const bytes = new Map([
    ['source', 100 * mib],
    ['import', 60 * mib],
    ['revision', 50 * mib],
    ['later', 40 * mib],
  ]);
  const kinds = new Map<string, 'image' | 'json'>([...bytes.keys()].map((id) => [id, 'image']));
  const index = createEditorHistoryCostIndex(bytes, {
    kindsByToken: kinds,
    maxBytes: 32 * mib,
    maxAssetBytes: 64 * mib,
  });
  index.register('a', new Set(['source']));
  index.register('bb', new Set(['source', 'import']));
  index.register('ccc', new Set(['source', 'revision']));
  index.register('dddd', new Set(['source', 'later']));
  expect(index.measure(['a', 'bb'])).toBe(2);
  expect(index.measure(['a', 'bb', 'ccc'])).toBe(5);
  expect(index.measure(['a', 'bb', 'ccc', 'dddd'])).toBe(32 * mib + 1);
  expect(index.measure(['ccc', 'dddd'])).toBe(4);
});

it('matches independent raster and structural limits for every changing cursor window', () => {
  const bytes = new Map([
    ['source', 100_000],
    ['a', 700],
    ['b', 1100],
    ['c', 1900],
    ['drawing', 300],
  ]);
  const kinds = new Map<string, 'image' | 'json'>(
    [...bytes.keys()].map((id) => [id, id === 'drawing' ? 'json' : 'image'])
  );
  const budget = { kindsByToken: kinds, maxBytes: 2000, maxAssetBytes: 2500 };
  const index = createEditorHistoryCostIndex(bytes, budget);
  const resources = new Map<string, ReadonlySet<string>>();
  const favicons = new Map<string, string>();
  const structural = new Map([...bytes].filter(([id]) => kinds.get(id) === 'json'));
  const values = Array.from({ length: 12 }, (_, i) => {
    const value = `state-${i}`;
    const tokens = new Set(['source']);
    if (i % 2) tokens.add('a');
    if (i % 3) tokens.add('b');
    if (i % 5) tokens.add('c');
    if (i % 4) tokens.add('drawing');
    if ((i < 6 || i > 8) && i % 3) favicons.set(value, 'b');
    resources.set(value, tokens);
    index.register(value, tokens, favicons.get(value));
    return value;
  });
  function reference(range: readonly string[]) {
    const rasters = new Set(
      range.flatMap((value) => [...resources.get(value)!].filter((id) => kinds.get(id) === 'image'))
    );
    const newestValue = range[range.length - 1]!;
    const newest = resources.get(newestValue)!;
    const favicon = favicons.get(newestValue);
    const extra = [...rasters]
      .filter(
        (id) =>
          !newest.has(id) ||
          (id === favicon &&
            range
              .slice(0, -1)
              .some((value) => favicons.get(value) !== id && resources.get(value)!.has(id)))
      )
      .reduce((sum, id) => sum + bytes.get(id)!, 0);
    return extra > budget.maxAssetBytes
      ? budget.maxBytes + 1
      : referenceCost(range, resources, structural);
  }
  expect(index.measure(values)).toBe(reference(values));
  for (let cursor = 0; cursor < values.length; cursor++) {
    const measure = index.measureWindow(values, cursor);
    for (let start = 0; start <= cursor; start++)
      for (let end = values.length - 1; end >= cursor; end--)
        expect(measure(start, end)).toBe(reference(values.slice(start, end + 1)));
  }
});
