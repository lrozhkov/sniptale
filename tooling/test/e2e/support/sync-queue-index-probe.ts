import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import { inspectSupportedSourceDatabase } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/source-inspection';
import { betaV50Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v50';
import { evaluateDatabaseMigrationPlan } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/admission';
import { buildDatabaseMigrationPlan } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/schema-contracts';
import { handleDatabaseUpgrade } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core';
import { DB_NAME } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { createMediaLibraryEntry } from '../../../../apps/extension/src/composition/persistence/projects/index.storage.test-support';
import {
  fingerprintNativeCapture,
  hashCaptureText,
  parseSyncCaptureRecord,
} from '../../../../apps/extension/src/composition/persistence/sync-capture/guards';
import {
  captureRootKey,
  pendingCheckpointKey,
  type CaptureOperation,
  type CapturedChange,
} from '../../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import {
  queueConnectionKey,
  queueOperationKey,
  parseSyncQueueConnection,
  parseSyncQueueOperation,
  type SyncQueueScope,
} from '../../../../apps/extension/src/composition/persistence/sync-capture/queue-model';
import { readSyncQueueSummaryInTransaction } from '../../../../apps/extension/src/composition/persistence/sync-capture/queue-summary';

const captureStore = 'sync_capture';
const queueStore = 'sync_outbox';
const connectionStore = 'sync_connection';
const capturePhaseIndex = 'syncCaptureScopePhase';
const pendingDueIndex = 'syncPendingScopeDue';
const queueStatusIndex = 'syncQueueScopeStatus';
const summaryStores = [captureStore, queueStore, connectionStore];
const authorization = { incarnation: '11111111-1111-4111-8111-111111111111', revision: 1 };
const defaultScope: SyncQueueScope = {
  spaceId: 'native-index-space',
  connectionGeneration: 2,
  profileCreatedAt: 1,
};
const statuses = [
  'queued',
  'running',
  'paused',
  'cancelled',
  'failed',
  'interrupted',
  'published',
] as const;
const blobText = 'native queue index migration keeps original bytes';

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}
async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}
async function integrity(db: IDBPDatabase) {
  const stores = [...summaryStores, 'media_library'];
  const tx = db.transaction(stores, 'readonly');
  const rows = await Promise.all(
    stores.map(async (name) => [name, await tx.objectStore(name).getAll()] as const)
  );
  await tx.done;
  const blobs: Array<{ path: string; size: number; type: string; sha256: string }> = [];
  async function canonical(value: unknown, path: string): Promise<unknown> {
    if (value instanceof Blob) {
      blobs.push({
        path,
        size: value.size,
        type: value.type,
        sha256: await hashBytes(await value.arrayBuffer()),
      });
      return { blobSize: value.size, blobType: value.type };
    }
    if (Array.isArray(value))
      return Promise.all(value.map((item, index) => canonical(item, `${path}/${index}`)));
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(async ([key, item]) => [key, await canonical(item, `${path}/${key}`)])
        )
      );
    }
    return value;
  }
  const metadata = JSON.stringify(await canonical(Object.fromEntries(rows), 'stores'));
  return {
    metadataSha256: await hashBytes(new TextEncoder().encode(metadata).buffer),
    blobs: blobs.sort((left, right) => left.path.localeCompare(right.path)),
    counts: Object.fromEntries(rows.map(([name, values]) => [name, values.length])),
  };
}
function capture(
  id: string,
  phase: CaptureOperation['phase'],
  scope = defaultScope,
  original?: Blob
): CaptureOperation {
  const rootId = `root-${id}`;
  const header = {
    version: 1 as const,
    kind: 'sync-operation' as const,
    key: JSON.stringify(['change', id]),
    createdAt: 10,
    ...scope,
    sourceSha256: 'a'.repeat(64),
    source: {
      changeKind: original ? ('image' as const) : ('tombstone' as const),
      label: `Native operation ${id}`,
    },
    rootKind: 'media' as const,
    rootId,
    rootKey: captureRootKey(scope.spaceId, 'media', rootId),
    generation: 1,
    operationId: id,
    basis: [],
    origin: 'local-edit' as const,
    publicationId: null,
  };
  let operation: CaptureOperation;
  if (phase === 'native') {
    const native: CapturedChange = {
      ...header,
      phase,
      change: original
        ? {
            kind: 'image',
            rows: {
              media: createMediaLibraryEntry({
                id: rootId,
                kind: 'image',
                source: { kind: 'screenshot' },
                blob: original,
                size: original.size,
                mimeType: original.type,
                width: 1,
                height: 1,
              }),
              workspace: null,
              presentation: null,
              refs: [],
            },
          }
        : { kind: 'tombstone' },
    };
    operation = { ...native, sourceSha256: fingerprintNativeCapture(native) };
  } else if (phase === 'prepared') {
    operation = {
      ...header,
      phase,
      prepared: { recordText: '{}', recordSha256: hashCaptureText('{}'), objects: [] },
    };
  } else {
    operation = {
      ...header,
      phase,
      publication: {
        kind: 'verified',
        acceptedAt: 20,
        preparedSha256: 'b'.repeat(64),
        attemptId: '22222222-2222-4222-8222-222222222222',
        recordKey: `Records/${id}.json`,
        recordSha256: 'c'.repeat(64),
      },
      objects: [],
    };
  }
  if (!parseSyncCaptureRecord(operation))
    throw new Error(`Invalid canonical capture fixture: ${id}`);
  return operation;
}
function queue(operation: CaptureOperation, status: (typeof statuses)[number] = 'published') {
  const scope = {
    spaceId: operation.spaceId,
    connectionGeneration: operation.connectionGeneration,
    profileCreatedAt: operation.profileCreatedAt,
  };
  return requireValue(
    parseSyncQueueOperation({
      ...scope,
      version: 1,
      kind: 'queue-operation',
      key: queueOperationKey(scope, operation.operationId),
      operationId: operation.operationId,
      captureKey: operation.key,
      captureSha256: hashCaptureText(JSON.stringify(operation)),
      rootKey: operation.rootKey,
      generation: operation.generation,
      revision: 1,
      status,
      stage: status === 'published' ? 'published' : 'queued',
      runId: null,
      authorization,
      writeStarted: status === 'published',
      outcome: status === 'published' ? 'verified' : 'none',
      attemptId: null,
      failureCode: status === 'failed' ? 'temporary' : null,
      nextDueAt: null,
      automaticRetryCount: 0,
      eventSequence: 0,
      pendingTransitions: [],
      droppedTransitions: 0,
    }),
    'Invalid canonical queue fixture'
  );
}
function pending(id: string, dueAt: number, scope = defaultScope) {
  const rootId = `pending-${id}`;
  const rootKey = captureRootKey(scope.spaceId, 'media', rootId);
  return requireValue(
    parseSyncCaptureRecord({
      version: 1,
      kind: 'pending-checkpoint',
      key: pendingCheckpointKey(rootKey),
      createdAt: 1,
      ...scope,
      rootKind: 'media',
      rootId,
      rootKey,
      revision: crypto.randomUUID(),
      dueAt,
    }),
    'Invalid canonical pending fixture'
  );
}
async function installControl(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  scope = defaultScope,
  enrollmentComplete = true,
  selectedAuthorization = authorization
) {
  await tx.objectStore(captureStore).put({
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: scope.profileCreatedAt,
    enabled: true,
    spaceId: scope.spaceId,
    connectionGeneration: scope.connectionGeneration,
  });
  await tx.objectStore(connectionStore).put({
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'alice',
      ...scope,
    },
    identity: selectedAuthorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '33333333-3333-4333-8333-333333333333',
  });
  await tx.objectStore(queueStore).put(
    requireValue(
      parseSyncQueueConnection({
        ...scope,
        version: 1,
        kind: 'queue-connection',
        key: queueConnectionKey(scope),
        revision: 1,
        paused: false,
        scheduleProgress: {
          authorization: selectedAuthorization,
          revision: 1,
          afterKey: null,
          complete: true,
          dueAfter: null,
        },
        captureProgress: { authorization: selectedAuthorization, revision: 1, afterKey: null },
        checkpointProgress: { authorization: selectedAuthorization, revision: 1, afterKey: null },
        enrollmentProgress: {
          authorization: selectedAuthorization,
          revision: 1,
          source: enrollmentComplete ? 'complete' : 'media',
          afterKey: null,
        },
        eventSequence: 0,
        pendingTransitions: [],
        droppedTransitions: 0,
      }),
      'Invalid canonical control fixture'
    )
  );
}
async function publishedDataset(
  db: IDBPDatabase,
  count: number,
  enrollmentComplete = true,
  scope = defaultScope
) {
  const tx = db.transaction(summaryStores, 'readwrite');
  await Promise.all(summaryStores.map((name) => tx.objectStore(name).clear()));
  await installControl(tx, scope, enrollmentComplete);
  for (let index = 0; index < count; index++) {
    const operation = capture(`published-${index.toString().padStart(4, '0')}`, 'published', scope);
    await tx.objectStore(captureStore).put(operation);
    await tx.objectStore(queueStore).put(queue(operation));
  }
  await tx.done;
}
/** Count actual native requests and refuse capture values, credentials, writes and Blob reads in the projection. */
async function summary(db: IDBPDatabase, firstIndexCount?: () => void) {
  let firstIndexCountObserved = false;
  let requests = 0;
  let captureValueReads = 0;
  let credentialReads = 0;
  const storeGet = IDBObjectStore.prototype.get;
  const storeCount = IDBObjectStore.prototype.count;
  const storeGetAll = IDBObjectStore.prototype.getAll;
  const storeGetAllKeys = IDBObjectStore.prototype.getAllKeys;
  const storeOpenCursor = IDBObjectStore.prototype.openCursor;
  const storeOpenKeyCursor = IDBObjectStore.prototype.openKeyCursor;
  const indexCount = IDBIndex.prototype.count;
  const indexGet = IDBIndex.prototype.get;
  const indexGetAll = IDBIndex.prototype.getAll;
  const indexGetAllKeys = IDBIndex.prototype.getAllKeys;
  const indexOpenCursor = IDBIndex.prototype.openCursor;
  const indexOpenKeyCursor = IDBIndex.prototype.openKeyCursor;
  const originalFetch = globalThis.fetch;
  const blobArrayBuffer = Blob.prototype.arrayBuffer;
  const blobTextMethod = Blob.prototype.text;
  function inspect(store: string, method: string, key?: IDBValidKey | IDBKeyRange | null) {
    requests++;
    if (!summaryStores.includes(store))
      throw new Error('Projection entered an unrelated native store');
    if (store === connectionStore && method === 'get' && key !== 'connection') {
      credentialReads++;
      throw new Error('Credential reads are forbidden');
    }
    if (
      store === captureStore &&
      (method === 'get' ? key !== 'profile' : ['getAll', 'openCursor'].includes(method))
    ) {
      captureValueReads++;
      throw new Error('Capture value reads are forbidden');
    }
  }
  IDBObjectStore.prototype.get = function (key) {
    inspect(this.name, 'get', key);
    return storeGet.call(this, key);
  };
  IDBObjectStore.prototype.count = function (key) {
    inspect(this.name, 'count', key);
    return storeCount.call(this, key);
  };
  IDBObjectStore.prototype.getAll = function (key, count) {
    inspect(this.name, 'getAll', key);
    return storeGetAll.call(this, key, count);
  };
  IDBObjectStore.prototype.getAllKeys = function (key, count) {
    inspect(this.name, 'getAllKeys', key);
    return storeGetAllKeys.call(this, key, count);
  };
  IDBObjectStore.prototype.openCursor = function (key, direction) {
    inspect(this.name, 'openCursor', key);
    return storeOpenCursor.call(this, key, direction);
  };
  IDBObjectStore.prototype.openKeyCursor = function (key, direction) {
    inspect(this.name, 'openKeyCursor', key);
    return storeOpenKeyCursor.call(this, key, direction);
  };
  IDBIndex.prototype.count = function (key) {
    inspect(this.objectStore.name, 'count', key);
    if (!firstIndexCountObserved) {
      firstIndexCountObserved = true;
      firstIndexCount?.();
    }
    return indexCount.call(this, key);
  };
  IDBIndex.prototype.get = function (key) {
    if (this.objectStore.name === captureStore) {
      captureValueReads++;
      throw new Error('Capture index values are forbidden');
    }
    inspect(this.objectStore.name, 'get', key);
    return indexGet.call(this, key);
  };
  IDBIndex.prototype.getAll = function (key, count) {
    inspect(this.objectStore.name, 'getAll', key);
    return indexGetAll.call(this, key, count);
  };
  IDBIndex.prototype.getAllKeys = function (key, count) {
    inspect(this.objectStore.name, 'getAllKeys', key);
    return indexGetAllKeys.call(this, key, count);
  };
  IDBIndex.prototype.openCursor = function (key, direction) {
    inspect(this.objectStore.name, 'openCursor', key);
    return indexOpenCursor.call(this, key, direction);
  };
  IDBIndex.prototype.openKeyCursor = function (key, direction) {
    inspect(this.objectStore.name, 'openKeyCursor', key);
    return indexOpenKeyCursor.call(this, key, direction);
  };
  globalThis.fetch = async function () {
    throw new Error('Projection attempted HTTP');
  };
  Blob.prototype.arrayBuffer = function () {
    throw new Error('Projection read Blob bytes');
  };
  Blob.prototype.text = function () {
    throw new Error('Projection read Blob text');
  };
  try {
    const tx = db.transaction(summaryStores, 'readonly');
    const value = await readSyncQueueSummaryInTransaction(tx);
    await tx.done;
    return { value, requests, captureValueReads, credentialReads };
  } finally {
    IDBObjectStore.prototype.get = storeGet;
    IDBObjectStore.prototype.count = storeCount;
    IDBObjectStore.prototype.getAll = storeGetAll;
    IDBObjectStore.prototype.getAllKeys = storeGetAllKeys;
    IDBObjectStore.prototype.openCursor = storeOpenCursor;
    IDBObjectStore.prototype.openKeyCursor = storeOpenKeyCursor;
    IDBIndex.prototype.count = indexCount;
    IDBIndex.prototype.get = indexGet;
    IDBIndex.prototype.getAll = indexGetAll;
    IDBIndex.prototype.getAllKeys = indexGetAllKeys;
    IDBIndex.prototype.openCursor = indexOpenCursor;
    IDBIndex.prototype.openKeyCursor = indexOpenKeyCursor;
    globalThis.fetch = originalFetch;
    Blob.prototype.arrayBuffer = blobArrayBuffer;
    Blob.prototype.text = blobTextMethod;
  }
}
function wholePendingScope(scope: SyncQueueScope) {
  return IDBKeyRange.bound(
    ['pending-checkpoint', scope.spaceId, scope.connectionGeneration, scope.profileCreatedAt],
    ['pending-checkpoint', scope.spaceId, scope.connectionGeneration, scope.profileCreatedAt + 1],
    false,
    true
  );
}
async function indexedCounts(db: IDBPDatabase, scope = defaultScope) {
  const tx = db.transaction([captureStore, queueStore], 'readonly');
  const captureIndex = tx.objectStore(captureStore).index(capturePhaseIndex);
  const queueIndex = tx.objectStore(queueStore).index(queueStatusIndex);
  const phases = Object.fromEntries(
    await Promise.all(
      ['native', 'prepared', 'published'].map(async (phase) => [
        phase,
        await captureIndex.count(
          IDBKeyRange.only([
            'sync-operation',
            phase,
            scope.spaceId,
            scope.connectionGeneration,
            scope.profileCreatedAt,
          ])
        ),
      ])
    )
  );
  const queueCounts = Object.fromEntries(
    await Promise.all(
      statuses.map(async (status) => [
        status,
        await queueIndex.count(
          IDBKeyRange.only([
            'queue-operation',
            status,
            scope.spaceId,
            scope.connectionGeneration,
            scope.profileCreatedAt,
          ])
        ),
      ])
    )
  );
  const due = tx.objectStore(captureStore).index(pendingDueIndex);
  const count = await due.count(wholePendingScope(scope));
  const cursor = await due.openKeyCursor(
    IDBKeyRange.bound(
      ['pending-checkpoint', scope.spaceId, scope.connectionGeneration, scope.profileCreatedAt, 0],
      [
        'pending-checkpoint',
        scope.spaceId,
        scope.connectionGeneration,
        scope.profileCreatedAt,
        Number.MAX_SAFE_INTEGER,
      ]
    )
  );
  const key = cursor?.key;
  const minimumDueAt = Array.isArray(key) && typeof key.at(-1) === 'number' ? key.at(-1) : null;
  await tx.done;
  return { phases, queue: queueCounts, pendingRoots: count, minimumDueAt };
}

