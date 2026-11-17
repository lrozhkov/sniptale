import { createScenarioProjectEntry } from './projects/entry';
import { expect, it, vi } from 'vitest';
import { createGuideProject, createGuideStep } from '../../../features/scenario/project/factories';
import { parseScenarioEditingHistory, retainScenarioEditingHistory } from './editing-history';
import { parseScenarioProjectEntry } from './read-guards';
import { EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';

function project(name = 'Current') {
  const value = createGuideProject(name, 'guide', 1);
  value.items = [createGuideStep('Shared step', 'step')];
  return value;
}
function large(name: string, character: string) {
  const value = project(name);
  const step = createGuideStep('Payload', 'step');
  step.blocks = Array.from({ length: 100 }, (_, index) => ({
    kind: 'text' as const,
    id: `text-${index}`,
    paragraphs: [
      { runs: [{ text: character.repeat(20000), bold: false, italic: false, href: null }] },
    ],
  }));
  value.items = [step];
  return value;
}

it('distinguishes absent and empty checkpoints and retains branch order without revision chronology', () => {
  const current = project();
  expect(parseScenarioEditingHistory(undefined, current)).toBeUndefined();
  expect(parseScenarioEditingHistory({ version: 1, past: [], future: [] }, current)).toEqual({
    version: 1,
    past: [],
    future: [],
  });
  const input = {
    version: 1,
    past: [{ ...current, name: 'Before', updatedAt: 50 }],
    future: [{ ...current, name: 'After', updatedAt: 1 }],
  };
  const original = structuredClone(input);
  const result = parseScenarioEditingHistory(input, current);
  expect(result).toEqual(input);
  expect(input).toEqual(original);
  input.past[0]!.items[0]!.title = 'Mutated caller';
  expect(result?.past[0]?.items[0]?.title).toBe('Shared step');
});

it.each([
  null,
  {},
  { version: 2, past: [], future: [] },
  { version: 1, past: null, future: [] },
  { version: 1, past: [], future: 'bad' },
  { version: 1, past: [], future: [], extra: true },
  { version: 1, past: [{ version: 0 }], future: [] },
  { version: 1, past: [], future: [createGuideProject('Foreign', 'foreign', 1)] },
])('refuses malformed or foreign checkpoint %j', (input) => {
  expect(parseScenarioEditingHistory(input, project())).toBeNull();
});

it('uses one combined action budget for both branches', () => {
  const current = project();
  const past = Array.from({ length: 25 }, (_, index) => ({ ...current, name: `Past ${index}` }));
  const future = Array.from({ length: 25 }, (_, index) => ({
    ...current,
    name: `Future ${index}`,
  }));
  expect(parseScenarioEditingHistory({ version: 1, past, future }, current)).toMatchObject({
    past,
    future,
  });
  expect(
    parseScenarioEditingHistory({ version: 1, past: [...past, current], future }, current)
  ).toBeNull();
});

it('counts unchanged unit payload once across fifty retained transitions', () => {
  const current = large('Current', 'x');
  expect(new TextEncoder().encode(JSON.stringify(current)).byteLength).toBeGreaterThan(1_900_000);
  const past = Array.from({ length: 50 }, (_, index) => ({ ...current, name: `Name ${index}` }));
  expect(parseScenarioEditingHistory({ version: 1, past, future: [] }, current)?.past).toHaveLength(
    50
  );
});

it('refuses distinct retained payload above the pooled byte budget without changing the input', () => {
  const current = large('Current', 'a');
  const past = ['b', 'c', 'd', 'e'].map((character) => large(character, character));
  expect(
    past.reduce(
      (total, value) => total + JSON.stringify(value).length,
      JSON.stringify(current).length
    )
  ).toBeGreaterThan(EDITOR_HISTORY_LIMITS.maxBytes);
  expect(parseScenarioEditingHistory({ version: 1, past, future: [] }, current)).toBeNull();
  expect(current.name).toBe('Current');
  expect(past.map((value) => value.name)).toEqual(['b', 'c', 'd', 'e']);
});

it('admits the checkpoint through the logical entry boundary and rejects replacement with foreign history', () => {
  const current = project();
  const entry = {
    id: current.id,
    project: current,
    createdAt: 1,
    updatedAt: 1,
    workspaceRevision: 1,
    editingHistory: { version: 1, past: [], future: [{ ...current, name: 'Future' }] },
  };
  expect(parseScenarioProjectEntry(entry)).toMatchObject({ editingHistory: entry.editingHistory });
  expect(
    parseScenarioProjectEntry({
      ...entry,
      editingHistory: {
        ...entry.editingHistory,
        future: [{ ...current, id: 'foreign' }],
      },
    })
  ).toBeNull();
});

it('appends a generic content action and clears its cancelled future', () => {
  const current = project();
  const existing = {
    id: current.id,
    project: current,
    createdAt: 1,
    updatedAt: 1,
    workspaceRevision: 1,
    editingHistory: { version: 1 as const, past: [], future: [{ ...current, name: 'Future' }] },
  };
  const next = createScenarioProjectEntry({ existing, project: { ...current, name: 'Changed' } });
  expect(next.editingHistory).toEqual({ version: 1, past: [current], future: [] });
  expect(existing.editingHistory.future[0]?.name).toBe('Future');
});

it('applies the pooled byte limit to UTF-8 bytes rather than string character counts', () => {
  const current = large('Current', 'Ж');
  const past = [large('Past', 'Б'), large('Before', 'В')];
  const characters = [current, ...past].reduce(
    (sum, value) => sum + JSON.stringify(value).length,
    0
  );
  expect(characters).toBeLessThan(EDITOR_HISTORY_LIMITS.maxBytes);
  expect(parseScenarioEditingHistory({ version: 1, past, future: [] }, current)).toBeNull();
});

it('preserves editing branches for an admitted metadata-only revision and refuses revision exhaustion', () => {
  const current = project();
  const existing = {
    ...createScenarioProjectEntry({ project: current, existing: undefined }),
    editingHistory: { version: 1 as const, past: [], future: [{ ...current, name: 'Future' }] },
  };
  const before = structuredClone(existing);
  const metadata = createScenarioProjectEntry({
    existing,
    project: existing.project,
    historyPolicy: 'preserve',
  });
  expect(metadata.editingHistory).toEqual(existing.editingHistory);
  expect(metadata.workspaceRevision).toBe(existing.workspaceRevision + 1);
  expect(existing).toEqual(before);
  expect(() =>
    createScenarioProjectEntry({
      existing: { ...existing, workspaceRevision: Number.MAX_SAFE_INTEGER },
      project: existing.project,
      historyPolicy: 'preserve',
    })
  ).toThrow('revisions are exhausted');
});

it('retains the nearest fifty past actions and measures a shared unit only once', () => {
  const current = large('Current', 'x');
  const past = Array.from({ length: 55 }, (_, index) => ({ ...current, name: `Past ${index}` }));
  const stringify = vi.spyOn(JSON, 'stringify');
  let retained: ReturnType<typeof retainScenarioEditingHistory>;
  let bodyCalls = 0;
  try {
    retained = retainScenarioEditingHistory(current, past);
    bodyCalls = stringify.mock.calls.filter(([value]) => value === current.items[0]).length;
  } finally {
    stringify.mockRestore();
  }
  expect(retained.past).toEqual(past.slice(-50));
  expect(retained.future).toEqual([]);
  expect(bodyCalls).toBe(1);
  expect(past).toHaveLength(55);
});
it('trims oldest pooled payloads without reparsing every shortened history', () => {
  const current = large('Current', 'a');
  const past = ['b', 'c', 'd', 'e'].map((character) => large(character, character));
  const retained = retainScenarioEditingHistory(current, past);
  expect(retained.past.map((project) => project.name)).toEqual(['c', 'd', 'e']);
  expect(parseScenarioEditingHistory(retained, current)).toEqual(retained);
  expect(past.map((project) => project.name)).toEqual(['b', 'c', 'd', 'e']);
});
it('preserves explicit checkpoints and metadata-only branches without mutating borrowed data', () => {
  const current = project();
  const editingHistory = {
    version: 1 as const,
    past: [current],
    future: [{ ...current, name: 'Redo' }],
  };
  const existing = {
    ...createScenarioProjectEntry({ existing: undefined, project: current }),
    editingHistory,
  };
  const metadata = createScenarioProjectEntry({
    existing,
    project: existing.project,
    historyPolicy: 'discard',
  });
  expect(metadata.editingHistory).toEqual(editingHistory);
  expect(metadata.editingHistory).not.toBe(editingHistory);
  const timestampOnly = createScenarioProjectEntry({
    existing,
    project: { ...existing.project, updatedAt: existing.project.updatedAt + 1 },
  });
  expect(timestampOnly.editingHistory).toEqual(editingHistory);
  const explicit = { version: 1 as const, past: [], future: [] };
  const next = createScenarioProjectEntry({
    existing,
    project: { ...existing.project, name: 'Changed' },
    editingHistory: explicit,
  });
  expect(next.editingHistory).toEqual(explicit);
  expect(existing.editingHistory).toEqual(editingHistory);
});

it('keeps oversized current content valid by retaining no editing transitions', () => {
  const current = project('Oversized current');
  current.items = Array.from({ length: 2 }, (_, index) => {
    const item = large('Body', '界').items[0]!;
    if (item.kind !== 'step') throw new Error('Expected an oversized step fixture.');
    return {
      ...item,
      id: `item-${index}`,
      blocks: item.blocks
        .slice(0, 95)
        .map((block, slot) => ({ ...block, id: `block-${index}-${slot}` })),
    };
  });
  expect(
    parseScenarioProjectEntry({
      id: current.id,
      project: current,
      createdAt: 1,
      updatedAt: 1,
      workspaceRevision: 1,
    })
  ).not.toBeNull();
  const retained = retainScenarioEditingHistory(current, [project('Previous')]);
  expect(retained).toEqual({ version: 1, past: [], future: [] });
  expect(parseScenarioEditingHistory(retained, current)).toEqual(retained);
});
