import { createWebdavPortableHarness } from './webdav-portable';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  DB_NAME,
  initDB,
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
  SYNC_OUTBOX_STORE,
} from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import { parseSyncCaptureRecord } from '../../../apps/extension/src/composition/persistence/sync-capture/guards';
import {
  beginSyncConnectionAuthUpdate,
  commitSyncConnectionAuthentication,
  loadSyncConnection,
} from '../../../apps/extension/src/composition/persistence/remote-connection/store';
import {
  connectionUuid,
  parseConnectionAuthentication,
} from '../../../apps/extension/src/composition/persistence/remote-connection/model';
import {
  enqueueSyncQueueOperation,
  loadSyncQueue,
} from '../../../apps/extension/src/composition/persistence/sync-capture/queue';
import { queueOrdinal } from '../../../apps/extension/src/composition/persistence/sync-capture/queue-model';
import { prepareCapturedOutgoing } from '../../../apps/extension/src/workflows/sync-transfer/outgoing';
import { readAssetFile } from '../../../apps/extension/src/composition/persistence/assets';
import type { AssetRef } from '../../../apps/extension/src/composition/persistence/assets/contracts';
import { digestBackupObject } from '../../../apps/extension/src/workflows/media-hub-backup/v6/shared-objects';
import { parseSyncExecutorSnapshot } from '../../../apps/extension/src/contracts/messaging/contracts/runtime/sync-connection';
import type { SecurityE2ESyncSelection } from '../../../apps/extension/src/platform/security-e2e-control';

interface LifecycleControl {
  disconnectLegacy(): void;
  command(
    type: 'sync-start' | 'sync-inspect' | 'sync-stop' | 'sync-erase',
    payload?: unknown
  ): Promise<unknown>;
}

