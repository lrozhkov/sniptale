import {
  stores,
  getStore,
  normalizeKey,
  db,
  createAsset,
  createDocument,
} from './aggregate-mutations.test-support';
import { expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../../features/scenario/project/factories';
import { pruneScenarioResources, clearScenarioSavedHistory } from './retention';
vi.mock('./resource-sessions', () => ({
  tryScenarioResourceCleanup: async (_id: string, operation: () => Promise<unknown>) => operation(),
}));
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';

import {
  commitScenarioAggregateMutation,
  commitScenarioAggregateSnapshotMutation,
  scenarioAssetPublicationAdapter,
} from './aggregate-mutations';
import { deleteOrphanedScenarioAggregateChild, deleteScenarioAggregate } from './aggregate-cleanup';

it('commits root and owned children, preserves document creation, and accepts exact replay', async () => {
  const project = createGuideProject('Aggregate');
  const first = await commitScenarioAggregateMutation(project, {
    expectedRevision: null,
    children: {
      assetPuts: [createAsset(project.id)],
      editorDocumentPuts: [createDocument(project.id)],
    },
  });
  expect(first.workspaceRevision).toBe(1);

  const updatedProject = { ...first.project, name: 'Updated' };
  const second = await commitScenarioAggregateMutation(updatedProject, {
    expectedRevision: 1,
    children: {
      assetPuts: [createAsset(project.id)],
      editorDocumentPuts: [{ ...createDocument(project.id), createdAt: 99 }],
    },
  });
  expect(second.workspaceRevision).toBe(2);
  expect(
    (getStore('scenario_step_editor_documents').get('step-1') as { createdAt: number }).createdAt
  ).toBe(1);

  await expect(
    commitScenarioAggregateMutation(second.project, { expectedRevision: 0 })
  ).resolves.toEqual(second);
});

it('rejects stale roots, foreign puts, collisions, and foreign child deletes', async () => {
  const project = createGuideProject('Aggregate');
  await commitScenarioAggregateMutation(project);
  await expect(
    commitScenarioAggregateMutation({ ...project, name: 'Stale' }, { expectedRevision: 0 })
  ).rejects.toMatchObject({ name: 'StaleScenarioAggregateRevisionError' });
  await expect(
    commitScenarioAggregateMutation(project, { children: { assetPuts: [createAsset('other')] } })
  ).rejects.toThrow('belongs to another project');

  getStore('scenario_assets').set('foreign', createAsset('other', 'foreign'));
  await expect(
    commitScenarioAggregateMutation(project, { children: { assetDeletes: ['foreign'] } })
  ).rejects.toThrow('does not belong');
  getStore('scenario_step_editor_documents').set(
    'foreign-step',
    createDocument('other', 'foreign-step')
  );
  await expect(
    commitScenarioAggregateMutation(project, {
      children: { editorDocumentDeletes: ['foreign-step'] },
    })
  ).rejects.toThrow('does not belong');
});

it('surfaces failed OPFS cleanup when a pre-journal mutation is rejected', async () => {
  const project = createGuideProject('Aggregate');
  await commitScenarioAggregateMutation(project);
  const assetMocks = await import('../assets');
  vi.mocked(assetMocks.discardPreparedAsset).mockRejectedValueOnce(
    new Error('OPFS removal failed')
  );

  await expect(
    commitScenarioAggregateMutation(project, {
      children: { assetPuts: [createAsset(project.id, 'stale-cleanup')] },
      expectedRevision: 0,
    })
  ).rejects.toMatchObject({
    errors: expect.arrayContaining([
      expect.objectContaining({ name: 'StaleScenarioAggregateRevisionError' }),
      expect.objectContaining({ message: 'Failed to discard uncommitted scenario assets.' }),
    ]),
  });
});

it('surfaces editor cleanup failure together with a pre-journal revision rejection', async () => {
  const project = createGuideProject('Aggregate');
  await commitScenarioAggregateMutation(project);
  const assetMocks = await import('../assets');
  vi.mocked(assetMocks.discardPreparedAsset).mockRejectedValueOnce(
    new Error('editor object cleanup failed')
  );

  await expect(
    commitScenarioAggregateMutation(project, {
      children: { editorDocumentPuts: [createDocument(project.id)] },
      expectedRevision: 0,
    })
  ).rejects.toMatchObject({
    name: 'AggregateError',
    errors: expect.arrayContaining([
      expect.objectContaining({ name: 'StaleScenarioAggregateRevisionError' }),
      expect.objectContaining({
        message: 'Failed to discard scenario editor document assets.',
      }),
    ]),
  });
});

it('discards supplied staging when recovery rejects before a new publication journal', async () => {
  const project = createGuideProject('Recovery failure');
  const assetMocks = await import('../assets');
  const error = new Error('recovery publication quota exhausted');
  vi.mocked(assetMocks.recoverStandaloneAssetPublications).mockRejectedValueOnce(error);
  await expect(
    commitScenarioAggregateMutation(project, {
      expectedRevision: null,
      children: { assetPuts: [createAsset(project.id, 'recovery-failure')] },
    })
  ).rejects.toBe(error);
  expect(assetMocks.discardPreparedAsset).toHaveBeenCalledWith('opfs-recovery-failure');
  expect(assetMocks.createAssetPublicationJournal).not.toHaveBeenCalled();
  expect(getStore('scenario_projects').has(project.id)).toBe(false);
});

it('rejects a document preparation failure before publication handoff', async () => {
  const project = createGuideProject('Aggregate');
  const assetMocks = await import('../assets');
  vi.mocked(assetMocks.writeBlobToAsset).mockRejectedValueOnce(new Error('quota exhausted'));

  await expect(
    commitScenarioAggregateMutation(project, {
      children: { editorDocumentPuts: [createDocument(project.id)] },
      expectedRevision: null,
    })
  ).rejects.toThrow('quota exhausted');
  expect(assetMocks.createAssetPublicationJournal).not.toHaveBeenCalled();
});

it('surfaces persistence-admission release failure after scenario publication', async () => {
  const project = createGuideProject('Aggregate');
  const assetMocks = await import('../assets');
  vi.mocked(assetMocks.releaseAssetReadyProtection).mockRejectedValueOnce(
    new Error('transition release failed')
  );

  await expect(
    commitScenarioAggregateMutation(project, {
      children: { assetPuts: [createAsset(project.id)] },
      expectedRevision: null,
    })
  ).rejects.toThrow('transition release failed');
  expect(getStore('scenario_projects').has(project.id)).toBe(true);
  expect(getStore('asset_refs').has('opfs-asset-1')).toBe(true);
});

it('fails closed when publication completes without a scenario aggregate result', async () => {
  const project = createGuideProject('Aggregate');
  const assetMocks = await import('../assets');
  vi.mocked(assetMocks.publishReadyJournalWithRetry).mockResolvedValueOnce(undefined);

  await expect(
    commitScenarioAggregateMutation(project, {
      children: { assetPuts: [createAsset(project.id)] },
      expectedRevision: null,
    })
  ).rejects.toThrow('produced no result');
  expect(assetMocks.releaseAssetReadyProtection).toHaveBeenCalledWith(['opfs-asset-1']);
});

it('records explicit lifecycle and updated-at constraints in publication payloads', async () => {
  const project = createGuideProject('Aggregate');
  const assetMocks = await import('../assets');
  await commitScenarioAggregateMutation(project, {
    children: { assetPuts: [createAsset(project.id)] },
    expectedRevision: null,
    expectedUpdatedAt: null,
    storageClass: 'temporary',
  });

  expect(assetMocks.createAssetPublicationJournal).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({ expectedUpdatedAt: null, storageClass: 'temporary' }),
    })
  );
});

