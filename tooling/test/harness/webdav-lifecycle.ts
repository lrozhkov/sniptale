import { reconcileSyncQueueCaptures } from '../../../apps/extension/src/composition/persistence/sync-capture/queue-reconciliation';
import {
  saveProjectAsset,
  getVideoProject,
  saveVideoProject,
} from '../../../apps/extension/src/composition/persistence/projects';
import {
  createSyncWorkspaceJoin,
  loadSyncWorkspaceJoin,
} from '../../../apps/extension/src/composition/persistence/remote-connection/workspace-join';
import { loadSyncWorkspaceSelection } from '../../../apps/extension/src/composition/persistence/remote-connection/workspace-selection';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../apps/extension/src/features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../apps/extension/src/features/video/project/types';
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
  loadSyncConnectionAuthentication,
} from '../../../apps/extension/src/composition/persistence/remote-connection/store';
import {
  connectionUuid,
  parseConnectionAuthentication,
  parseConnectionMetadata,
  type SyncWorkspaceSource,
} from '../../../apps/extension/src/composition/persistence/remote-connection/model';
import {
  commandSyncQueue,
  commandSyncQueueOperation,
  enqueueSyncQueueOperation,
  loadSyncQueue,
  loadSyncQueuePage,
  loadSyncQueueOperation,
} from '../../../apps/extension/src/composition/persistence/sync-capture/queue';
import {
  createSyncWorkspaceAllocation,
  loadSyncWorkspaceAllocation,
} from '../../../apps/extension/src/composition/persistence/remote-connection/workspace-allocation';
import { queueOrdinal } from '../../../apps/extension/src/composition/persistence/sync-capture/queue-model';
import { readOutgoingOperation } from '../../../apps/extension/src/composition/persistence/sync-capture/outgoing';
import {
  prepareCapturedOutgoing,
  releasePublishedOutgoing,
} from '../../../apps/extension/src/workflows/sync-transfer/outgoing';
import { createWebdavRemoteStore } from '../../../apps/extension/src/workflows/sync-transfer/webdav';
import { createSyncConnectionRequests } from '../../../apps/extension/src/workflows/sync-transfer/connection-requests';
import { verifySyncWorkspaceIdentity } from '../../../apps/extension/src/workflows/sync-transfer/workspace';
import { deleteMediaAssetWithProjectCascade } from '../../../apps/extension/src/composition/persistence/media-library/delete-cascade';
import { readAssetFile } from '../../../apps/extension/src/composition/persistence/assets';
import type { AssetRef } from '../../../apps/extension/src/composition/persistence/assets/contracts';
import { digestBackupObject } from '../../../apps/extension/src/workflows/media-hub-backup/v6/shared-objects';
import { parseSyncExecutorSnapshot } from '../../../apps/extension/src/contracts/messaging/contracts/runtime/sync-connection';
import type { SecurityE2ESyncSelection } from '../../../apps/extension/src/platform/security-e2e-control';

interface LifecycleControl {
  disconnectLegacy(): void;
  command(
    type:
      | 'sync-start'
      | 'sync-workspace-start'
      | 'sync-workspace-enroll'
      | 'sync-inspect'
      | 'sync-stop'
      | 'sync-erase',
    payload?: unknown
  ): Promise<unknown>;
}

