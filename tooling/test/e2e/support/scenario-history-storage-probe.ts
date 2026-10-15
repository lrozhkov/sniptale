import { openDB, type IDBPDatabase } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
} from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { handleDatabaseUpgrade } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core';
import { betaV18Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v18';
import { createGuideProject } from '../../../../apps/extension/src/features/scenario/project/public';
import { createGuideStep } from '../../../../apps/extension/src/features/scenario/project/factories';
import { probeScenarioUnitAdmission, probeScenarioUnitWrites } from './scenario-unit-storage-probe';
import { createScenarioProjectEntry } from '../../../../apps/extension/src/composition/persistence/scenario/projects/entry';
import { commitScenarioAggregateMutation } from '../../../../apps/extension/src/composition/persistence/scenario/aggregate-mutations';
import { deleteOrphanedScenarioAggregateChild } from '../../../../apps/extension/src/composition/persistence/scenario/aggregate-cleanup';
import { clearScenarioSavedHistory } from '../../../../apps/extension/src/composition/persistence/scenario/retention';
import { getScenarioProjectEntry } from '../../../../apps/extension/src/composition/persistence/scenario/projects/project';
import { readScenarioStorage } from '../../../../apps/extension/src/composition/persistence/scenario/storage';
import { parseScenarioProjectEntry } from '../../../../apps/extension/src/composition/persistence/scenario/read-guards';
import {
  writeBlobToAsset,
  readAssetFile,
} from '../../../../apps/extension/src/composition/persistence/assets';
import { createPersistedEditorDocumentFixture } from '../../../../apps/extension/src/composition/persistence/document-assets/test-support';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../apps/extension/src/features/editor/document/constants';

const headStore = 'scenario_projects';
const historyStore = 'scenario_project_history';
const graphStores = [
  headStore,
  historyStore,
  'scenario_project_units',
  'scenario_assets',
  'scenario_step_editor_documents',
  'asset_refs',
  'asset_owners',
  'asset_operations',
];

function observeRequests() {
  const put = IDBObjectStore.prototype.put;
  const remove = IDBObjectStore.prototype.delete;
  const writes: { store: string; bytes: number }[] = [];
  const deletes: { store: string; key: IDBValidKey | IDBKeyRange }[] = [];
  let successful = 0;
  let failDocumentDelete = false;
  let beforeFailure = 0;
  IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
    const request = key === undefined ? put.call(this, value) : put.call(this, value, key);
    writes.push({
      store: this.name,
      bytes: new TextEncoder().encode(JSON.stringify(value)).byteLength,
    });
    request.addEventListener('success', () => successful++);
    return request;
  };
  IDBObjectStore.prototype.delete = function (key) {
    if (failDocumentDelete && this.name === 'scenario_step_editor_documents') {
      beforeFailure = successful;
      throw new DOMException('Late native scenario failure', 'QuotaExceededError');
    }
    const request = remove.call(this, key);
    deletes.push({ store: this.name, key });
    request.addEventListener('success', () => successful++);
    return request;
  };
  return {
    writes,
    deletes,
    fail: () => {
      failDocumentDelete = true;
    },
    beforeFailure: () => beforeFailure,
    reset: () => {
      writes.length = deletes.length = 0;
      successful = beforeFailure = 0;
      failDocumentDelete = false;
    },
    restore: () => {
      IDBObjectStore.prototype.put = put;
      IDBObjectStore.prototype.delete = remove;
    },
  };
}

async function snapshot(db: IDBPDatabase) {
  const tx = db.transaction(graphStores, 'readonly');
  const values = await Promise.all(graphStores.map((name) => tx.objectStore(name).getAll()));
  await tx.done;
  return JSON.stringify(values);
}