it('replays a cold-runtime journal before a project-only mutation reads the revision', async () => {
  const project = createGuideProject('Cold runtime');
  const initial = await commitScenarioAggregateMutation(project);
  const assetMocks = await import('../assets');
  vi.mocked(assetMocks.recoverStandaloneAssetPublications).mockImplementationOnce(async () => {
    const stored = getStore('scenario_projects').get(project.id) as {
      project: typeof project;
      workspaceRevision: number;
    };
    getStore('scenario_projects').set(project.id, {
      ...stored,
      project: { ...stored.project, name: 'Recovered document publication' },
      workspaceRevision: stored.workspaceRevision + 1,
    });
    return 1;
  });

  const saved = await commitScenarioAggregateMutation(
    { ...initial.project, name: 'Metadata-only save' },
    { expectedRevision: 2 }
  );

  expect(saved.workspaceRevision).toBe(3);
  expect(saved.project.name).toBe('Metadata-only save');
});

it('guards snapshot commits and orphan cleanup against concurrent owners', async () => {
  const project = createGuideProject('Aggregate');
  const saved = await commitScenarioAggregateMutation(project);
  await expect(
    commitScenarioAggregateSnapshotMutation({
      baseProject: { ...saved.project, name: 'Wrong base' },
      children: { assetPuts: [createAsset(project.id, 'stale')] },
      nextProject: saved.project,
    })
  ).rejects.toMatchObject({ name: 'StaleScenarioAggregateRevisionError' });
  const assetMocks = await import('../assets');
  expect(assetMocks.discardPreparedAsset).toHaveBeenCalledWith('opfs-stale');
  await expect(
    commitScenarioAggregateSnapshotMutation({
      baseProject: saved.project,
      nextProject: { ...saved.project, id: 'other' },
    })
  ).rejects.toThrow('cannot change the project ID');

  const orphan = createAsset('missing', 'orphan');
  getStore('scenario_assets').set(orphan.id, orphan);
  await deleteOrphanedScenarioAggregateChild({ id: orphan.id, kind: 'asset' });
  expect(getStore('scenario_assets').has(orphan.id)).toBe(false);
  await expect(
    deleteOrphanedScenarioAggregateChild({ id: 'missing', kind: 'asset' })
  ).resolves.toBeUndefined();
  getStore('scenario_assets').set('invalid', { broken: true });
  await expect(
    deleteOrphanedScenarioAggregateChild({ id: 'invalid', kind: 'asset' })
  ).rejects.toThrow('cannot be safely removed');

  const owned = createDocument(project.id, 'owned');
  getStore('scenario_step_editor_documents').set(owned.stepId, {
    ...owned,
    document: createPersistedEditorDocumentFixture(owned.document, 'owned-source'),
  });
  await expect(
    deleteOrphanedScenarioAggregateChild({ id: owned.stepId, kind: 'editor-document' })
  ).rejects.toThrow('still belongs');
});

