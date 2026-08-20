import { beforeEach, expect, it, vi } from 'vitest';
import { createScenarioProject } from '../../../features/scenario/project/factories/project';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';

const stores = vi.hoisted(() => new Map<string, Map<string, unknown>>());

function getStore(name: string) {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store;
}

function normalizeKey(key: unknown): string {
  return typeof key === 'string' ? key : JSON.stringify(key);
}

const db = {
  get: vi.fn(async (name: string, id: string) => getStore(name).get(id)),
  getAllFromIndex: vi.fn(async (name: string, _index: string, projectId: string) =>
    [...getStore(name).values()].filter(
      (value) => (value as { projectId?: string }).projectId === projectId
    )
  ),
  transaction: vi.fn((names: string | string[]) => {
    const allowed = new Set(Array.isArray(names) ? names : [names]);
    return {
      done: Promise.resolve(),
      objectStore: (name: string) => {
        if (!allowed.has(name)) throw new Error(`Unexpected store ${name}`);
        return {
          delete: async (id: unknown) => void getStore(name).delete(normalizeKey(id)),
          get: async (id: unknown) => getStore(name).get(normalizeKey(id)),
          index: () => ({
            count: async (assetId: string) =>
              [...getStore(name).values()].filter(
                (value) => (value as { assetId?: string }).assetId === assetId
              ).length,
            getAll: async (projectId: string) =>
              [...getStore(name).values()].filter(
                (value) => (value as { projectId?: string }).projectId === projectId
              ),
          }),
          put: async (value: {
            assetId?: string;
            id?: string;
            operationId?: string;
            ownerId?: string;
            ownerKind?: string;
            role?: string;
            stepId?: string;
          }) => {
            const key =
              value.id ??
              value.stepId ??
              value.operationId ??
              (value.ownerKind
                ? JSON.stringify([value.ownerKind, value.ownerId, value.role])
                : value.assetId) ??
              '';
            getStore(name).set(key, value);
          },
        };
      },
    };
  }),
};

vi.mock('../infrastructure/indexed-db/core', () => ({
  AGGREGATE_PRESENTATIONS_STORE: 'aggregate_presentations',
  ASSET_OPERATIONS_STORE: 'asset_operations',
  ASSET_OWNERS_STORE: 'asset_owners',
  ASSET_REFS_STORE: 'asset_refs',
  SCENARIO_ASSETS_STORE: 'scenario_assets',
  SCENARIO_EXPORTS_STORE: 'scenario_exports',
  SCENARIO_PROJECTS_STORE: 'scenario_projects',
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE: 'scenario_step_editor_documents',
  initDB: vi.fn(async () => db),
}));

vi.mock('../assets', () => ({
  buildPhysicalDeleteOperation: () => ({
    assetIds: [],
    createdAt: 1,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 1,
  }),
  completePhysicalDeleteOperation: vi.fn(async () => undefined),
  createAssetPublicationJournal: vi.fn(async (args) => ({
    ...args,
    createdAt: 1,
    journalId: 'journal-1',
  })),
  deleteAssetObject: vi.fn(async () => undefined),
  discardPreparedAsset: vi.fn(async () => undefined),
  parseAssetRef: (value: unknown) => value,
  publishReadyJournalWithRetry: vi.fn(async (journal, publish) => publish(journal)),
  recoverStandaloneAssetPublications: vi.fn(async () => 0),
  releaseAssetReadyProtection: vi.fn(),
  writeBlobToAsset: vi.fn(async (blob: Blob) => {
    const assetId = `editor-${getStore('prepared_editor_assets').size + 1}`;
    getStore('prepared_editor_assets').set(assetId, blob);
    return {
      ref: {
        assetId,
        createdAt: 1,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
        mimeType: blob.type || 'application/octet-stream',
        sha256: null,
        size: blob.size,
      },
    };
  }),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: vi.fn(async (effect) => effect(db)),
}));

import {
  commitScenarioAggregateMutation,
  commitScenarioAggregateSnapshotMutation,
  scenarioAssetPublicationAdapter,
} from './aggregate-mutations';
import { deleteOrphanedScenarioAggregateChild, deleteScenarioAggregate } from './aggregate-cleanup';

function createAsset(projectId: string, id = 'asset-1') {
  const blob = new Blob(['asset'], { type: 'image/png' });
  const assetId = `opfs-${id}`;
  return {
    assetId,
    assetRef: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      mimeType: 'image/png',
      sha256: null,
      size: blob.size,
    },
    createdAt: 1,
    galleryAssetId: null,
    height: 10,
    id,
    mimeType: 'image/png',
    projectId,
    size: blob.size,
    width: 10,
  };
}

function createDocument(projectId: string, stepId = 'step-1') {
  return {
    createdAt: 1,
    document: {
      browserFrame: DEFAULT_BROWSER_FRAME_STATE,
      canvasHeight: 10,
      canvasJson: '{}',
      canvasWidth: 10,
      frame: DEFAULT_EDITOR_FRAME_SETTINGS,
      sourceDisplayHeight: 10,
      sourceDisplayWidth: 10,
      sourceHeight: 10,
      sourceImageData: 'data:image/png;base64,YQ==',
      sourceLeft: 0,
      sourceName: null,
      sourceTop: 0,
      sourceWidth: 10,
      version: 2 as const,
    },
    projectId,
    stepId,
    updatedAt: 1,
  };
}

beforeEach(() => {
  stores.clear();
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(100);
});

it('commits root and owned children, preserves document creation, and accepts exact replay', async () => {
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
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

it('rejects a document preparation failure before publication handoff', async () => {
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Cold runtime');
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
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
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
  const project = createScenarioProject('Aggregate');
  await commitScenarioAggregateMutation(project, {
    children: { assetPuts: [createAsset(project.id)] },
  });
  getStore('aggregate_presentations').set(JSON.stringify(['scenario', project.id]), {
    aggregateId: project.id,
    aggregateKind: 'scenario',
  });
  const stagedDeletes = vi.fn();
  db.transaction.mockImplementationOnce((_names: string | string[]) => ({
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
