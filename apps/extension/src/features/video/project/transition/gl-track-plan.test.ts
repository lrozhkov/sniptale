import { expect, it } from 'vitest';
import { createGlTransitionSelection } from './gl-catalog';
import { buildGlTrackPlan, type GlTrackJunction, type GlTrackNode } from './gl-track-plan';

const budget = { layersPerPass: 64, totalLayers: 512, groupDepth: 16 };
function edge(
  id: string,
  leadingClipId: string,
  trailingClipId: string,
  start = 0
): GlTrackJunction {
  return {
    id,
    leadingClipId,
    trailingClipId,
    start,
    progress: 0.5,
    selection: createGlTransitionSelection('Fade')!,
  };
}
function leaves(node: GlTrackNode): readonly (readonly string[])[] {
  return node.kind === 'state' ? [node.clipIds] : [...leaves(node.before), ...leaves(node.after)];
}

it('retains interleaved physical-track occlusion in both endpoint states', () => {
  const clips = ['A', 'X', 'B'];
  const result = buildGlTrackPlan(clips, [edge('AB', 'A', 'B')], budget);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(leaves(result.root)).toEqual([
    ['A', 'X'],
    ['X', 'B'],
  ]);
  expect(result.metrics).toEqual({ layers: 6, depth: 2 });
  expect(clips).toEqual(['A', 'X', 'B']);
});

it('folds a directed A/B/C chain without rendering B as an extra independent layer', () => {
  const result = buildGlTrackPlan(
    ['A', 'X', 'B', 'C'],
    [edge('BC', 'B', 'C', 2), edge('AB', 'A', 'B', 1)],
    budget
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected an admitted chain.');
  expect(result.root.kind).toBe('gl');
  if (result.root.kind !== 'gl') throw new Error('Expected GL root.');
  expect(result.root.before.kind).toBe('gl');
  if (result.root.before.kind !== 'gl') throw new Error('Expected nested GL predecessor.');
  expect(result.root.junction.id).toBe('BC');
  expect(result.root.before.junction.id).toBe('AB');
  expect(leaves(result.root)).toEqual([
    ['A', 'X'],
    ['X', 'B'],
    ['X', 'C'],
  ]);
  expect(result.metrics).toEqual({ layers: 10, depth: 3 });
});

it('produces deterministic combinations for independent chains without reordering nonmembers', () => {
  const a = edge('AB', 'A', 'B'),
    b = edge('CD', 'C', 'D');
  const clips = ['A', 'C', 'X', 'B', 'D'];
  const first = buildGlTrackPlan(clips, [a, b], budget);
  const second = buildGlTrackPlan(clips, [b, a], budget);
  expect(first).toEqual(second);
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(leaves(first.root)).toEqual([
    ['A', 'C', 'X'],
    ['A', 'X', 'D'],
    ['C', 'X', 'B'],
    ['X', 'B', 'D'],
  ]);
  expect(first.metrics).toEqual({ layers: 18, depth: 3 });
});

it('retains the ordinary track when it contains no active junction', () => {
  expect(buildGlTrackPlan(['A', 'X', 'B'], [], budget)).toEqual({
    ok: true,
    root: { kind: 'state', clipIds: ['A', 'X', 'B'] },
    metrics: { layers: 3, depth: 1 },
  });
});

it('refuses missing, branching, cyclic and incompatible junctions without modifying accepted data', () => {
  const cases = [
    [edge('missing', 'A', 'Z')],
    [edge('AB', 'A', 'B'), edge('AC', 'A', 'C')],
    [edge('AB', 'A', 'B'), edge('CB', 'C', 'B')],
    [edge('AB', 'A', 'B'), edge('BA', 'B', 'A')],
    [edge('AB', 'A', 'B', 2), edge('BC', 'B', 'C', 1)],
    [{ ...edge('AB', 'A', 'B'), progress: NaN }],
    [{ ...edge('AB', 'A', 'B'), progress: 1.1 }],
  ];
  const incompatible = edge('AB', 'A', 'B');
  incompatible.selection = { ...incompatible.selection, wgslSha256: '0'.repeat(64) };
  cases.push([incompatible]);
  for (const edges of cases) {
    const snapshot = structuredClone(edges);
    expect(buildGlTrackPlan(['A', 'B', 'C'], edges, budget)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(edges).toEqual(snapshot);
  }
});

it('counts expanded layer occurrences and refuses each actual graph budget before resources exist', () => {
  const clips = ['A', 'X', 'B'];
  expect(buildGlTrackPlan(clips, [edge('AB', 'A', 'B')], { ...budget, totalLayers: 5 })).toEqual({
    ok: false,
    reason: 'resources',
  });
  expect(buildGlTrackPlan(clips, [edge('AB', 'A', 'B')], { ...budget, groupDepth: 1 })).toEqual({
    ok: false,
    reason: 'resources',
  });
  expect(buildGlTrackPlan(clips, [], { ...budget, layersPerPass: 2 })).toEqual({
    ok: false,
    reason: 'resources',
  });
  const many = Array.from({ length: 12 }, (_, index) =>
    edge(String(index), `A${index}`, `B${index}`)
  );
  expect(
    buildGlTrackPlan(
      many.flatMap((item) => [item.leadingClipId, item.trailingClipId]),
      many,
      budget
    )
  ).toEqual({ ok: false, reason: 'resources' });
});

it('snapshots accepted shader parameters before asynchronous consumers can borrow the plan', () => {
  const junction = edge('AB', 'A', 'B');
  const result = buildGlTrackPlan(['A', 'B'], [junction], budget);
  expect(result.ok).toBe(true);
  if (!result.ok || result.root.kind !== 'gl') throw new Error('Expected GL plan.');
  const accepted = structuredClone(result.root.junction);
  junction.progress = 0.9;
  junction.selection.values['foreign'] = 1;
  expect(result.root.junction).toEqual(accepted);
});

it('refuses duplicate identities and malformed budgets, and admits the exact expanded budget', () => {
  expect(buildGlTrackPlan(['A', 'A'], [], budget)).toEqual({ ok: false, reason: 'invalid' });
  expect(
    buildGlTrackPlan(['A', 'B', 'C', 'D'], [edge('same', 'A', 'B'), edge('same', 'C', 'D')], budget)
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(buildGlTrackPlan(['A'], [], { ...budget, totalLayers: Infinity })).toEqual({
    ok: false,
    reason: 'invalid',
  });
  const clips = ['A', 'X', 'B'];
  expect(
    buildGlTrackPlan(clips, [edge('AB', 'A', 'B')], {
      layersPerPass: 2,
      totalLayers: 6,
      groupDepth: 2,
    }).ok
  ).toBe(true);
  const chain = Array.from({ length: 17 }, (_, index) =>
    edge(String(index), `A${index}`, `A${index + 1}`, index)
  );
  const ids = Array.from({ length: 18 }, (_, index) => `A${index}`);
  expect(buildGlTrackPlan(ids, chain, budget)).toEqual({ ok: false, reason: 'resources' });
});