/** Native source setup never creates a page-owned WebDAV client or opens a runtime keepalive. */
export function createWebdavLifecycleHarness(control: LifecycleControl) {
  const portable = createWebdavPortableHarness(() => {
    throw new Error('The native lifecycle fixture has no page-owned DAV client.');
  });
  let selection: SecurityE2ESyncSelection | null = null;
  let sourceIds: { mediaId: string; projectId: string } | null = null;
  let knownObjects: AssetRef[] = [];

  async function prepare(input: { rootUrl: string; authentication: unknown }) {
    control.disconnectLegacy();
    if (!isRecord(input.authentication) || typeof input.authentication['username'] !== 'string')
      throw new Error('Native lifecycle fixture authentication is invalid.');
    const authentication = parseConnectionAuthentication(
      input.authentication,
      input.authentication['username']
    );
    if (!authentication || authentication.kind !== 'basic')
      throw new Error('Native lifecycle fixture authentication is invalid.');
    const source = await portable.source();
    sourceIds = { mediaId: source.mediaId, projectId: source.projectId };
    const db = await initDB();
    const profile = parseSyncCaptureRecord(await db.get(SYNC_CAPTURE_STORE, 'profile'));
    if (!profile || profile.kind !== 'profile')
      throw new Error('Native lifecycle profile is missing.');
    const scope = {
      spaceId: profile.spaceId,
      connectionGeneration: profile.connectionGeneration,
      profileCreatedAt: profile.createdAt,
    };
    const reservation = await beginSyncConnectionAuthUpdate(
      {
        provider: 'webdav',
        rootUrl: input.rootUrl,
        accountId: authentication.username,
        ...scope,
      },
      null
    );
    const connection = await commitSyncConnectionAuthentication(reservation, authentication);
    const capture = (await db.getAll(SYNC_CAPTURE_STORE))
      .flatMap((raw) => {
        const row = parseSyncCaptureRecord(raw);
        return row?.kind === 'captured-change' &&
          row.rootKind === 'media' &&
          row.rootId === source.mediaId
          ? [row]
          : [];
      })
      .sort((left, right) => right.generation - left.generation)[0];
    if (!capture) throw new Error('Native lifecycle media capture is missing.');
    const prepared = await prepareCapturedOutgoing(capture);
    knownObjects = prepared.objects.map((object) => object.ref);
    const queued = await enqueueSyncQueueOperation(capture);
    selection = {
      scope,
      authorization: connection.identity,
      operationId: queued.operationId,
      expectedRevision: queued.revision,
    };
    return {
      selection,
      source: { ...sourceIds, original: source.editing[1] },
      prepared: {
        operationId: prepared.operationId,
        objects: prepared.objects.map((object) => ({
          objectId: object.objectId,
          key: object.remoteKey,
          size: object.ref.size,
          sha256: object.sha256,
        })),
      },
    };
  }

  async function start(operation?: { operationId: string; expectedRevision: number }) {
    if (!selection) throw new Error('Native lifecycle fixture is not prepared.');
    const receipt = await control.command('sync-start', {
      ...selection,
      ...(operation ?? {}),
    });
    if (
      !isRecord(receipt) ||
      !connectionUuid(receipt['executorId']) ||
      !queueOrdinal(receipt['executorRevision']) ||
      receipt['executorRevision'] < 1
    )
      throw new Error('Native lifecycle start receipt is invalid.');
    return {
      ok: true,
      sync: { executorId: receipt['executorId'], executorRevision: receipt['executorRevision'] },
    };
  }
  async function inspect() {
    const value = await control.command('sync-inspect');
    if (value === null) return { ok: true, sync: null };
    const snapshot = parseSyncExecutorSnapshot(value);
    if (!snapshot) throw new Error('Native lifecycle snapshot is invalid.');
    return { ok: true, sync: snapshot };
  }
  async function state() {
    const objects = await Promise.all(
      knownObjects.map(async (ref) => {
        try {
          const file = await readAssetFile(ref, 'lifecycle-source.png');
          const sha256 = await digestBackupObject({
            size: file.size,
            pipeTo: (sink, abort) => file.stream().pipeTo(sink, abort ? { signal: abort } : {}),
          });
          return { assetId: ref.assetId, readable: true, size: file.size, sha256 };
        } catch {
          return { assetId: ref.assetId, readable: false, size: null, sha256: null };
        }
      })
    );
    const databasePresent = (await indexedDB.databases()).some((db) => db.name === DB_NAME);
    if (!databasePresent)
      return {
        databasePresent: false,
        connection: null,
        profile: null,
        queue: null,
        source: { mediaExists: false, projectExists: false, captureCount: 0, objects },
      };
    const db = await initDB();
    const profile = parseSyncCaptureRecord(await db.get(SYNC_CAPTURE_STORE, 'profile'));
    const captureCount = (await db.getAll(SYNC_CAPTURE_STORE)).filter(
      (raw) => parseSyncCaptureRecord(raw)?.kind === 'captured-change'
    ).length;
    const connection = profile?.kind === 'profile' ? await loadSyncConnection() : null;
    const queue =
      profile?.kind === 'profile'
        ? await loadSyncQueue({
            spaceId: profile.spaceId,
            connectionGeneration: profile.connectionGeneration,
            profileCreatedAt: profile.createdAt,
          })
        : null;
    if (queue && queue.operations.length > 16)
      throw new Error('Native lifecycle fixture queue is too large.');
    return {
      databasePresent,
      connection: connection ? { phase: connection.phase, identity: connection.identity } : null,
      profile:
        profile?.kind === 'profile'
          ? {
              enabled: profile.enabled,
              spaceId: profile.spaceId,
              connectionGeneration: profile.connectionGeneration,
              createdAt: profile.createdAt,
            }
          : null,
      queue,
      source: {
        mediaExists:
          sourceIds !== null && (await db.get('media_library', sourceIds.mediaId)) !== undefined,
        projectExists:
          sourceIds !== null && (await db.get('video_projects', sourceIds.projectId)) !== undefined,
        captureCount,
        objects,
      },
    };
  }
  async function empty() {
    const db = await initDB();
    const counts = await Promise.all(
      [
        SYNC_CONNECTION_STORE,
        SYNC_CAPTURE_STORE,
        SYNC_OUTBOX_STORE,
        'asset_refs',
        'asset_owners',
        'media_library',
        'project_assets',
        'video_projects',
      ].map((name) => db.count(name))
    );
    const sourceObjectsReadable = await Promise.all(
      knownObjects.map(async (ref) => {
        try {
          await readAssetFile(ref, 'lifecycle-source.png');
          return true;
        } catch {
          return false;
        }
      })
    );
    return {
      connections: counts[0],
      captures: counts[1],
      queue: counts[2],
      assets: counts[3],
      owners: counts[4],
      media: counts[5],
      projectAssets: counts[6],
      projects: counts[7],
      sourceObjectsReadable,
    };
  }
  return {
    prepare,
    start,
    inspect,
    stop: async () => {
      await control.command('sync-stop');
      return { ok: true, sync: null };
    },
    erase: async () => {
      const result = await control.command('sync-erase');
      if (typeof result !== 'boolean')
        throw new Error('Native lifecycle erasure receipt is invalid.');
      return { ok: true, sync: result };
    },
    state,
    empty,
  };
}

declare global {
  interface Window {
    webdavLifecycle: ReturnType<typeof createWebdavLifecycleHarness>;
  }
}
