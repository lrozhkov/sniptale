import { expect, it, vi } from 'vitest';
import { stores, createAsset } from './aggregate-mutations.test-support';
import {
  commitScenarioAggregateMutation,
  scenarioAssetPublicationAdapter,
} from './aggregate-mutations';
import { deleteScenarioAggregate } from './aggregate-cleanup';
import { getScenarioProjectEntry } from './projects/project';
import { EXPECTED_STORES } from '../infrastructure/indexed-db/core.stores';
import { encodePortableScenarioProjectEntry } from '../../../workflows/media-hub-backup/v6/root-codecs/projects';
import { parseRootEnvelope } from '../../../workflows/media-hub-backup/v6/codec';
import {
  session as restoreSession,
  journal,
} from '../../../workflows/media-hub-backup/v6/root-publication/media.review-assets.test-support';
import { createGuideProject } from '../../../features/scenario/project/factories';

it('refuses a delayed pre-deletion writer after same-ID archive restoration without sync', async () => {
  const first = await commitScenarioAggregateMutation(createGuideProject('Archived original'), {
    expectedRevision: null,
  });
  const archived = await getScenarioProjectEntry(first.project.id);
  if (!archived) throw new Error('Missing committed project');
  const delayed = { ...first.project, name: 'Late old editor' };
  await deleteScenarioAggregate(first.project.id);
  expect(await getScenarioProjectEntry(first.project.id)).toBeUndefined();
  for (const name of EXPECTED_STORES) if (!stores.has(name)) stores.set(name, new Map());
  const fixtureAssets = await import('../assets');
  const realAssets = await vi.importActual<typeof import('../assets')>('../assets');
  vi.doMock('../assets', () => ({
    ...realAssets,
    ...fixtureAssets,
    appendCommittedArchiveRootInTransaction: realAssets.appendCommittedArchiveRootInTransaction,
  }));
  const { scenarioProjectRootPublisher } =
    await import('../../../workflows/media-hub-backup/v6/root-publication/scenario-project');
  const session = {
    ...restoreSession('replace'),
    currentRoot: `scenario-project:${first.project.id}`,
  };
  stores.get('asset_operations')!.set(session.operationId, session);
  const envelope = parseRootEnvelope({
    descriptor: {
      rootKind: 'scenario-project',
      rootId: first.project.id,
      metadataPath: 'Metadata/scenario-projects/audit.json',
      objectCount: 0,
      totalBytes: 0,
    },
    metadata: {
      entry: encodePortableScenarioProjectEntry(archived),
      assets: [],
      exports: [],
      exportThumbnails: [],
      stepDocuments: [],
    },
    objects: [],
  });
  const restored = await scenarioProjectRootPublisher.publish({
    envelope,
    session,
    journal,
    staged: [],
  });
  expect(restored.imported).toBe(true);
  expect((await getScenarioProjectEntry(first.project.id))?.project.name).toBe('Archived original');
  await expect(
    commitScenarioAggregateMutation(delayed, { expectedRevision: first.workspaceRevision })
  ).rejects.toMatchObject({ name: 'StaleScenarioAggregateRevisionError' });
});

it('issues a fresh revision for same-ID recreation and rejects the previous writer', async () => {
  const initial = await commitScenarioAggregateMutation(createGuideProject('Original'), {
    expectedRevision: null,
  });
  await deleteScenarioAggregate(initial.project.id);
  const recreated = await commitScenarioAggregateMutation(
    { ...initial.project, name: 'Recreated' },
    { expectedRevision: null }
  );
  expect(recreated.workspaceRevision).toBeGreaterThan(initial.workspaceRevision);
  await expect(
    commitScenarioAggregateMutation(
      { ...initial.project, name: 'Old writer' },
      { expectedRevision: initial.workspaceRevision }
    )
  ).rejects.toMatchObject({ name: 'StaleScenarioAggregateRevisionError' });
  expect((await getScenarioProjectEntry(initial.project.id))?.project.name).toBe('Recreated');
});