it('discards staged snapshot assets when the pre-handoff project read fails', async () => {
  const project = createGuideProject('Aggregate');
  db.get.mockRejectedValueOnce(new Error('scenario project read failed'));

  await expect(
    commitScenarioAggregateSnapshotMutation({
      baseProject: project,
      children: { assetPuts: [createAsset(project.id, 'read-failure')] },
      nextProject: project,
    })
  ).rejects.toThrow('scenario project read failed');

  const assetMocks = await import('../assets');
  expect(assetMocks.discardPreparedAsset).toHaveBeenCalledWith('opfs-read-failure');
});

it('discards staged snapshot assets when database initialization fails', async () => {
  const project = createGuideProject('Aggregate');
  const coreMocks = await import('../infrastructure/indexed-db/core');
  vi.mocked(coreMocks.initDB).mockRejectedValueOnce(new Error('database initialization failed'));

  await expect(
    commitScenarioAggregateSnapshotMutation({
      baseProject: project,
      children: { assetPuts: [createAsset(project.id, 'init-failure')] },
      nextProject: project,
    })
  ).rejects.toThrow('database initialization failed');

  const assetMocks = await import('../assets');
  expect(assetMocks.discardPreparedAsset).toHaveBeenCalledWith('opfs-init-failure');
});

it('retires a superseded ready journal so later scenario mutations can proceed', async () => {
  const project = createGuideProject('Aggregate');
  const initial = await commitScenarioAggregateMutation(project);
  const assetMocks = await import('../assets');
  vi.mocked(assetMocks.publishReadyJournalWithRetry).mockImplementationOnce(
    async (journal, publish) => {
      const current = getStore('scenario_projects').get(project.id) as {
        project: typeof project;
        workspaceRevision: number;
      };
      getStore('scenario_projects').set(project.id, {
        ...current,
        project: { ...current.project, name: 'Competing save' },
        workspaceRevision: 2,
      });
      await publish(journal);
    }
  );

  await expect(
    commitScenarioAggregateMutation(
      { ...initial.project, name: 'Asset save' },
      {
        children: { assetPuts: [createAsset(project.id, 'loser')] },
        expectedRevision: 1,
      }
    )
  ).rejects.toMatchObject({ name: 'StaleScenarioAggregateRevisionError' });

  const journal = await vi.mocked(assetMocks.createAssetPublicationJournal).mock.results.at(-1)
    ?.value;
  expect(journal).toBeDefined();
  getStore('asset_refs').set('opfs-loser', createAsset(project.id, 'loser').assetRef);
  await expect(scenarioAssetPublicationAdapter.publish(journal!)).rejects.toMatchObject({
    name: 'StaleScenarioAggregateRevisionError',
  });
  expect(assetMocks.deleteAssetObject).not.toHaveBeenCalledWith('opfs-loser');
  getStore('asset_refs').delete('opfs-loser');
  await expect(scenarioAssetPublicationAdapter.publish(journal!)).resolves.toBeUndefined();
  expect(assetMocks.deleteAssetObject).toHaveBeenCalledWith('opfs-loser');
  await expect(
    commitScenarioAggregateMutation(
      {
        ...(getStore('scenario_projects').get(project.id) as { project: typeof project }).project,
        name: 'Later save',
      },
      { expectedRevision: 2 }
    )
  ).resolves.toEqual(expect.objectContaining({ workspaceRevision: 3 }));
});