async function admission() {
  const source = await openDB(DB_NAME, 18, {
    upgrade(db, old, next, tx) {
      handleDatabaseUpgrade(db, old, next, tx);
      db.deleteObjectStore(historyStore);
      db.deleteObjectStore('scenario_project_units');
      for (const [domainId, schemaVersion] of Object.entries(betaV18Fixture.domainVersions))
        tx.objectStore('schema_contracts').put({ domainId, schemaVersion });
    },
  });
  let entry = createScenarioProjectEntry({
    existing: undefined,
    project: {
      ...createGuideProject('Legacy', 'native-guide', 1),
      items: [createGuideStep('Retained native unit', 'native-step')],
    },
    updatedAt: 2,
  });
  for (let index = 0; index < 3; index++)
    entry = createScenarioProjectEntry({
      existing: entry,
      project: { ...entry.project, name: `Legacy ${index}` },
      updatedAt: index + 3,
    });
  await source.put(headStore, entry);
  const before = JSON.stringify(await source.get(headStore, entry.id));
  source.close();
  let aborted = false;
  try {
    await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, old, next, tx) {
        handleDatabaseUpgrade(db, old, next, tx);
        tx.abort();
      },
    });
  } catch {
    aborted = true;
  }
  const prior = await openDB(DB_NAME);
  const rollback =
    prior.version === 18 &&
    !prior.objectStoreNames.contains(historyStore) &&
    !prior.objectStoreNames.contains('scenario_project_units') &&
    before === JSON.stringify(await prior.get(headStore, entry.id));
  prior.close();
  const db = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  const retainedLegacy = before === JSON.stringify(await db.get(headStore, entry.id));
  const emptyHistory = await db.count(historyStore);
  return { db, entry, result: { aborted, rollback, retainedLegacy, emptyHistory } };
}

