import { expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/factories';
import { createScenarioProjectEntry } from './projects/entry';
import { parseScenarioProjectEntry } from './read-guards';
import { scenarioStorageHead, scenarioStorageRows } from './storage-format';
import { encodeScenarioUnitStorage, materializeScenarioUnitStorage } from './storage-units';

function entry() {
  const project = createGuideProject('Initial', 'project', 1);
  project.items = [
    createGuideStep('First step', 'step-a'),
    createGuideStep('Second step', 'step-b'),
  ];
  project.tour = createTourDocument('tour');
  project.tour.slides = [createTourImageSlide('slide-a'), createTourImageSlide('slide-b')];
  const first = createScenarioProjectEntry({ existing: undefined, project, updatedAt: 2 });
  return createScenarioProjectEntry({
    existing: first,
    project: { ...first.project, name: 'Current' },
    updatedAt: 3,
  });
}

it.each(['guide', 'tour'] as const)(
  'resolves a shared canonical %s unit once in one encode call and rechecks the next call',
  (kind) => {
    const source = entry();
    const physical = encodeScenarioUnitStorage(source, []);
    const project = structuredClone(source.project);
    project.updatedAt = 51;
    const historical = structuredClone(project);
    const current = {
      ...source,
      project,
      updatedAt: 51,
      workspaceRevision: 50,
      history: Array.from({ length: 50 }, (_, index) => ({
        revision: index,
        savedAt: index + 1,
        project: { ...historical, updatedAt: index + 1 },
      })),
    };
    const unitId = kind === 'guide' ? 'guide:step-a' : 'tour:slide-a';
    const stored = physical.units.find((row) => row.unitId === unitId);
    if (!stored) throw new Error('Missing stored unit');
    const keys = vi.spyOn(Object, 'keys');
    try {
      const next = encodeScenarioUnitStorage(current, physical.units);
      // The current editable object and shared historical object are independently detached.
      expect(keys.mock.calls.filter(([value]) => value === stored.value)).toHaveLength(2);
      keys.mockRestore();
      expect(
        parseScenarioProjectEntry(materializeScenarioUnitStorage(next.head, next.rows, next.units))
      ).toEqual(current);
      if (kind === 'guide') project.items[0]!.title = 'Changed next call';
      else project.tour!.slides[0]!.title = 'Changed next call';
      const changed = encodeScenarioUnitStorage(current, next.units);
      expect(
        changed.units.find((row) => row.unitId === unitId && row.revision === 2)?.value
      ).toMatchObject({ title: 'Changed next call' });
      expect(
        parseScenarioProjectEntry(
          materializeScenarioUnitStorage(changed.head, changed.rows, changed.units)
        )
      ).toEqual(current);
    } finally {
      keys.mockRestore();
    }
  }
);

it('shares unchanged Guide and Tour units across versions with exact logical content', () => {
  const logical = entry();
  const physical = encodeScenarioUnitStorage(logical, []);
  expect(physical.units).toHaveLength(4);
  expect(physical.head).toMatchObject({ historyFormatVersion: 2, savedVersionRevisions: [1] });
  expect(physical.head.project.items).toEqual([
    { unitId: 'guide:step-a', revision: 1 },
    { unitId: 'guide:step-b', revision: 1 },
  ]);
  expect(JSON.stringify(physical.head)).not.toContain('First step');
  expect(JSON.stringify(physical.rows)).not.toContain('First step');
  const materialized = materializeScenarioUnitStorage(
    physical.head,
    physical.rows,
    physical.units.toReversed()
  );
  expect(materialized).toEqual(logical);
  expect(parseScenarioProjectEntry(materialized)).toEqual(logical);
});

it('allocates only changed units, including same-revision replacement', () => {
  const previous = entry();
  const physical = encodeScenarioUnitStorage(previous, []);
  const changed = structuredClone(previous);
  changed.project.items[1]!.title = 'Changed step';
  const next = encodeScenarioUnitStorage(changed, physical.units);
  expect(next.units.filter((row) => row.unitId === 'guide:step-b')).toHaveLength(2);
  expect(next.head.project.items[1]).toEqual({ unitId: 'guide:step-b', revision: 2 });
  expect(physical.units.find((row) => row.unitId === 'guide:step-b')?.value).toMatchObject({
    title: 'Second step',
  });
  const materialized = materializeScenarioUnitStorage(next.head, next.rows, next.units);
  expect(parseScenarioProjectEntry(materialized)).toEqual(changed);
  const replacement = structuredClone(changed);
  replacement.project.items[1]!.title = 'Replacement step';
  const restored = encodeScenarioUnitStorage(replacement, next.units);
  expect(restored.head.project.items[1]).toEqual({ unitId: 'guide:step-b', revision: 3 });
  expect(
    parseScenarioProjectEntry(
      materializeScenarioUnitStorage(restored.head, restored.rows, restored.units)
    )
  ).toEqual(replacement);
});

it('continues read-only legacy and format1 admission without baseline conversion', () => {
  const logical = entry();
  expect(materializeScenarioUnitStorage(logical, [], [])).toBe(logical);
  expect(
    materializeScenarioUnitStorage(scenarioStorageHead(logical), scenarioStorageRows(logical), [])
  ).toEqual(logical);
  expect(materializeScenarioUnitStorage(undefined, [], [])).toBeUndefined();
});

it('preserves malformed, missing, foreign, duplicate, extra and orphan units', () => {
  const logical = entry();
  const physical = encodeScenarioUnitStorage(logical, []);
  const first = physical.units[0]!;
  const badRef = { unitId: 'guide:missing', revision: 1 };
  const badHead = { ...physical.head, project: { ...physical.head.project, items: [badRef] } };
  for (const [head, rows, units] of [
    [undefined, [], physical.units],
    [logical, [], physical.units],
    [scenarioStorageHead(logical), scenarioStorageRows(logical), physical.units],
    [{ ...physical.head, historyFormatVersion: 99 }, physical.rows, physical.units],
    [physical.head, physical.rows, physical.units.slice(1)],
    [physical.head, physical.rows, [...physical.units, first]],
    [
      physical.head,
      physical.rows,
      physical.units.map((row, index) => (index ? row : { ...row, projectId: 'foreign' })),
    ],
    [
      physical.head,
      physical.rows,
      physical.units.map((row, index) => (index ? row : { ...row, revision: 0 })),
    ],
    [
      physical.head,
      physical.rows,
      physical.units.map((row, index) => (index ? row : { ...row, extra: true })),
    ],
    [
      physical.head,
      physical.rows,
      physical.units.map((row, index) =>
        index ? row : { ...row, value: { kind: 'step', id: 'foreign' } }
      ),
    ],
    [physical.head, physical.rows, [...physical.units, { ...first, revision: 99 }]],
    [badHead, physical.rows, physical.units],
    [
      {
        ...physical.head,
        project: {
          ...physical.head.project,
          items: [physical.head.project.items[0], physical.head.project.items[0]],
        },
      },
      physical.rows,
      physical.units,
    ],
    [
      physical.head,
      physical.rows.map((row) => ({ ...row, project: { ...row.project, items: [badRef] } })),
      physical.units,
    ],
  ] as const) {
    const before = JSON.stringify([head, rows, units]);
    const value = materializeScenarioUnitStorage(head, [...rows], [...units]);
    expect(value).not.toBeUndefined();
    expect(parseScenarioProjectEntry(value)).toBeNull();
    expect(JSON.stringify([head, rows, units])).toBe(before);
  }
});

it('keeps global canonical identity, template, Tour navigation and hostile-input checks after unit assembly', () => {
  const logical = entry();
  const physical = encodeScenarioUnitStorage(logical, []);
  for (const altered of [
    { ...physical.head, project: { ...physical.head.project, purpose: 'step-template' } },
    { ...physical.head, project: { ...physical.head.project, id: 'step-a' } },
  ])
    expect(
      parseScenarioProjectEntry(
        materializeScenarioUnitStorage(altered, physical.rows, physical.units)
      )
    ).toBeNull();
  const invalidTour = physical.units.map((row) =>
    row.unitId === 'tour:slide-a'
      ? {
          ...row,
          value: {
            kind: 'navigation',
            id: 'slide-a',
            title: '',
            description: '',
            background: { color: '#000000', image: null },
            narration: null,
            timing: { mode: 'inherit', holdSeconds: 4, truncateNarration: false },
            buttons: [
              {
                id: 'broken-link',
                label: 'Missing slide',
                action: { kind: 'slide', slideId: 'missing' },
              },
            ],
          },
        }
      : row
  );
  expect(
    parseScenarioProjectEntry(
      materializeScenarioUnitStorage(physical.head, physical.rows, invalidTour)
    )
  ).toBeNull();
  const cyclic = { ...createGuideStep('Cycle', 'step-a'), extra: {} };
  cyclic.extra = cyclic;
  expect(
    parseScenarioProjectEntry(
      materializeScenarioUnitStorage(
        physical.head,
        physical.rows,
        physical.units.map((row) =>
          row.unitId === 'guide:step-a' ? { ...row, value: cyclic } : row
        )
      )
    )
  ).toBeNull();
});

it('stores both editing branches through shared native units rather than inline project copies', () => {
  const source = entry();
  const future = {
    ...source.project,
    name: 'Future',
    items: [{ ...source.project.items[0]!, title: 'Future-only step' }, source.project.items[1]!],
  };
  const logical = {
    ...source,
    editingHistory: {
      version: 1 as const,
      past: [{ ...source.project, name: 'Before' }],
      future: [future],
    },
  };
  const native = encodeScenarioUnitStorage(logical, []);
  expect(native.head.historyFormatVersion).toBe(3);
  expect(native.units).toHaveLength(5);
  expect(JSON.stringify(native.head)).not.toContain('Future-only step');
  expect(
    parseScenarioProjectEntry(
      materializeScenarioUnitStorage(native.head, native.rows, native.units)
    )
  ).toEqual(logical);
  const branched = encodeScenarioUnitStorage(
    { ...logical, editingHistory: { ...logical.editingHistory, future: [] } },
    native.units
  );
  expect(branched.units).toHaveLength(4);
  expect(branched.units.some((row) => row.value === future.items[0])).toBe(false);
  expect(
    parseScenarioProjectEntry(
      materializeScenarioUnitStorage(branched.head, branched.rows, branched.units)
    )
  ).toEqual({ ...logical, editingHistory: { ...logical.editingHistory, future: [] } });
});

it('refuses incomplete or mismatched editing branch graphs without changing their physical evidence', () => {
  const source = entry();
  const editingHistory = {
    version: 1 as const,
    past: [],
    future: [{ ...source.project, name: 'Future' }],
  };
  const native = encodeScenarioUnitStorage({ ...source, editingHistory }, []);
  const branch = native.head.project;
  const heads = [
    { ...native.head, historyFormatVersion: 2 },
    { ...native.head, editingHistory: undefined },
    { ...native.head, editingHistory: { ...native.head.editingHistory, version: 2 } },
    {
      ...native.head,
      editingHistory: { version: 1, past: [], future: [{ ...branch, id: 'foreign' }] },
    },
    {
      ...native.head,
      editingHistory: {
        version: 1,
        past: [],
        future: [{ ...branch, items: [{ unitId: 'guide:missing', revision: 1 }] }],
      },
    },
    { ...native.head, editingHistory: { version: 1, past: [], future: Array(51).fill(branch) } },
  ];
  const original = structuredClone(native);
  for (const head of heads)
    expect(
      parseScenarioProjectEntry(materializeScenarioUnitStorage(head, native.rows, native.units))
    ).toBeNull();
  expect(native).toEqual(original);
  expect(
    parseScenarioProjectEntry(
      materializeScenarioUnitStorage(native.head, native.rows, native.units)
    )
  ).toMatchObject({ editingHistory });
});

it.each(['guide', 'tour'] as const)(
  'shares equal %s reference lists through native structured clone',
  (kind) => {
    const source = entry();
    const logical = {
      ...source,
      editingHistory: {
        version: 1 as const,
        past: Array.from({ length: 30 }, (_, index) => ({
          ...source.project,
          name: `Before ${index}`,
          items: [...source.project.items],
          tour: { ...source.project.tour!, slides: [...source.project.tour!.slides] },
        })),
        future: [],
      },
    };
    const encoded = encodeScenarioUnitStorage(logical, []);
    const clone = structuredClone(encoded.head);
    const past = clone.editingHistory!.past;
    const values = (value: typeof clone.project) => {
      if (kind === 'guide') return value.items;
      if (!('tour' in value)) throw new Error('Expected native tour.');
      return value.tour.slides;
    };
    expect(past.every((value) => values(value) === values(clone.project))).toBe(true);
    expect(
      parseScenarioProjectEntry(materializeScenarioUnitStorage(clone, encoded.rows, encoded.units))
    ).toEqual(logical);
  }
);

it.each(['guide', 'tour'] as const)(
  'validates one shared %s reference list once in one materialization',
  (kind) => {
    const source = entry();
    const encoded = encodeScenarioUnitStorage(
      { ...source, editingHistory: { version: 1, past: [], future: [] } },
      []
    );
    const root = encoded.head.project;
    encoded.head.editingHistory!.past = Array.from({ length: 30 }, (_, index) => ({
      ...root,
      name: `Before ${index}`,
    }));
    if (!('tour' in root)) throw new Error('Expected native tour.');
    const ref = kind === 'guide' ? root.items[0]! : root.tour.slides[0]!;
    const id = ref.unitId;
    let reads = 0;
    Object.defineProperty(ref, 'unitId', {
      configurable: true,
      enumerable: true,
      get() {
        reads++;
        return id;
      },
    });
    const parsed = parseScenarioProjectEntry(
      materializeScenarioUnitStorage(encoded.head, encoded.rows, encoded.units)
    );
    expect(parsed?.editingHistory?.past).toHaveLength(30);
    expect(reads).toBeLessThanOrEqual(12);
    if (!parsed) throw new Error('Expected admitted Scenario.');
    const current = kind === 'guide' ? parsed.project.items[0]! : parsed.project.tour!.slides[0]!;
    const previous =
      kind === 'guide'
        ? parsed.editingHistory!.past[0]!.items[0]!
        : parsed.editingHistory!.past[0]!.tour!.slides[0]!;
    const before = previous.title;
    current.title = 'Live edit';
    expect(previous.title).toBe(before);
  }
);

it('does not reuse guide admission for a shared array in tour slots', () => {
  const source = entry();
  const encoded = encodeScenarioUnitStorage(source, []);
  if (!('tour' in encoded.head.project)) throw new Error('Expected native tour.');
  const invalid = {
    ...encoded.head,
    project: {
      ...encoded.head.project,
      tour: { ...encoded.head.project.tour, slides: encoded.head.project.items },
    },
  };
  expect(
    parseScenarioProjectEntry(materializeScenarioUnitStorage(invalid, encoded.rows, encoded.units))
  ).toBeNull();
});