it('rejects malformed child arrays in a ready publication journal', async () => {
  const project = createGuideProject('Aggregate');
  const assetMocks = await import('../assets');
  await commitScenarioAggregateMutation(project, {
    children: { assetPuts: [createAsset(project.id)] },
    expectedRevision: null,
  });
  const journal = await vi.mocked(assetMocks.createAssetPublicationJournal).mock.results.at(-1)
    ?.value;
  expect(journal).toBeDefined();
  const payload = journal?.payload as Record<string, unknown>;
  const children = payload['children'] as Record<string, unknown>;

  for (const field of [
    'assetPuts',
    'assetDeletes',
    'editorDocumentPuts',
    'editorDocumentDeletes',
  ]) {
    await expect(
      scenarioAssetPublicationAdapter.publish({
        ...journal!,
        payload: { ...payload, children: { ...children, [field]: 'invalid' } },
      })
    ).rejects.toThrow('Invalid scenario asset publication payload');
  }
});

it('rejects malformed and mismatched editor assets in a ready journal', async () => {
  const project = createGuideProject('Aggregate');
  const assetMocks = await import('../assets');
  await commitScenarioAggregateMutation(project, {
    children: { editorDocumentPuts: [createDocument(project.id)] },
    expectedRevision: null,
  });
  const journal = await vi.mocked(assetMocks.createAssetPublicationJournal).mock.results.at(-1)
    ?.value;
  expect(journal).toBeDefined();
  const payload = journal?.payload as Record<string, unknown>;
  const children = payload['children'] as Record<string, unknown>;
  const documentPuts = children['editorDocumentPuts'] as Array<Record<string, unknown>>;

  await expect(
    scenarioAssetPublicationAdapter.publish({
      ...journal!,
      payload: {
        ...payload,
        children: {
          ...children,
          editorDocumentPuts: [{ ...documentPuts[0], assetRefs: 'invalid' }],
        },
      },
    })
  ).rejects.toThrow('Invalid scenario asset publication payload');
  await expect(
    scenarioAssetPublicationAdapter.publish({
      ...journal!,
      payload: {
        ...payload,
        children: {
          ...children,
          editorDocumentPuts: [{ ...documentPuts[0], assetRefs: [null] }],
        },
      },
    })
  ).rejects.toThrow('Invalid scenario asset publication payload');
  await expect(
    scenarioAssetPublicationAdapter.publish({
      ...journal!,
      assetRefs: journal!.assetRefs.map((assetRef: ReturnType<typeof createAsset>['assetRef']) => ({
        ...assetRef,
        assetId: `mismatch-${assetRef.assetId}`,
      })),
    })
  ).rejects.toThrow('Scenario editor document assets do not match its journal');
});

it('deletes the complete scenario aggregate graph', async () => {
  const project = createGuideProject('Aggregate');
  await commitScenarioAggregateMutation(project, {
    children: {
      assetPuts: [createAsset(project.id)],
      editorDocumentPuts: [createDocument(project.id)],
    },
  });
  getStore('scenario_exports').set('export-1', { id: 'export-1', projectId: project.id });
  getStore('aggregate_presentations').set(JSON.stringify(['scenario', project.id]), {
    aggregateId: project.id,
    aggregateKind: 'scenario',
    presentationRevision: 1,
  });
  await deleteScenarioAggregate(project.id);
  expect(getStore('scenario_projects').size).toBe(0);
  expect(getStore('scenario_assets').size).toBe(0);
  expect(getStore('scenario_exports').size).toBe(0);
  expect(getStore('scenario_step_editor_documents').size).toBe(0);
  expect(getStore('aggregate_presentations').size).toBe(0);
  expect(db.getAllFromIndex).not.toHaveBeenCalled();
  expect(db.transaction).toHaveBeenLastCalledWith(
    expect.arrayContaining([
      'scenario_projects',
      'scenario_assets',
      'scenario_exports',
      'scenario_step_editor_documents',
      'aggregate_presentations',
    ]),
    'readwrite'
  );
});

