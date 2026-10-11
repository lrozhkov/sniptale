import { afterEach, expect, it, vi } from 'vitest';
import { getStore, stores, createAsset } from './aggregate-mutations.test-support';
import { deleteOrphanedScenarioAggregateChild } from './aggregate-cleanup';
import { commitScenarioAggregateMutation } from './aggregate-mutations';
import { createGuideProject } from '../../../features/scenario/project/public';
import { createScenarioProjectEntry } from './projects/entry';
afterEach(() => vi.restoreAllMocks());

it('writes only the head and new historical version after legacy baseline admission', async () => {
  let existing = createScenarioProjectEntry({
    existing: undefined,
    project: createGuideProject('Initial', 'guide', 1),
    updatedAt: 2,
  });
  for (let index = 0; index < 3; index++)
    existing = createScenarioProjectEntry({
      existing,
      project: { ...existing.project, name: `Retained ${index}` },
      updatedAt: index + 3,
    });
  const roots = getStore('scenario_projects');
  const history = getStore('scenario_project_history');
  roots.set(existing.id, existing);
  const baseline = await commitScenarioAggregateMutation(
    { ...existing.project, name: 'Baseline admission' },
    { expectedRevision: existing.workspaceRevision }
  );
  const retainedRows = [...history].map(([key, value]) => ({ key, value: JSON.stringify(value) }));
  const writes = vi.spyOn(Map.prototype, 'set');
  const published = await commitScenarioAggregateMutation(
    { ...baseline.project, name: 'Latest name' },
    { expectedRevision: baseline.workspaceRevision }
  );
  const rootWrites = writes.mock.calls.filter((_, index) => writes.mock.contexts[index] === roots);
  const historyWrites = writes.mock.calls.filter(
    (_, index) => writes.mock.contexts[index] === history
  );
  expect(rootWrites).toHaveLength(1);
  expect(rootWrites[0]?.[1]).not.toHaveProperty('history');
  expect(historyWrites).toHaveLength(1);
  expect(historyWrites[0]?.[1]).toMatchObject({
    projectId: existing.id,
    revision: baseline.workspaceRevision,
    project: baseline.project,
  });
  for (const { key, value } of retainedRows) expect(JSON.stringify(history.get(key))).toBe(value);
  expect(published.project.name).toBe('Latest name');
  expect(published.workspaceRevision).toBe(baseline.workspaceRevision + 1);
});

it.each([false, true])(
  'retains orphan history and its children without deletion intent (corrupt=%s)',
  async (corrupt) => {
    const project = createGuideProject('Retained orphan', 'guide', 1);
    const asset = createAsset(project.id);
    getStore('scenario_assets').set(asset.id, asset);
    getStore('scenario_project_history').set(JSON.stringify([project.id, 1]), {
      projectId: project.id,
      revision: 1,
      savedAt: project.updatedAt,
      project: corrupt ? { version: 99 } : project,
    });
    const before = structuredClone(stores);
    await expect(
      deleteOrphanedScenarioAggregateChild({ id: asset.id, kind: 'asset' })
    ).rejects.toThrow('still belongs');
    expect(stores).toEqual(before);
    expect((await import('../assets')).completePhysicalDeleteOperation).not.toHaveBeenCalled();
  }
);
