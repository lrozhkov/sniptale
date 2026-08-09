import { beforeEach, expect, it, vi } from 'vitest';
import { createScenarioProject } from '../../../features/scenario/project/factories/project';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';

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
            getAll: async (projectId: string) =>
              [...getStore(name).values()].filter(
                (value) => (value as { projectId?: string }).projectId === projectId
              ),
          }),
          put: async (value: { id?: string; stepId?: string }) => {
            getStore(name).set(value.id ?? value.stepId ?? '', value);
          },
        };
      },
    };
  }),
};

vi.mock('../infrastructure/indexed-db/core', () => ({
  AGGREGATE_PRESENTATIONS_STORE: 'aggregate_presentations',
  SCENARIO_ASSETS_STORE: 'scenario_assets',
  SCENARIO_EXPORTS_STORE: 'scenario_exports',
  SCENARIO_PROJECTS_STORE: 'scenario_projects',
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE: 'scenario_step_editor_documents',
  initDB: vi.fn(async () => db),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: vi.fn(async (effect) => effect(db)),
}));

import {
  commitScenarioAggregateMutation,
  commitScenarioAggregateSnapshotMutation,
  deleteOrphanedScenarioAggregateChild,
  deleteScenarioAggregate,
} from './aggregate-mutations';

function createAsset(projectId: string, id = 'asset-1') {
  const blob = new Blob(['asset'], { type: 'image/png' });
  return {
    blob,
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
      version: 1 as const,
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

it('guards snapshot commits and orphan cleanup against concurrent owners', async () => {
  const project = createScenarioProject('Aggregate');
  const saved = await commitScenarioAggregateMutation(project);
  await expect(
    commitScenarioAggregateSnapshotMutation({
      baseProject: { ...saved.project, name: 'Wrong base' },
      nextProject: saved.project,
    })
  ).rejects.toMatchObject({ name: 'StaleScenarioAggregateRevisionError' });
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

  const owned = createDocument(project.id, 'owned');
  getStore('scenario_step_editor_documents').set(owned.stepId, owned);
  await expect(
    deleteOrphanedScenarioAggregateChild({ id: owned.stepId, kind: 'editor-document' })
  ).rejects.toThrow('still belongs');
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
