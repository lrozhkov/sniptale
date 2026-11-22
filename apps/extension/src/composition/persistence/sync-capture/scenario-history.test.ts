import { expect, it } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
} from '../../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../scenario/projects/entry';
import { parseScenarioProjectEntry } from '../scenario/read-guards';
import { encodeScenarioUnitStorage } from '../scenario/storage-units';
import { detachScenarioHistory, materializeDetachedScenarioHistory } from './scenario-history';

function checkpoint() {
  const project = createGuideProject('Current', 'detached-guide', 100);
  const step = createGuideStep('Shared', 'shared-step');
  step.blocks.push({
    id: 'text',
    kind: 'text',
    paragraphs: createGuideParagraphs(Array(30).fill('x'.repeat(10_000)).join('\n')),
  });
  project.items.push(step);
  return {
    ...createScenarioProjectEntry({ project, existing: undefined, updatedAt: 100 }),
    workspaceRevision: 21,
    history: Array.from({ length: 20 }, (_, revision) => ({
      revision: revision + 1,
      savedAt: revision + 1,
      project: { ...project, updatedAt: revision + 1, name: `Saved ${revision}` },
    })),
    editingHistory: {
      version: 1 as const,
      past: Array.from({ length: 25 }, (_, i) => ({ ...project, name: `Past ${i}` })),
      future: Array.from({ length: 25 }, (_, i) => ({ ...project, name: `Future ${i}` })),
    },
  };
}

it('detaches a shared unit once and preserves the exact saved and editing branches', () => {
  const entry = checkpoint();
  expect(parseScenarioProjectEntry(entry)).not.toBeNull();
  const before = structuredClone(entry);
  const { current, text } = detachScenarioHistory(entry);
  expect(current).not.toHaveProperty('history');
  expect(current).not.toHaveProperty('editingHistory');
  expect(new TextEncoder().encode(text!).byteLength).toBeLessThan(400_000);
  const body: unknown = JSON.parse(text!);
  expect(materializeDetachedScenarioHistory(current, body)).toEqual(entry);
  expect(entry).toEqual(before);
});

it('keeps legacy arrays and absent histories compatible and preserves an explicit empty checkpoint', () => {
  const { editingHistory: _editing, ...legacy } = checkpoint();
  const detached = detachScenarioHistory(legacy);
  expect(materializeDetachedScenarioHistory(detached.current, JSON.parse(detached.text!))).toEqual(
    legacy
  );
  const empty = {
    ...detached.current,
    editingHistory: { version: 1 as const, past: [], future: [] },
  };
  const next = detachScenarioHistory(empty);
  expect(materializeDetachedScenarioHistory(next.current, JSON.parse(next.text!))).toEqual(empty);
  expect(materializeDetachedScenarioHistory(next.current, undefined)).toEqual(next.current);
});

it('refuses damaged graphs and graphs bound to another current entry', () => {
  const entry = checkpoint();
  const { current } = detachScenarioHistory(entry);
  const body = {
    kind: 'native-scenario-unit-history',
    version: 1,
    ...encodeScenarioUnitStorage(entry, []),
  };
  for (const hostile of [
    {},
    { ...body, version: 2 },
    { ...body, extra: true },
    { ...body, units: [] },
    { ...body, units: [...body.units, ...body.units] },
    { ...body, head: { ...body.head, id: 'foreign' } },
  ])
    expect(materializeDetachedScenarioHistory(current, hostile)).toBeNull();
  expect(
    materializeDetachedScenarioHistory({ ...current, workspaceRevision: 22 }, body)
  ).toBeNull();
  expect(
    materializeDetachedScenarioHistory(
      { ...current, project: { ...current.project, name: 'Changed' } },
      body
    )
  ).toBeNull();
});