it('keeps graph discovery and failed deletion inside one rollback-capable transaction', async () => {
  const project = createGuideProject('Aggregate');
  await commitScenarioAggregateMutation(project, {
    children: { assetPuts: [createAsset(project.id)] },
  });
  getStore('aggregate_presentations').set(JSON.stringify(['scenario', project.id]), {
    aggregateId: project.id,
    aggregateKind: 'scenario',
  });
  const stagedDeletes = vi.fn();
  db.transaction.mockImplementationOnce((_names: string | string[]) => ({
    abort: vi.fn(),
    done: Promise.reject(new Error('transaction aborted')),
    objectStore: (name: string) => ({
      delete: stagedDeletes,
      get: async (id: unknown) => getStore(name).get(normalizeKey(id)),
      index: () => ({
        count: async () => 0,
        getAll: async (projectId: string) =>
          [...getStore(name).values()].filter(
            (value) => (value as { projectId?: string }).projectId === projectId
          ),
      }),
      put: async (_value: { id?: string; stepId?: string }) => undefined,
    }),
  }));

  await expect(deleteScenarioAggregate(project.id)).rejects.toThrow('transaction aborted');
  expect(stagedDeletes).toHaveBeenCalled();
  expect(getStore('scenario_projects').has(project.id)).toBe(true);
  expect(getStore('scenario_assets').has('asset-1')).toBe(true);
  expect(getStore('aggregate_presentations').size).toBe(1);
  expect(db.getAllFromIndex).not.toHaveBeenCalled();
});

it.each([2, 3])(
  'retires version %i publication without publishing content or deleting owned image bytes',
  async (version) => {
    const project = createGuideProject('Current');
    const assetMocks = await import('../assets');
    const committed = await commitScenarioAggregateMutation(project, {
      children: { assetPuts: [createAsset(project.id)] },
    });
    const journal = await vi.mocked(assetMocks.createAssetPublicationJournal).mock.results.at(-1)
      ?.value;
    if (!journal) throw new Error('Expected ready journal');
    const before = structuredClone(stores);
    await expect(
      scenarioAssetPublicationAdapter.publish({ ...journal, payload: { project: { version } } })
    ).resolves.toBeUndefined();
    expect(stores).toEqual(before);
    expect(assetMocks.deleteAssetObject).not.toHaveBeenCalled();
    expect(assetMocks.discardPreparedAsset).not.toHaveBeenCalled();
    await expect(
      commitScenarioAggregateMutation(
        { ...committed.project, name: 'Next save' },
        { expectedRevision: committed.workspaceRevision }
      )
    ).resolves.toEqual(
      expect.objectContaining({ workspaceRevision: committed.workspaceRevision + 1 })
    );
  }
);

it.each([4, 99])(
  'rejects malformed or future version %i journal payloads without removing owned bytes',
  async (version) => {
    const project = createGuideProject('Current');
    const assetMocks = await import('../assets');
    await commitScenarioAggregateMutation(project, {
      children: { assetPuts: [createAsset(project.id)] },
    });
    const journal = await vi.mocked(assetMocks.createAssetPublicationJournal).mock.results.at(-1)
      ?.value;
    if (!journal) throw new Error('Expected ready journal');
    const before = structuredClone(stores);
    await expect(
      scenarioAssetPublicationAdapter.publish({ ...journal, payload: { project: { version } } })
    ).rejects.toThrow('Invalid scenario asset publication payload');
    expect(stores).toEqual(before);
    expect(assetMocks.deleteAssetObject).not.toHaveBeenCalled();
  }
);
it('records previous committed content once and leaves history unchanged on exact replay', async () => {
  const first = await commitScenarioAggregateMutation(
    createGuideProject('First', 'history-guide', 1)
  );
  const second = await commitScenarioAggregateMutation(
    { ...first.project, name: 'Second' },
    { expectedUpdatedAt: first.project.updatedAt }
  );
  const saved = getStore('scenario_projects').get(first.project.id);
  expect(saved).toMatchObject({
    workspaceRevision: 2,
    history: [{ revision: 1, savedAt: first.project.updatedAt, project: first.project }],
  });
  await commitScenarioAggregateMutation(second.project, {
    expectedUpdatedAt: second.project.updatedAt,
  });
  expect(getStore('scenario_projects').get(first.project.id)).toEqual(saved);
});

