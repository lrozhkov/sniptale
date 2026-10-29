import { parseRecordingEntry } from '../../../apps/extension/src/composition/persistence/recordings/index.guards';
import { readVideoWorkspace } from '../../../apps/extension/src/composition/persistence/review-workspaces/store';
import type { CaptureRootKind } from '../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import { parseSyncAttemptText } from '../../../apps/extension/src/workflows/sync-transfer/wire-record';
import { loadSyncConnection } from '../../../apps/extension/src/composition/persistence/remote-connection/store';
import {
  initDB,
  SYNC_CAPTURE_STORE,
} from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import { parseSyncCaptureRecord } from '../../../apps/extension/src/composition/persistence/sync-capture/guards';
import { captureRootKey } from '../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import { installExperimentalCaptureProfile } from '../../../apps/extension/src/composition/persistence/sync-capture/profile';
import { parseMediaLibraryEntry } from '../../../apps/extension/src/composition/persistence/media-library/read-guards';
import {
  parseProjectAssetEntry,
  parseVideoProjectEntry,
} from '../../../apps/extension/src/composition/persistence/projects/read-guards';
import {
  deleteVideoProject,
  saveVideoProject,
} from '../../../apps/extension/src/composition/persistence/projects';
import {
  parseAssetRef,
  publishReadyJournalWithRetry,
} from '../../../apps/extension/src/composition/persistence/assets';
import { publishPreparedReplicaJournal } from '../../../apps/extension/src/composition/persistence/sync-capture/replica-publication';
import { scanSyncCatalog } from '../../../apps/extension/src/workflows/sync-transfer/catalog';
import { refreshPersistedSyncCatalog } from '../../../apps/extension/src/workflows/sync-transfer/catalog-refresh';
import { syncCatalogRootKey } from '../../../apps/extension/src/workflows/sync-transfer/catalog-graph';
import {
  applyCatalogDeletion,
  prepareCatalogReplica,
} from '../../../apps/extension/src/workflows/sync-transfer/incoming';
import type { CaptureOperation } from '../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import { loadPreparedOutgoingOperation } from '../../../apps/extension/src/composition/persistence/sync-capture/outgoing';
import { loadVerifiedOutgoingResult } from '../../../apps/extension/src/composition/persistence/sync-capture/outgoing-results';
import {
  loadOutgoingDispatchAttempt,
  loadCompletedOutgoingFiles,
} from '../../../apps/extension/src/composition/persistence/sync-capture/outgoing-attempts';
import {
  prepareCapturedOutgoing,
  dispatchPreparedOutgoing,
} from '../../../apps/extension/src/workflows/sync-transfer/outgoing';
import type { SyncRemoteStore } from '../../../apps/extension/src/workflows/sync-transfer/remote-store';

import {
  enqueueSyncQueueOperation,
  loadSyncQueue,
  commandSyncQueue,
  commandSyncQueueOperation,
  type SyncQueueScope,
} from '../../../apps/extension/src/composition/persistence/sync-capture/queue';
import {
  runSyncQueueOperation,
  recoverInterruptedSyncQueueOperation,
} from '../../../apps/extension/src/workflows/sync-transfer/queue';

async function localState(spaceId: string, kind: CaptureRootKind, rootId: string) {
  const db = await initDB();
  const row = parseSyncCaptureRecord(
    await db.get(
      SYNC_CAPTURE_STORE,
      JSON.stringify(['root-state', captureRootKey(spaceId, kind, rootId)])
    )
  );
  return row?.kind === 'root-state' ? row : null;
}
function catalogProof(current: Awaited<ReturnType<typeof scanSyncCatalog>>) {
  return {
    operations: current.operations.size,
    attempts: [...current.operations.values()].reduce(
      (total, operation) => total + operation.attempts.length,
      0
    ),
    roots: [...current.roots.values()],
    pending: current.pending,
    quarantined: current.quarantined,
    invalid: current.invalid,
    metadataBytes: current.metadataBytes,
  };
}