async function upgradeNative(abort: boolean) {
  let sourceWrites = 0;
  const put = IDBObjectStore.prototype.put;
  const add = IDBObjectStore.prototype.add;
  const remove = IDBObjectStore.prototype.delete;
  const clear = IDBObjectStore.prototype.clear;
  const cursorUpdate = IDBCursor.prototype.update;
  const cursorDelete = IDBCursor.prototype.delete;
  function observe(store: IDBObjectStore) {
    if (
      store.transaction.mode === 'versionchange' &&
      [captureStore, queueStore].includes(store.name)
    )
      sourceWrites++;
  }
  IDBObjectStore.prototype.put = function (value, key) {
    observe(this);
    return put.call(this, value, key);
  };
  IDBObjectStore.prototype.add = function (value, key) {
    observe(this);
    return add.call(this, value, key);
  };
  IDBObjectStore.prototype.delete = function (key) {
    observe(this);
    return remove.call(this, key);
  };
  IDBObjectStore.prototype.clear = function () {
    observe(this);
    return clear.call(this);
  };
  IDBCursor.prototype.update = function (value) {
    observe(this.source instanceof IDBIndex ? this.source.objectStore : this.source);
    return cursorUpdate.call(this, value);
  };
  IDBCursor.prototype.delete = function () {
    observe(this.source instanceof IDBIndex ? this.source.objectStore : this.source);
    return cursorDelete.call(this);
  };
  try {
    const db = await openDB(DB_NAME, 51, {
      upgrade(database, old, next, tx) {
        handleDatabaseUpgrade(database, old, next, tx);
        if (abort) tx.abort();
      },
    });
    return { db, sourceWrites, aborted: false };
  } catch (error) {
    if (!abort) throw error;
    return { db: null, sourceWrites, aborted: true };
  } finally {
    IDBObjectStore.prototype.put = put;
    IDBObjectStore.prototype.add = add;
    IDBObjectStore.prototype.delete = remove;
    IDBObjectStore.prototype.clear = clear;
    IDBCursor.prototype.update = cursorUpdate;
    IDBCursor.prototype.delete = cursorDelete;
  }
}

