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
import { saveVideoProject } from '../../../apps/extension/src/composition/persistence/projects';
import {
  parseAssetRef,
  publishReadyJournalWithRetry,
} from '../../../apps/extension/src/composition/persistence/assets';
import { publishPreparedReplicaJournal } from '../../../apps/extension/src/composition/persistence/sync-capture/replica-publication';
import { scanSyncCatalog } from '../../../apps/extension/src/workflows/sync-transfer/catalog';
import { syncCatalogRootKey } from '../../../apps/extension/src/workflows/sync-transfer/catalog-graph';
import { prepareCatalogReplica } from '../../../apps/extension/src/workflows/sync-transfer/incoming';
import type { CapturedChange } from '../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import { loadPreparedOutgoingOperation } from '../../../apps/extension/src/composition/persistence/sync-capture/outgoing';
import { loadOutgoingDispatchAttempt } from '../../../apps/extension/src/composition/persistence/sync-capture/outgoing-attempts';
import {
  prepareCapturedOutgoing,
  dispatchPreparedOutgoing,
} from '../../../apps/extension/src/workflows/sync-transfer/outgoing';
import type { SyncRemoteStore } from '../../../apps/extension/src/workflows/sync-transfer/remote-store';

/** Runs production encoding and dispatch over actual captured native sources. */
export function createWebdavOutgoingHarness(
  connected: () => SyncRemoteStore,
  latest: (rootId: string) => Promise<CapturedChange>
) {
  let catalog: Awaited<ReturnType<typeof scanSyncCatalog>> | null = null;
  const signal = () => new AbortController().signal;
  const check = (condition: unknown) => {
    if (!condition) throw new Error('Native catalog fixture is unavailable.');
  };
  async function localState(spaceId: string, kind: 'media' | 'video-project', rootId: string) {
    const db = await initDB();
    const row = parseSyncCaptureRecord(
      await db.get(
        SYNC_CAPTURE_STORE,
        JSON.stringify(['root-state', captureRootKey(spaceId, kind, rootId)])
      )
    );
    return row?.kind === 'root-state' ? row : null;
  }
  return {
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
    async sendHistory(rootId: string) {
      const db = await initDB();
      const captures = (await db.getAll(SYNC_CAPTURE_STORE))
        .flatMap((raw) => {
          const parsed = parseSyncCaptureRecord(raw);
          return parsed?.kind === 'captured-change' && parsed.rootId === rootId ? [parsed] : [];
        })
        .sort((left, right) => left.generation - right.generation);
      const sent = [];
      for (const capture of captures) {
        const prepared = await prepareCapturedOutgoing(capture);
        const attempt = await dispatchPreparedOutgoing(
          prepared.spaceId,
          prepared.operationId,
          connected(),
          signal()
        );
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
      return sent;
    },
    async scan(spaceId: string) {
      catalog = await scanSyncCatalog(connected(), spaceId, signal());
      return {
        operations: catalog.operations.size,
        attempts: [...catalog.operations.values()].reduce(
          (total, operation) => total + operation.attempts.length,
          0
        ),
        roots: [...catalog.roots.values()],
        pending: catalog.pending,
        quarantined: catalog.quarantined,
        invalid: catalog.invalid,
        metadataBytes: catalog.metadataBytes,
      };
    },
    async receive(spaceId: string, rootKind: 'media' | 'video-project', rootId: string) {
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
        if (!entry || entry.source.kind !== 'project-asset')
          throw new Error('Local Library source is missing.');
        const child = parseProjectAssetEntry(
          await db.get('project_assets', entry.source.projectAssetId)
        );
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
      const journal = await prepareCatalogReplica({
        remote: connected(),
        catalog,
        rootKind,
        rootId,
        signal: signal(),
        admission: {
          connectionGeneration: 3,
          expectedLocalGeneration: state?.generation ?? 0,
          expectedWorkspaceRevision: null,
          dependencies,
        },
      });
      await publishReadyJournalWithRetry(journal, publishPreparedReplicaJournal);
      return { rootId, operationId: journal.payload.input.operationId };
    },
    prepare: async (rootId: string) => {
      const prepared = await prepareCapturedOutgoing(await latest(rootId));
      return {
        spaceId: prepared.spaceId,
        operationId: prepared.operationId,
        recordText: prepared.recordText,
        recordSha256: prepared.recordSha256,
        attemptKey: prepared.attemptKey,
        objects: prepared.objects.map((item) => ({
          objectId: item.objectId,
          key: item.remoteKey,
          size: item.ref.size,
          sha256: item.sha256,
        })),
      };
    },
    send: (spaceId: string, operationId: string) =>
      dispatchPreparedOutgoing(spaceId, operationId, connected(), new AbortController().signal),
    prepared: loadPreparedOutgoingOperation,
    attempt: loadOutgoingDispatchAttempt,
  };
}