function signal() {
  return new AbortController().signal;
}
function check(condition: unknown) {
  if (!condition) throw new Error('Native catalog fixture is unavailable.');
}

/** Runs production encoding and dispatch over actual captured native sources. */
export function createWebdavOutgoingHarness(
  connected: () => SyncRemoteStore,
  latest: (rootId: string) => Promise<CaptureOperation>
) {
  let admitted:
    | import('../../../apps/extension/src/composition/persistence/sync-capture/outgoing-attempts').OutgoingDispatchAttempt
    | null = null;
  let admissionHold: { promise: Promise<void>; release: () => void } | null = null;
  let catalog: Awaited<ReturnType<typeof scanSyncCatalog>> | null = null;
  async function queueScope(): Promise<SyncQueueScope> {
    const db = await initDB();
    const profile = parseSyncCaptureRecord(await db.get(SYNC_CAPTURE_STORE, 'profile'));
    if (!profile || profile.kind !== 'profile') throw new Error('Native queue profile is missing.');
    return {
      spaceId: profile.spaceId,
      connectionGeneration: profile.connectionGeneration,
      profileCreatedAt: profile.createdAt,
    };
  }
  return {
    holdNextAdmission() {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      admissionHold = { promise, release };
      admitted = null;
    },
    admitted: () => structuredClone(admitted),
    releaseAdmission() {
      admissionHold?.release();
      admissionHold = null;
    },
    queueEnqueue: async (rootId: string) => enqueueSyncQueueOperation(await latest(rootId)),
    queueState: async () => loadSyncQueue(await queueScope()),
    queueControl: async (revision: number, command: 'pause' | 'resume') =>
      commandSyncQueue(await queueScope(), revision, command),
    queueOperationControl: async (
      operationId: string,
      revision: number,
      command: 'pause' | 'resume' | 'retry' | 'cancel'
    ) => commandSyncQueueOperation(await queueScope(), operationId, revision, command),
    queueRecover: async (operationId: string, revision: number) =>
      recoverInterruptedSyncQueueOperation(await queueScope(), operationId, revision),
    queueRun: async (operationId: string, revision: number) => {
      const scope = await queueScope();
      const row = (await loadSyncQueue(scope)).operations.find(
        (item) => item.operationId === operationId
      );
      if (!row) throw new Error('Native queue operation is missing.');
      return runSyncQueueOperation({
        scope,
        operationId,
        expectedRevision: revision,
        authorization: (await loadSyncConnection())?.identity,
        remote: connected(),
        signal: signal(),
        authorize: async () => {},
        ...(catalog ? { catalog } : {}),
      });
    },
    deleteProject: (rootId: string) => deleteVideoProject(rootId),
    async nativeState(spaceId: string, rootKind: CaptureRootKind, rootId: string) {
      const db = await initDB();
      const state = await localState(spaceId, rootKind, rootId);
      const root = await db.get(rootKind === 'media' ? 'media_library' : 'video_projects', rootId);
      const captures = (await db.getAll(SYNC_CAPTURE_STORE)).flatMap((raw) => {
        const parsed = parseSyncCaptureRecord(raw);
        return parsed?.kind === 'sync-operation' && parsed.rootId === rootId ? [parsed] : [];
      });
      return { exists: root !== undefined, state, captures: captures.length };
    },
    async reviseMetadata(rootId: string) {
      const db = await initDB();
      const entry = parseVideoProjectEntry(await db.get('video_projects', rootId));
      if (!entry) throw new Error('Native project is missing.');
      await saveVideoProject(
        { ...entry.project, name: `${entry.project.name} revised` },
        {
          expectedProject: entry.project,
          expectedWorkspaceRevision: entry.workspaceRevision ?? null,
        }
      );
    },
    async sendHistory(rootId: string, duplicateLatest = false, rootKind?: CaptureRootKind) {
      const db = await initDB();
      const captures = (await db.getAll(SYNC_CAPTURE_STORE))
        .flatMap((raw) => {
          const parsed = parseSyncCaptureRecord(raw);
          return parsed?.kind === 'sync-operation' &&
            parsed.phase !== 'published' &&
            parsed.rootId === rootId &&
            (rootKind === undefined || parsed.rootKind === rootKind)
            ? [parsed]
            : [];
        })
        .sort((left, right) => left.generation - right.generation);
      const sent = [];
      for (const [index, capture] of captures.entries()) {
        const prepared = await prepareCapturedOutgoing(capture);
        const count = duplicateLatest && index === captures.length - 1 ? 2 : 1;
        let release!: () => void;
        let admittedCount = 0;
        const ready = new Promise<void>((resolve) => {
          release = resolve;
        });
        const attempts = await Promise.all(
          Array.from({ length: count }, () =>
            dispatchPreparedOutgoing(
              prepared.spaceId,
              prepared.operationId,
              connected(),
              signal(),
              {
                admitAttempt: async () => {
                  if (++admittedCount === count) release();
                  await ready;
                },
              }
            )
          )
        );
        for (const attempt of attempts) {
          sent.push({
            spaceId: prepared.spaceId,
            operationId: prepared.operationId,
            recordKey: attempt.recordKey,
            files: attempt.objects.map((binding) => {
              const source = prepared.objects.find((item) => item.objectId === binding.objectId);
              if (!source) throw new Error('Prepared source is missing.');
              return { key: binding.remoteKey, size: source.ref.size, sha256: source.sha256 };
            }),
          });
        }
      }
      return sent;
    },
    async scan(spaceId: string) {
      catalog = await scanSyncCatalog(connected(), spaceId, signal());
      return catalogProof(catalog);
    },
    async refresh(spaceId: string, bypassCache = false) {
      const db = await initDB();
      const profile = parseSyncCaptureRecord(await db.get(SYNC_CAPTURE_STORE, 'profile'));
      if (!profile || profile.kind !== 'profile' || !profile.enabled || profile.spaceId !== spaceId)
        throw new Error('Target capture profile differs.');
      catalog = await refreshPersistedSyncCatalog(
        connected(),
        spaceId,
        profile.connectionGeneration,
        signal(),
        { bypassCache }
      );
      return catalogProof(catalog);
    },
    async receive(
      spaceId: string,
      rootKind: CaptureRootKind,
      rootId: string,
      deferPublication = false
    ) {
      check(catalog);
      if (!catalog) throw new Error('Scan is missing.');
      const db = await initDB();
      const current = parseSyncCaptureRecord(await db.get(SYNC_CAPTURE_STORE, 'profile'));
      if (!current) {
        await installExperimentalCaptureProfile({
          version: 1,
          kind: 'profile',
          key: 'profile',
          createdAt: Date.now(),
          enabled: true,
          spaceId,
          connectionGeneration: 3,
        });
      } else if (
        current.kind !== 'profile' ||
        !current.enabled ||
        current.spaceId !== spaceId ||
        current.connectionGeneration !== 3
      ) {
        throw new Error('Target capture profile differs.');
      }
      const root = catalog.roots.get(syncCatalogRootKey(rootKind, rootId));
      const operation = root?.heads[0] ? catalog.operations.get(root.heads[0]) : undefined;
      if (!operation) throw new Error('Selected root is missing.');
      const dependencies = [];
      for (const dependency of operation.operation.dependencies) {
        const entry = parseMediaLibraryEntry(await db.get('media_library', dependency.mediaId));
        if (!entry) throw new Error('Local Library source is missing.');
        const child =
          entry.source.kind === 'project-asset'
            ? parseProjectAssetEntry(await db.get('project_assets', entry.source.projectAssetId))
            : entry.source.kind === 'recording'
              ? parseRecordingEntry(await db.get('recordings', entry.source.recordingId))
              : null;
        const ref = child ? parseAssetRef(await db.get('asset_refs', child.assetId)) : null;
        const state = await localState(spaceId, 'media', entry.id);
        if (!ref || !state) throw new Error('Local Library proof is missing.');
        dependencies.push({
          entry,
          ref,
          expectedGeneration: state.generation,
          expectedBasis: state.basis,
        });
      }
      const state = await localState(spaceId, rootKind, rootId);
      const profile = parseSyncCaptureRecord(await db.get(SYNC_CAPTURE_STORE, 'profile'));
      if (!profile || profile.kind !== 'profile' || !profile.enabled)
        throw new Error('Target capture profile is unavailable.');
      const authorization = (await loadSyncConnection())?.identity;
      const localProject =
        rootKind === 'video-project'
          ? parseVideoProjectEntry(await db.get('video_projects', rootId))
          : null;
      const localMedia =
        rootKind === 'media' ? parseMediaLibraryEntry(await db.get('media_library', rootId)) : null;
      const localReview = rootKind === 'video-review' ? await readVideoWorkspace(rootId) : null;
      const localRevision = localReview
        ? localReview.workspace.revision
        : localProject
          ? (localProject.workspaceRevision ?? 0)
          : localMedia?.source.kind === 'screenshot'
            ? (localMedia.workspaceRevision ?? 0)
            : null;
      if (root?.deleted) {
        await applyCatalogDeletion({
          catalog,
          rootKind,
          rootId,
          signal: signal(),
          admission: {
            spaceId,
            ...(authorization ? { authorization } : {}),
            profileCreatedAt: profile.createdAt,
            connectionGeneration: profile.connectionGeneration,
            expectedLocalGeneration: state?.generation ?? 0,
            expectedBasis: state?.basis ?? [],
            expectedWorkspaceRevision: localRevision,
          },
        });
        return { rootId, operationId: operation.operation.operationId };
      }
      const journal = await prepareCatalogReplica({
        remote: connected(),
        catalog,
        rootKind,
        rootId,
        signal: signal(),
        admission: {
          spaceId,
          ...(authorization ? { authorization } : {}),
          profileCreatedAt: profile.createdAt,
          connectionGeneration: profile.connectionGeneration,
          expectedLocalGeneration: state?.generation ?? 0,
          expectedBasis: state?.basis ?? [],
          expectedWorkspaceRevision: localRevision,
          dependencies,
        },
      });
      if (!deferPublication)
        await publishReadyJournalWithRetry(journal, publishPreparedReplicaJournal);
      return { rootId, operationId: journal.payload.input.operationId };
    },
    prepare: async (rootId: string) => {
      const prepared = await prepareCapturedOutgoing(await latest(rootId), {
        remote: connected(),
        authorization: (await loadSyncConnection())?.identity,
        signal: signal(),
      });
      return {
        spaceId: prepared.spaceId,
        operationId: prepared.operationId,
        recordText: prepared.recordText,
        recordSha256: prepared.recordSha256,
        objects: prepared.objects.map((item) => ({
          objectId: item.objectId,
          filename: item.filename,
          size: item.ref.size,
          sha256: item.sha256,
        })),
      };
    },
    send: (spaceId: string, operationId: string) =>
      dispatchPreparedOutgoing(spaceId, operationId, connected(), new AbortController().signal, {
        ...(catalog ? { catalog } : {}),
        admitAttempt: async (attempt) => {
          admitted = structuredClone(attempt);
          const hold = admissionHold;
          if (hold) await hold.promise;
        },
      }),
    manifestText: async (key: string) => {
      const text = await new Response(await connected().read(key, signal())).text();
      const parsed = await parseSyncAttemptText(text);
      if (parsed.recordKey !== key) throw new Error('Remote manifest path differs from its bytes.');
      return text;
    },
    manifestProof: async (key: string) => {
      const text = await new Response(await connected().read(key, signal())).text();
      const parsed = await parseSyncAttemptText(text);
      if (parsed.recordKey !== key) throw new Error('Remote manifest path differs from its bytes.');
      return parsed;
    },
    completed: loadCompletedOutgoingFiles,
    prepared: loadPreparedOutgoingOperation,
    published: loadVerifiedOutgoingResult,
    attempt: loadOutgoingDispatchAttempt,
  };
}