/** Actual DB50 versionchange, automatic index population and immutable source/Blob proof. */
export async function probe() {
  const legacy = await openDB(DB_NAME, 50, {
    upgrade(db, old, next, tx) {
      handleDatabaseUpgrade(db, old, next, tx);
      for (const [store, index] of [
        [captureStore, capturePhaseIndex],
        [captureStore, pendingDueIndex],
        [queueStore, queueStatusIndex],
      ] as const) {
        if (tx.objectStore(store).indexNames.contains(index))
          tx.objectStore(store).deleteIndex(index);
      }
      for (const [domainId, schemaVersion] of Object.entries(betaV50Fixture.domainVersions))
        tx.objectStore('schema_contracts').put({ domainId, schemaVersion });
    },
  });
  const original = new Blob([blobText], { type: 'image/png' });
  const initial = legacy.transaction([...summaryStores, 'media_library'], 'readwrite');
  await installControl(initial);
  await initial.objectStore('media_library').put(
    createMediaLibraryEntry({
      id: 'kept-original',
      kind: 'image',
      source: { kind: 'screenshot' },
      blob: original,
      size: original.size,
    })
  );
  await initial
    .objectStore(captureStore)
    .put(capture('native-original', 'native', defaultScope, original));
  await initial.objectStore(captureStore).put(capture('prepared-original', 'prepared'));
  for (let index = 0; index < 3; index++) {
    const operation = capture(`migrated-${index}`, 'published');
    await initial.objectStore(captureStore).put(operation);
    await initial.objectStore(queueStore).put(queue(operation));
  }
  await initial.objectStore(captureStore).put(pending('later', 90));
  await initial.objectStore(captureStore).put(pending('first', 30));
  const foreignScope = { ...defaultScope, connectionGeneration: 99 };
  const foreign = capture('foreign', 'published', foreignScope);
  await initial.objectStore(captureStore).put(foreign);
  await initial.objectStore(queueStore).put(queue(foreign));
  await initial.objectStore(captureStore).put(pending('foreign', 1, foreignScope));
  await initial.done;
  const sourceAdmission = await inspectSupportedSourceDatabase(legacy, [betaV50Fixture]);
  const before = await integrity(legacy);
  const admission = await evaluateDatabaseMigrationPlan(
    50,
    requireValue(buildDatabaseMigrationPlan(50, 51), 'Missing production 50 to 51 migration'),
    legacy
  );
  legacy.close();
  const abortedUpgrade = await upgradeNative(true);
  const aborted = abortedUpgrade.aborted;
  abortedUpgrade.db?.close();
  const prior = await openDB(DB_NAME);
  const abortAdmission = await inspectSupportedSourceDatabase(prior, [betaV50Fixture]);
  const abortVersion = prior.version;
  const rollbackIndexesAbsent =
    !prior.transaction(captureStore).store.indexNames.contains(capturePhaseIndex) &&
    !prior.transaction(captureStore).store.indexNames.contains(pendingDueIndex) &&
    !prior.transaction(queueStore).store.indexNames.contains(queueStatusIndex);
  const afterAbort = await integrity(prior);
  prior.close();
  const completedUpgrade = await upgradeNative(false);
  const migrated = requireValue(completedUpgrade.db, 'Native migration did not complete');
  const afterUpgrade = await integrity(migrated);
  const automatic = await indexedCounts(migrated);
  const indexes = [
    ...[capturePhaseIndex, pendingDueIndex].map((name) => {
      const index = migrated.transaction(captureStore).store.index(name);
      return { store: captureStore, name, keyPath: index.keyPath, unique: index.unique };
    }),
    (() => {
      const index = migrated.transaction(queueStore).store.index(queueStatusIndex);
      return {
        store: queueStore,
        name: queueStatusIndex,
        keyPath: index.keyPath,
        unique: index.unique,
      };
    })(),
  ];
  migrated.close();
  const db = await openDB(DB_NAME, 51);
  const reopenAdmission = await inspectSupportedSourceDatabase(db);
  const afterReopen = await integrity(db);
  const migrationSummary = await summary(db);
  await publishedDataset(db, 10);
  const small = await summary(db);
  await publishedDataset(db, 1000);
  const large = await summary(db);
  const failedCapture = capture('published-1000-failed', 'prepared');
  const failedWrite = db.transaction([captureStore, queueStore], 'readwrite');
  await failedWrite.objectStore(captureStore).put(failedCapture);
  await failedWrite.objectStore(queueStore).put(queue(failedCapture, 'failed'));
  await failedWrite.done;
  const hiddenFailure = await summary(db);
  await publishedDataset(db, 0);
  await db.put(captureStore, capture('native-before-reconcile', 'native'));
  const nativeBeforeReconcile = await summary(db);
  await publishedDataset(db, 0, false);
  const enrollmentPending = await summary(db);
  await publishedDataset(db, 7);
  const replacementScope = { ...defaultScope, connectionGeneration: 3, profileCreatedAt: 2 };
  const replacementAuthorization = {
    incarnation: '44444444-4444-4444-8444-444444444444',
    revision: 1,
  };
  let replacementStarted = false;
  let replacement = Promise.resolve();
  const beforeReplacement = await summary(db, () => {
    replacementStarted = true;
    const tx = db.transaction(summaryStores, 'readwrite');
    replacement = (async () => {
      await Promise.all(summaryStores.map((name) => tx.objectStore(name).clear()));
      await installControl(tx, replacementScope, true, replacementAuthorization);
      await tx.done;
    })();
  });
  if (!replacementStarted) throw new Error('Summary did not reach the controlled index boundary');
  await replacement;
  const afterReplacement = await summary(db);
  const coherentReplacement = {
    before: beforeReplacement,
    after: afterReplacement,
    replacementScope,
    replacementAuthorization,
  };
  const malformedDue = [];
  for (const profileCreatedAt of [1, Number.MAX_SAFE_INTEGER]) {
    const scope = { ...defaultScope, profileCreatedAt };
    for (const invalidDue of [[], ['bad'], [[]]]) {
      await publishedDataset(db, 0, true, scope);
      const valid = pending('malformed', Number.MAX_SAFE_INTEGER, scope);
      await db.put(captureStore, { ...valid, dueAt: invalidDue });
      const actualIndex = await indexedCounts(db, scope);
      malformedDue.push({
        profileCreatedAt,
        dueAt: invalidDue,
        wholeScopeCount: actualIndex.pendingRoots,
        summary: await summary(db),
      });
    }
  }
  db.close();
  return {
    sourceAdmission,
    admission,
    aborted,
    abortVersion,
    abortAdmission,
    rollbackIndexesAbsent,
    before,
    afterAbort,
    afterUpgrade,
    afterReopen,
    reopenAdmission,
    automatic,
    indexes,
    migrationSummary,
    small,
    large,
    hiddenFailure,
    nativeBeforeReconcile,
    enrollmentPending,
    coherentReplacement,
    malformedDue,
    migrationSourceWrites: {
      aborted: abortedUpgrade.sourceWrites,
      completed: completedUpgrade.sourceWrites,
    },
    expectedBlobSha256: await hashBytes(new TextEncoder().encode(blobText).buffer),
  };
}