it.each([
  null,
  {},
  { version: 2, revision: 1 },
  { version: 1, revision: '1' },
  { version: 1, revision: -1 },
  { version: 1, revision: 1.5 },
  { version: 1, revision: Number.MAX_SAFE_INTEGER + 1 },
  { version: 1, projectId: 'foreign', revision: 1 },
])(
  'preserves the root on malformed deletion fence %j and permits retry after repair',
  async (invalid) => {
    const initial = await commitScenarioAggregateMutation(createGuideProject('Original'));
    const clock = stores.get('scenario_project_revisions');
    if (!clock) throw new Error('Missing Scenario revisions store');
    clock.set(
      initial.project.id,
      invalid && typeof invalid === 'object'
        ? { projectId: initial.project.id, ...invalid }
        : invalid
    );
    await expect(deleteScenarioAggregate(initial.project.id)).rejects.toThrow(
      'Invalid retained Scenario revision'
    );
    expect((await getScenarioProjectEntry(initial.project.id))?.project).toEqual(initial.project);
    stores.get('scenario_project_revisions')?.delete(initial.project.id);
    await deleteScenarioAggregate(initial.project.id);
    expect(await getScenarioProjectEntry(initial.project.id)).toBeUndefined();
  }
);

it('refuses recreation after revision exhaustion without publishing a root', async () => {
  const initial = await commitScenarioAggregateMutation(createGuideProject('Original'));
  await deleteScenarioAggregate(initial.project.id);
  stores.get('scenario_project_revisions')?.set(initial.project.id, {
    version: 1,
    projectId: initial.project.id,
    revision: Number.MAX_SAFE_INTEGER,
  });
  await expect(
    commitScenarioAggregateMutation(initial.project, { expectedRevision: null })
  ).rejects.toThrow('revisions are exhausted');
  expect(await getScenarioProjectEntry(initial.project.id)).toBeUndefined();
});

it('retires a missing-root ready publication after an intervening birth and deletion', async () => {
  const project = createGuideProject('Delayed asset save');
  const assets = await import('../assets');
  vi.mocked(assets.publishReadyJournalWithRetry).mockImplementationOnce(
    async (journal, publish) => {
      const intervening = await commitScenarioAggregateMutation(
        { ...project, name: 'Intervening project' },
        { expectedRevision: null }
      );
      await deleteScenarioAggregate(intervening.project.id);
      await publish(journal);
    }
  );
  await expect(
    commitScenarioAggregateMutation(project, {
      expectedRevision: null,
      children: { assetPuts: [createAsset(project.id, 'delayed')] },
    })
  ).rejects.toMatchObject({ name: 'StaleScenarioAggregateRevisionError' });
  const journal = await vi.mocked(assets.createAssetPublicationJournal).mock.results.at(-1)?.value;
  if (!journal) throw new Error('Missing ready publication');
  await scenarioAssetPublicationAdapter.publish(journal);
  expect(assets.cancelAssetPublication).toHaveBeenCalledWith(journal, undefined);
  expect(await getScenarioProjectEntry(project.id)).toBeUndefined();
  expect(stores.get('scenario_assets')?.size).toBe(0);
  const retried = await commitScenarioAggregateMutation(project, {
    expectedRevision: null,
    children: { assetPuts: [createAsset(project.id, 'retry')] },
  });
  expect(retried.workspaceRevision).toBe(2);
});

it('replays a committed ready publication after recreation without another revision', async () => {
  const initial = await commitScenarioAggregateMutation(createGuideProject('Original'));
  await deleteScenarioAggregate(initial.project.id);
  const assets = await import('../assets');
  vi.mocked(assets.publishReadyJournalWithRetry).mockImplementationOnce(
    async (journal, publish) => {
      await publish(journal);
      await publish(journal);
    }
  );
  const accepted = await commitScenarioAggregateMutation(
    { ...initial.project, name: 'Recreated' },
    {
      expectedRevision: null,
      children: { assetPuts: [createAsset(initial.project.id, 'recreated')] },
    }
  );
  expect(accepted.workspaceRevision).toBe(2);
  expect((await getScenarioProjectEntry(initial.project.id))?.workspaceRevision).toBe(2);
  expect(stores.get('scenario_assets')?.size).toBe(1);
});

it('retains the highest deletion fence when a legacy live root has an older revision', async () => {
  const initial = await commitScenarioAggregateMutation(createGuideProject('Legacy live root'));
  stores.get('scenario_project_revisions')?.set(initial.project.id, {
    version: 1,
    projectId: initial.project.id,
    revision: 20,
  });
  await deleteScenarioAggregate(initial.project.id);
  const recreated = await commitScenarioAggregateMutation(initial.project, {
    expectedRevision: null,
  });
  expect(recreated.workspaceRevision).toBe(21);
});
