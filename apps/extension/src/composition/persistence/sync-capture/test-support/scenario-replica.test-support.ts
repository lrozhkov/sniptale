import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createReviewWorkspaceStoreFixture } from '../../review-workspaces/store.test-support';
import { createGuideProject } from '../../../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../../scenario/projects/entry';
import { readScenarioStorage } from '../../scenario/storage';
import { parseScenarioProjectEntry } from '../../scenario/read-guards';
import type { ApplyPreparedScenarioReplicaInput } from '../apply-scenario';

/** Share one native Scenario fixture between publication tests and editor consumer tests. */
export function createScenarioReplicaFixture() {
  let failReceipt = false;
  let captureWrites = 0;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => name === 'sync_capture' && failReceipt && ++captureWrites === 2
  );
  for (const name of [
    'scenario_projects',
    'scenario_project_history',
    'scenario_project_units',
    'scenario_exports',
    'scenario_step_editor_documents',
    'web_snapshots',
  ])
    fixture.rows.set(name, new Map());
  const database = {
    get: async (name: string, id: string) => fixture.rows.get(name)?.get(id),
    transaction(names: string[], mode: string) {
      const tx = fixture.database.transaction(names, mode);
      return {
        abort: () => tx.abort(),
        get done() {
          return tx.done;
        },
        objectStore(name: string) {
          const store = tx.objectStore(name);
          if (name !== 'scenario_project_history' && name !== 'scenario_project_units')
            return store;
          const nativeRow = (value: unknown) => {
            if (!isRecord(value)) return value;
            const { id: _fixtureKey, ...native } = value;
            return native;
          };
          return {
            ...store,
            get: async (key: IDBValidKey) => nativeRow(await store.get(key)),
            getAll: async () => (await store.getAll()).map(nativeRow),
            index: (name: string) => {
              const index = store.index(name);
              return {
                ...index,
                getAll: async (key: IDBValidKey) => (await index.getAll(key)).map(nativeRow),
              };
            },
            put: async (value: unknown) => {
              if (!isRecord(value)) throw new Error('Invalid Scenario row');
              const id = JSON.stringify(
                name === 'scenario_project_units'
                  ? [value['projectId'], value['unitId'], value['revision']]
                  : [value['projectId'], value['revision']]
              );
              return store.put({ ...value, id });
            },
          };
        },
      };
    },
  };
  let pending: Promise<unknown> = Promise.resolve();
  function mutate<T>(effect: (db: typeof database) => Promise<T>): Promise<T> {
    const result = pending.then(() => effect(database));
    pending = result.catch(() => undefined);
    return result;
  }
  fixture.rows.get('sync_capture')!.set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 1,
  });
  const project = createGuideProject('Remote guide', 'guide', 100);
  const entry = createScenarioProjectEntry({ project, existing: undefined, updatedAt: 100 });
  const input: ApplyPreparedScenarioReplicaInput = {
    spaceId: 'space',
    profileCreatedAt: 1,
    connectionGeneration: 1,
    operationId: 'first-operation',
    sourceDigest: 'a'.repeat(64),
    expectedBasis: [],
    expectedLocalGeneration: 0,
    expectedWorkspaceRevision: null,
    dependencies: [],
    root: { entry, assets: [], exports: [], exportRefs: [], stepDocuments: [], thumbnails: [] },
  };
  async function current() {
    const tx = database.transaction(
      ['scenario_projects', 'scenario_project_history', 'scenario_project_units'],
      'readonly'
    );
    const raw = (await readScenarioStorage(tx, project.id)).logical;
    await tx.done;
    return parseScenarioProjectEntry(raw);
  }
  return {
    fixture,
    database,
    input,
    current,
    mutate,
    fail: () => {
      captureWrites = 0;
      failReceipt = true;
    },
    resume: () => {
      failReceipt = false;
    },
  };
}