it('retains saved-version assets and documents, then prunes only unreachable children after clear', async () => {
  const project = createGuideProject('Retention', 'retention', 1);
  const step = createGuideStep('Before', 'step');
  step.blocks.push(
    createGuideImageBlock({
      id: 'image',
      assetId: 'old',
      width: 10,
      height: 10,
      source: { kind: 'import', filename: 'old.png' },
      editDocumentId: 'old-document',
    })
  );
  project.items.push(step);
  const first = await commitScenarioAggregateMutation(project, {
    children: {
      assetPuts: [createAsset(project.id, 'old')],
      editorDocumentPuts: [createDocument(project.id, 'old-document')],
    },
  });
  const second = await commitScenarioAggregateMutation({ ...first.project, items: [] });
  const before = getStore('scenario_projects').get(project.id);
  expect(await pruneScenarioResources(project.id)).toBe(0);
  expect(getStore('scenario_projects').get(project.id)).toEqual(before);
  expect(getStore('scenario_assets').has('old')).toBe(true);
  const cleared = await clearScenarioSavedHistory(project.id, second.project.updatedAt);
  expect(cleared.updatedAt).toBeGreaterThan(second.project.updatedAt);
  expect(getStore('scenario_projects').get(project.id)).not.toHaveProperty('history');
  expect(await pruneScenarioResources(project.id)).toBe(2);
  expect(getStore('scenario_assets').has('old')).toBe(false);
  expect(getStore('scenario_step_editor_documents').has('old-document')).toBe(false);
  const physical = await import('../assets');
  expect(physical.completePhysicalDeleteOperation).toHaveBeenCalledWith(
    expect.objectContaining({
      assetIds: expect.arrayContaining(['opfs-old']),
    })
  );
});

it('preserves shared physical ownership and rejects stale history cleanup before deletion', async () => {
  const project = createGuideProject('Retention', 'shared-retention', 1);
  const first = await commitScenarioAggregateMutation(project, {
    children: { assetPuts: [createAsset(project.id, 'unused')] },
  });
  const sharedKey = JSON.stringify(['other-owner', 'other', 'body']);
  getStore('asset_owners').set(sharedKey, {
    assetId: 'opfs-unused',
    ownerKind: 'other-owner',
    ownerId: 'other',
    role: 'body',
  });
  await expect(clearScenarioSavedHistory(project.id, 0)).rejects.toMatchObject({
    name: 'StaleScenarioAggregateRevisionError',
  });
  expect(getStore('scenario_assets').has('unused')).toBe(true);
  expect(await pruneScenarioResources(project.id)).toBe(1);
  expect(getStore('asset_refs').has('opfs-unused')).toBe(true);
  expect(getStore('asset_owners').has(sharedKey)).toBe(true);
  const current = getStore('scenario_projects').get(project.id) as {
    workspaceRevision: number;
    history?: unknown;
  };
  expect(current.workspaceRevision).toBe(first.workspaceRevision + 1);
  expect(current.history).toBeUndefined();
});

it('protects tour-only image/audio/edit resources across saved history and prunes after removal', async () => {
  const { tourProject } = await import('./tour.test-support');
  const project = tourProject();
  const audio = {
    ...createAsset(project.id, 'audio'),
    width: 0,
    height: 0,
    duration: 3,
    mimeType: 'audio/webm',
  };
  audio.assetRef = { ...audio.assetRef, mimeType: 'audio/webm' };
  const first = await commitScenarioAggregateMutation(project, {
    children: {
      assetPuts: [createAsset(project.id, 'image'), audio],
      editorDocumentPuts: [createDocument(project.id, 'edit')],
    },
  });
  expect(await pruneScenarioResources(project.id)).toBe(0);
  const { tour: _tour, ...reference } = first.project;
  const second = await commitScenarioAggregateMutation(reference, {
    expectedRevision: first.workspaceRevision,
  });
  expect(await pruneScenarioResources(project.id)).toBe(0);
  expect(getStore('scenario_assets').has('audio')).toBe(true);
  await clearScenarioSavedHistory(project.id, second.project.updatedAt);
  expect(await pruneScenarioResources(project.id)).toBe(3);
  expect(getStore('scenario_assets').has('audio')).toBe(false);
});