/** Native source setup never creates a page-owned WebDAV client or opens a runtime keepalive. */
export function createWebdavLifecycleHarness(control: LifecycleControl) {
  const portable = createWebdavPortableHarness(() => {
    throw new Error('The native lifecycle fixture has no page-owned DAV client.');
  });
  let selection: SecurityE2ESyncSelection | null = null;
  let workspaceSelection: SyncWorkspaceSource | null = null;
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
        return row?.kind === 'sync-operation' &&
          row.rootKind === 'media' &&
          row.rootId === source.mediaId
          ? [row]
          : [];
      })
      .sort((left, right) => right.generation - left.generation)[0];
    if (!capture) throw new Error('Native lifecycle media capture is missing.');
    const prepared = await prepareCapturedOutgoing(capture);
    knownObjects = prepared.objects.map((object) => object.ref);
    const currentCapture: unknown = await db.get(SYNC_CAPTURE_STORE, capture.key);
    const queued = await enqueueSyncQueueOperation(currentCapture);
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
          size: object.ref.size,
          sha256: object.sha256,
        })),
      },
    };
  }

  async function prepareWorkspace(input: { rootUrl: string; authentication: unknown }) {
    control.disconnectLegacy();
    if (!isRecord(input.authentication) || typeof input.authentication['username'] !== 'string')
      throw new Error('Native workspace fixture authentication is invalid.');
    const authentication = parseConnectionAuthentication(
      input.authentication,
      input.authentication['username']
    );
    if (!authentication || authentication.kind !== 'basic')
      throw new Error('Native workspace fixture authentication is invalid.');
    // Prepare storage before the native command captures its existing database handle.
    await loadSyncWorkspaceAllocation();
    const allocation = await createSyncWorkspaceAllocation({
      parentUrl: input.rootUrl,
      accountId: authentication.username,
    });
    workspaceSelection = { kind: 'allocation', identity: structuredClone(allocation.identity) };
    return {
      allocation: { identity: allocation.identity, phase: allocation.phase },
      rootKey: allocation.rootUrl.slice(allocation.parentUrl.length),
    };
  }

  async function startWorkspace(authentication: unknown) {
    if (!workspaceSelection) throw new Error('Native workspace fixture is not prepared.');
    const receipt = await control.command('sync-workspace-start', {
      source: workspaceSelection,
      authentication,
    });
    if (
      !isRecord(receipt) ||
      !connectionUuid(receipt['executorId']) ||
      !queueOrdinal(receipt['executorRevision']) ||
      receipt['executorRevision'] < 1
    )
      throw new Error('Native workspace start receipt is invalid.');
    return {
      ok: true,
      sync: { executorId: receipt['executorId'], executorRevision: receipt['executorRevision'] },
    };
  }

  async function prepareJoin(input: { rootUrl: string; accountId: string }) {
    control.disconnectLegacy();
    await loadSyncWorkspaceJoin();
    const intent = await createSyncWorkspaceJoin({ ...input, expected: null });
    workspaceSelection = { kind: 'join', identity: intent.identity };
    return { source: workspaceSelection };
  }
  async function enrollWorkspace(authentication: unknown) {
    if (!workspaceSelection) throw new Error('Native workspace fixture is not prepared.');
    const current = await loadSyncWorkspaceSelection();
    if (
      !current ||
      current.phase !== 'ready' ||
      current.source.kind !== workspaceSelection.kind ||
      current.source.identity.incarnation !== workspaceSelection.identity.incarnation
    )
      throw new Error('Native workspace readiness is unavailable.');
    const value = await control.command('sync-workspace-enroll', {
      source: current.source,
      authentication,
    });
    const connection = parseConnectionMetadata(value);
    if (!connection?.workspace) throw new Error('Checked enrollment receipt is invalid.');
    workspaceSelection = current.source;
    return {
      identity: connection.identity,
      phase: connection.phase,
      workspace: connection.workspace,
    };
  }
  async function prepareEnrolledSource(input?: { captureOnly?: boolean; withProject?: boolean }) {
    const connection = await loadSyncConnection();
    if (!connection?.workspace || connection.phase !== 'active')
      throw new Error('Checked connection is required.');
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG fixture canvas is unavailable.');
    context.fillStyle = 'rgb(20,180,60)';
    context.fillRect(0, 0, 24, 24);
    const file = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('PNG fixture failed.'))),
        'image/png'
      )
    );
    const assetId = crypto.randomUUID();
    await saveProjectAsset(assetId, file, file.type, 'handoff-original.png');
    const mediaId = `project-asset:${assetId}`;
    let projectId: string | null = null;
    if (input?.withProject) {
      const project = createEmptyVideoProject(
        'Captured project with an existing original',
        1280,
        720
      );
      project.assets = [
        createVideoProjectAsset(
          'Original',
          VideoProjectAssetType.IMAGE,
          { kind: 'library-asset', mediaId },
          {
            width: 24,
            height: 24,
            duration: null,
            mimeType: file.type,
            size: file.size,
            hasAudio: false,
            audioPeaks: null,
          }
        ),
      ];
      const saved = await saveVideoProject(project, {
        expectedProject: null,
        expectedWorkspaceRevision: null,
      });
      projectId = saved.id;
      sourceIds = { mediaId, projectId };
    }
    const db = await initDB();
    const captures = (await db.getAll(SYNC_CAPTURE_STORE)).flatMap((raw) => {
      const capture = parseSyncCaptureRecord(raw);
      return capture?.kind === 'sync-operation' &&
        capture.rootKind === 'media' &&
        capture.rootId === mediaId
        ? [capture]
        : [];
    });
    const capture = captures.sort((left, right) => right.generation - left.generation)[0];
    if (!capture || capture.phase !== 'native' || capture.change.kind !== 'media')
      throw new Error('Enrolled source capture is missing.');
    if (input?.captureOnly) {
      knownObjects = [capture.change.rows.ref];
      const projectCapture =
        projectId === null
          ? null
          : (await db.getAll(SYNC_CAPTURE_STORE)).flatMap((raw) => {
              const row = parseSyncCaptureRecord(raw);
              return row?.kind === 'sync-operation' &&
                row.rootKind === 'video-project' &&
                row.rootId === projectId
                ? [row]
                : [];
            })[0];
      if (projectId !== null && !projectCapture)
        throw new Error('Enrolled project capture is missing.');
      return {
        operationId: capture.operationId,
        operationIds: [
          capture.operationId,
          ...(projectCapture ? [projectCapture.operationId] : []),
        ],
        expectedOriginal: {
          size: file.size,
          sha256: await digestBackupObject({
            size: file.size,
            pipeTo: (sink, signal) => file.stream().pipeTo(sink, signal ? { signal } : {}),
          }),
        },
        objects: [],
      };
    }
    const prepared = await prepareCapturedOutgoing(capture);
    const currentCapture: unknown = await db.get(SYNC_CAPTURE_STORE, capture.key);
    const queued = await enqueueSyncQueueOperation(currentCapture);
    const scope = {
      spaceId: connection.binding.spaceId,
      connectionGeneration: connection.binding.connectionGeneration,
      profileCreatedAt: connection.binding.profileCreatedAt,
    };
    selection = {
      scope,
      authorization: connection.identity,
      operationId: queued.operationId,
      expectedRevision: queued.revision,
    };
    knownObjects = prepared.objects.map((object) => object.ref);
    return {
      operationId: prepared.operationId,
      objects: prepared.objects.map((object) => ({
        size: object.ref.size,
        sha256: object.sha256,
      })),
    };
  }
  async function capacityState(projectId?: string) {
    const connection = await loadSyncConnection();
    if (!connection?.workspace) throw new Error('Checked connection is required.');
    const scope = {
      spaceId: connection.binding.spaceId,
      connectionGeneration: connection.binding.connectionGeneration,
      profileCreatedAt: connection.binding.profileCreatedAt,
    };
    let page = await loadSyncQueuePage(scope, { limit: 128 });
    const queue = page.connection;
    const operations = [...page.operations];
    for (let index = 1; page.nextCursor !== null && index < 4; index += 1) {
      page = await loadSyncQueuePage(scope, { limit: 128, cursor: page.nextCursor });
      operations.push(...page.operations);
    }
    if (page.nextCursor !== null) throw new Error('Capacity fixture exceeds its page budget.');
    const db = await initDB();
    const project: unknown =
      projectId === undefined ? null : await db.get('video_projects', projectId);
    return {
      scope,
      connection: queue,
      operations,
      captureCount: await db.countFromIndex(SYNC_CAPTURE_STORE, 'kind', 'sync-operation'),
      project,
    };
  }
  async function prepareCapacity() {
    const initial = await capacityState();
    await commandSyncQueue(initial.scope, initial.connection.revision, 'pause');
    const source = await prepareEnrolledSource({ captureOnly: true });
    const project = await saveVideoProject(createEmptyVideoProject('Offline 0', 1280, 720), {
      expectedProject: null,
      expectedWorkspaceRevision: null,
    });
    return { source, projectId: project.id, finalWorkspaceRevision: project.workspaceRevision };
  }
  async function appendCapacityRevision(input: { projectId: string; index: number }) {
    if (!queueOrdinal(input.index) || input.index < 1 || input.index > 131)
      throw new Error('Capacity revision index is invalid.');
    const current = await getVideoProject(input.projectId);
    if (current.status !== 'ready') throw new Error('Capacity project is unavailable.');
    const accepted = await saveVideoProject(
      { ...current.project, name: `Offline ${input.index}` },
      {
        expectedProject: current.project,
        expectedWorkspaceRevision: current.workspaceRevision,
      }
    );
    return { name: accepted.project.name, workspaceRevision: accepted.workspaceRevision };
  }
  async function capacityOperation(operationId: string) {
    const connection = await loadSyncConnection();
    if (!connection?.workspace) throw new Error('Checked connection is required.');
    return loadSyncQueueOperation(
      {
        spaceId: connection.binding.spaceId,
        connectionGeneration: connection.binding.connectionGeneration,
        profileCreatedAt: connection.binding.profileCreatedAt,
      },
      operationId
    );
  }
  async function resumeCapacityOriginal(operationId: string) {
    const current = await capacityState();
    for (const row of current.operations) {
      if (row.operationId !== operationId && row.status === 'queued')
        await commandSyncQueueOperation(current.scope, row.operationId, row.revision, 'pause');
    }
    await commandSyncQueue(current.scope, current.connection.revision, 'resume');
    return loadSyncQueueOperation(current.scope, operationId);
  }
  async function reconcileCapturesInParallel() {
    const connection = await loadSyncConnection();
    if (!connection?.workspace) throw new Error('Checked connection is required.');
    const scope = {
      spaceId: connection.binding.spaceId,
      connectionGeneration: connection.binding.connectionGeneration,
      profileCreatedAt: connection.binding.profileCreatedAt,
    };
    return Promise.all([
      reconcileSyncQueueCaptures(scope, connection.identity),
      reconcileSyncQueueCaptures(scope, connection.identity),
    ]);
  }
  async function enrolledCaptureResult(operationId: string) {
    const connection = await loadSyncConnection();
    if (!connection?.workspace) throw new Error('Checked connection is required.');
    const db = await initDB();
    const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
    const operation = await readOutgoingOperation(tx, connection.binding.spaceId, operationId);
    await tx.done;
    if (!operation || operation.phase !== 'published') return null;
    return {
      operationId: operation.operationId,
      phase: operation.phase,
      hasNativePayload: 'change' in operation,
      hasPreparedPayload: 'prepared' in operation,
      objects: operation.objects.map((object) => ({
        key: object.remoteKey,
        size: object.ref.size,
        sha256: object.sha256,
        pinned: object.pinned,
      })),
    };
  }

  async function retirePublishedOriginal(operationId: string) {
    const connection = await loadSyncConnection();
    if (!connection?.workspace || connection.phase !== 'active')
      throw new Error('Checked connection is required.');
    const db = await initDB();
    const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
    const operation = await readOutgoingOperation(tx, connection.binding.spaceId, operationId);
    await tx.done;
    if (!operation || operation.phase !== 'published' || operation.rootKind !== 'media')
      throw new Error('Published original is required.');
    const scope = {
      spaceId: operation.spaceId,
      connectionGeneration: operation.connectionGeneration,
      profileCreatedAt: operation.profileCreatedAt,
    };
    const queue = await loadSyncQueue(scope);
    await commandSyncQueue(scope, queue.connection.revision, 'pause');
    const readable = () =>
      Promise.all(
        operation.objects.map(async (object) => {
          try {
            await readAssetFile(object.ref, object.filename);
            return true;
          } catch (error) {
            if (error instanceof DOMException && error.name === 'NotFoundError') return false;
            throw error;
          }
        })
      );
    const before = await readable();
    await deleteMediaAssetWithProjectCascade(operation.rootId, []);
    const protectedAfterNativeRemoval = await readable();
    const requests = createSyncConnectionRequests({
      identity: connection.identity,
      hasOriginPermission: (origin) => chrome.permissions.contains({ origins: [`${origin}/*`] }),
    });
    try {
      const signal = new AbortController().signal;
      const remote = await createWebdavRemoteStore(
        {
          rootUrl: connection.binding.rootUrl,
          authentication: () => loadSyncConnectionAuthentication(connection.identity),
          request: requests.request,
        },
        signal
      );
      await verifySyncWorkspaceIdentity(remote, connection.workspace, signal);
      const released = await releasePublishedOutgoing(
        operation.spaceId,
        operationId,
        connection.identity,
        remote,
        signal
      );
      return {
        before,
        protectedAfterNativeRemoval,
        after: await readable(),
        released: released.released.length,
        publication: await enrolledCaptureResult(operationId),
        nativeMediaRemoved: (await db.get('media_library', operation.rootId)) === undefined,
      };
    } finally {
      await requests.close();
    }
  }

  async function workspaceState() {
    const databasePresent = (await indexedDB.databases()).some((db) => db.name === DB_NAME);
    if (!databasePresent)
      return { databasePresent: false, allocation: null, profiles: 0, connections: 0 };
    const db = await initDB();
    const selected = await loadSyncWorkspaceSelection();
    const allocation =
      selected?.source.kind === 'join' ? null : await loadSyncWorkspaceAllocation();
    return {
      databasePresent,
      selection: selected ? { source: selected.source, phase: selected.phase } : null,
      allocation: allocation ? { identity: allocation.identity, phase: allocation.phase } : null,
      profiles: await db.count(SYNC_CAPTURE_STORE),
      connections: (await db.getKey(SYNC_CONNECTION_STORE, 'connection')) === undefined ? 0 : 1,
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
  async function retry() {
    if (!selection) throw new Error('Native lifecycle fixture is not prepared.');
    const selected = selection;
    const queue = await loadSyncQueue(selected.scope);
    const current = queue.operations.find((row) => row.operationId === selected.operationId);
    if (!current || current.status !== 'failed' || current.failureCode !== 'temporary')
      throw new Error('Native lifecycle temporary retry is unavailable.');
    const retried = await commandSyncQueueOperation(
      selected.scope,
      current.operationId,
      current.revision,
      'retry'
    );
    return { operationId: retried.operationId, expectedRevision: retried.revision };
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
      (raw) => parseSyncCaptureRecord(raw)?.kind === 'sync-operation'
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
    prepareWorkspace,
    prepareJoin,
    enrollWorkspace,
    prepareEnrolledSource,
    prepareCapacity,
    appendCapacityRevision,
    capacityState,
    capacityOperation,
    resumeCapacityOriginal,
    enrolledCaptureResult,
    retirePublishedOriginal,
    reconcileCapturesInParallel,
    startWorkspace,
    workspaceState,
    start,
    retry,
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