/** Exercises actual production mutation owners against native IndexedDB and OPFS. */
export async function probe() {
  const unitAdmission = await probeScenarioUnitAdmission();
  const admitted = await admission();
  const { db, entry } = admitted;
  const observed = observeRequests();
  try {
    const readonlyBefore = await snapshot(db);
    const legacy = await getScenarioProjectEntry(entry.id);
    const legacyReadonly =
      readonlyBefore === (await snapshot(db)) &&
      observed.writes.length === 0 &&
      observed.deletes.length === 0 &&
      JSON.stringify(legacy) === JSON.stringify(parseScenarioProjectEntry(entry));
    let published = await commitScenarioAggregateMutation(
      { ...entry.project, name: 'Baseline' },
      { expectedRevision: entry.workspaceRevision }
    );
    const retained = JSON.stringify(await db.getAll(historyStore));
    observed.reset();
    published = await commitScenarioAggregateMutation(
      { ...published.project, name: 'Changed name' },
      { expectedRevision: published.workspaceRevision }
    );
    const appendWrites = [...observed.writes];
    const afterRows = await db.getAll(historyStore);
    const unchangedRows = retained === JSON.stringify(afterRows.slice(0, -1));
    const logical = await getScenarioProjectEntry(entry.id);
    observed.reset();
    const replay = await commitScenarioAggregateMutation(published.project, {
      expectedRevision: published.workspaceRevision,
    });
    const noop =
      observed.writes.length === 0 &&
      observed.deletes.length === 0 &&
      replay.workspaceRevision === published.workspaceRevision;

    const canary = 'Native scenario history resource canary';
    const prepared = await writeBlobToAsset(new Blob([canary], { type: 'image/png' }));
    const document = createPersistedEditorDocumentFixture(
      {
        version: 2,
        sourceImageData: 'data:image/png;base64,YQ==',
        sourceName: null,
        sourceWidth: 10,
        sourceHeight: 10,
        sourceLeft: 0,
        sourceTop: 0,
        sourceDisplayWidth: 10,
        sourceDisplayHeight: 10,
        canvasWidth: 10,
        canvasHeight: 10,
        canvasJson: '{}',
        frame: DEFAULT_EDITOR_FRAME_SETTINGS,
        browserFrame: DEFAULT_BROWSER_FRAME_STATE,
      },
      prepared.ref.assetId
    );
    const seed = db.transaction(
      [
        'scenario_step_editor_documents',
        'scenario_assets',
        'asset_refs',
        'asset_owners',
        historyStore,
      ],
      'readwrite'
    );
    await seed.objectStore('scenario_step_editor_documents').put({
      stepId: 'native-document',
      projectId: entry.id,
      document,
      createdAt: 1,
      updatedAt: 1,
    });
    await seed.objectStore('asset_refs').put(prepared.ref);
    for (const [ownerKind, ownerId] of [
      ['scenario-editor-document', 'native-document'],
      ['scenario-asset', 'orphan-child'],
    ])
      await seed.objectStore('asset_owners').put({
        ownerKind,
        ownerId,
        role: ownerKind === 'scenario-asset' ? 'body' : 'source',
        assetId: prepared.ref.assetId,
      });
    await seed.objectStore('scenario_assets').put({
      id: 'orphan-child',
      projectId: 'orphan-guide',
      assetId: prepared.ref.assetId,
      galleryAssetId: null,
      mimeType: 'image/png',
      size: prepared.ref.size,
      width: 10,
      height: 10,
      createdAt: 1,
    });
    await seed.objectStore(historyStore).put({
      projectId: 'orphan-guide',
      revision: 1,
      savedAt: 1,
      project: createGuideProject('Retained orphan', 'orphan-guide', 1),
    });
    await seed.done;
    const beforeOrphan = await snapshot(db);
    observed.reset();
    let orphanRefused = false;
    try {
      await deleteOrphanedScenarioAggregateChild({ id: 'orphan-child', kind: 'asset' });
    } catch {
      orphanRefused = true;
    }
    const orphan = {
      refused: orphanRefused,
      zeroWrites: observed.writes.length === 0 && observed.deletes.length === 0,
      graphUnchanged: beforeOrphan === (await snapshot(db)),
      bytesUnchanged: (await (await readAssetFile(prepared.ref, 'canary.png')).text()) === canary,
    };

    const beforeFailure = await snapshot(db);
    observed.reset();
    observed.fail();
    let failure = '';
    try {
      await commitScenarioAggregateMutation(
        {
          ...published.project,
          name: 'Must roll back',
          items: [{ ...createGuideStep('Rollback unit', 'native-step') }],
        },
        {
          expectedRevision: published.workspaceRevision,
          children: { editorDocumentDeletes: ['native-document'] },
        }
      );
    } catch (error) {
      failure = error instanceof Error ? error.name : 'unknown';
    }
    const rollback = beforeFailure === (await snapshot(db));
    const successfulRequestsBeforeFailure = observed.beforeFailure();
    const bytesAfterRollback =
      (await (await readAssetFile(prepared.ref, 'canary.png')).text()) === canary;
    const failedUnitWrites = observed.writes.filter(
      (row) => row.store === 'scenario_project_units'
    ).length;
    const unitProof = await probeScenarioUnitWrites(db, observed, prepared.ref, canary);
    observed.reset();

    for (let index = 0; index < 52; index++)
      published = await commitScenarioAggregateMutation(
        { ...published.project, name: `Retained ${index}` },
        { expectedRevision: published.workspaceRevision }
      );
    const retainedCount = (await getScenarioProjectEntry(entry.id))?.history?.length;
    const physicalCount = (await db.getAllFromIndex(historyStore, 'projectId', entry.id)).length;
    await clearScenarioSavedHistory(entry.id, published.project.updatedAt);
    const cleared =
      (await db.getAllFromIndex(historyStore, 'projectId', entry.id)).length === 0 &&
      !(await getScenarioProjectEntry(entry.id))?.history?.length;
    const orphanRetained =
      (await db.getAllFromIndex(historyStore, 'projectId', 'orphan-guide')).length === 1;
    const head = await db.get(headStore, entry.id);
    const revision = head.workspaceRevision;
    await db.put(historyStore, {
      projectId: entry.id,
      revision: revision - 1,
      savedAt: 1,
      project: { version: 99 },
    });
    const corruptBefore = await snapshot(db);
    const tx = db.transaction([headStore, historyStore, 'scenario_project_units'], 'readonly');
    const corrupted = await readScenarioStorage(tx, entry.id);
    await tx.done;
    observed.reset();
    let corruptRefused = false;
    try {
      await commitScenarioAggregateMutation(
        { ...published.project, name: 'Refuse corruption' },
        { expectedRevision: revision }
      );
    } catch {
      corruptRefused = true;
    }
    const corruption = {
      invalid: parseScenarioProjectEntry(corrupted.logical) === null,
      refused: corruptRefused,
      zeroWrites: observed.writes.length === 0 && observed.deletes.length === 0,
      preserved: corruptBefore === (await snapshot(db)),
    };
    return {
      admission: admitted.result,
      unitAdmission,
      unitProof,
      failedUnitWrites,
      legacyReadonly,
      appendWrites,
      unchangedRows,
      logicalHistoryLength: logical?.history?.length,
      noop,
      orphan,
      failure,
      rollback,
      successfulRequestsBeforeFailure,
      bytesAfterRollback,
      retainedCount,
      physicalCount,
      cleared,
      orphanRetained,
      corruption,
    };
  } finally {
    observed.restore();
    db.close();
  }
}
