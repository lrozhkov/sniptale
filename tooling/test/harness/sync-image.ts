import { updateMediaLibraryEntry } from '../../../apps/extension/src/composition/persistence/media-library/index.library';
import {
  moveStoredItemsToTrash,
  restoreStoredItemsFromTrash,
} from '../../../apps/extension/src/composition/persistence/library-lifecycle/trash';
import { createWebdavOutgoingHarness } from './webdav-outgoing';
import {
  initDB,
  SYNC_CAPTURE_STORE,
} from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import { installExperimentalCaptureProfile } from '../../../apps/extension/src/composition/persistence/sync-capture/profile';
import { parseSyncCaptureRecord } from '../../../apps/extension/src/composition/persistence/sync-capture/guards';
import { saveScreenshotMediaAsset } from '../../../apps/extension/src/composition/persistence/media-library/index.screenshots';
import { parseMediaLibraryEntry } from '../../../apps/extension/src/composition/persistence/media-library/read-guards';
import {
  copyImageAggregate,
  restoreImageAggregateOriginal,
} from '../../../apps/extension/src/composition/persistence/image-aggregates';
import { recoverAssetPublications } from '../../../apps/extension/src/composition/persistence/asset-publication-recovery';
import {
  listReadyJournals,
  listAssetObjectIds,
} from '../../../apps/extension/src/composition/persistence/assets';
import {
  SyncRemoteError,
  type SyncRemoteStore,
} from '../../../apps/extension/src/workflows/sync-transfer/remote-store';

const SPACE = 'native-image-browser-proof';
const files = new Map<string, Blob>();
function file(key: string) {
  const value = files.get(key);
  if (!value) throw new SyncRemoteError('missing', 404);
  return value;
}
// Tiny transfer fixture. Production preparation, dispatch, verification, and apply remain unchanged.
const remote: SyncRemoteStore = {
  async list(prefix, { signal, cursor }) {
    signal.throwIfAborted();
    if (cursor) throw new SyncRemoteError('unsupported-cursor');
    const objects = [];
    const prefixes = new Set<string>();
    for (const [key, body] of files) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash < 0) objects.push({ key, size: body.size });
      else prefixes.add(prefix + rest.slice(0, slash + 1));
    }
    return { objects, prefixes: [...prefixes], nextCursor: null };
  },
  async stat(key, signal) {
    signal.throwIfAborted();
    return { size: file(key).size };
  },
  async read(key, signal) {
    signal.throwIfAborted();
    return file(key).stream();
  },
  async write(key, body, signal) {
    signal.throwIfAborted();
    files.set(key, body);
  },
};
const outgoing = createWebdavOutgoingHarness(
  () => remote,
  async (rootId) => {
    const db = await initDB();
    const operations = (await db.getAll(SYNC_CAPTURE_STORE))
      .flatMap((raw) => {
        const value = parseSyncCaptureRecord(raw);
        return value?.kind === 'sync-operation' && value.rootId === rootId ? [value] : [];
      })
      .sort((a, b) => b.generation - a.generation);
    if (!operations[0]) throw new Error('Image capture is missing.');
    return operations[0];
  }
);
async function hash(blob: Blob) {
  const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function inspect(rootId: string) {
  const db = await initDB();
  const media = parseMediaLibraryEntry(await db.get('media_library', rootId));
  const workspace = await db.get('image_workspaces', rootId);
  const presentation = await db.get('aggregate_presentations', ['image', rootId]);
  const operations = (await db.getAll(SYNC_CAPTURE_STORE)).flatMap((raw) => {
    const value = parseSyncCaptureRecord(raw);
    return value?.kind === 'sync-operation' && value.rootId === rootId ? [value] : [];
  });
  return {
    exists: media !== null,
    lifecycle: media?.lifecycle ?? null,
    filename: media?.filename ?? null,
    revision: media?.workspaceRevision ?? null,
    hash: media?.blob instanceof Blob ? await hash(media.blob) : null,
    workspace: workspace ? JSON.parse(JSON.stringify(workspace)) : null,
    presentationRevision: presentation?.presentationRevision ?? null,
    operations: operations.map((value) => ({ phase: value.phase, generation: value.generation })),
    journals: (await listReadyJournals()).filter((value) => value.domain === 'sync-replica').length,
    assetIds: await listAssetObjectIds(),
  };
}
export const imageHarness = {
  inspect,
  async rename(rootId: string, filename: string) {
    await updateMediaLibraryEntry(rootId, { filename });
    return inspect(rootId);
  },
  async trash(rootId: string, restore = false) {
    const targets = [{ kind: 'media' as const, id: rootId }];
    if (restore) await restoreStoredItemsFromTrash(targets);
    else await moveStoredItemsToTrash(targets);
    return inspect(rootId);
  },
  async seed(rootId: string) {
    await installExperimentalCaptureProfile({
      version: 1,
      kind: 'profile',
      key: 'profile',
      createdAt: Date.now(),
      enabled: true,
      spaceId: SPACE,
      connectionGeneration: 3,
    });
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image canvas is missing.');
    context.fillStyle = '#2f5fd0';
    context.fillRect(0, 0, 320, 180);
    context.fillStyle = '#f4c542';
    context.fillRect(40, 40, 120, 70);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Image encoding failed.'))),
        'image/png'
      )
    );
    await saveScreenshotMediaAsset({ id: rootId, filename: 'original image 100%.png', blob });
    return inspect(rootId);
  },
  async publish(rootId: string, prior: { key: string; type: string; bytes: number[] }[] = []) {
    for (const item of prior)
      files.set(item.key, new Blob([new Uint8Array(item.bytes)], { type: item.type }));
    const sent = await outgoing.sendHistory(rootId);
    const snapshot = await Promise.all(
      [...files].map(async ([key, body]) => ({
        key,
        type: body.type,
        bytes: [...new Uint8Array(await body.arrayBuffer())],
      }))
    );
    return { sent, files: snapshot, native: await inspect(rootId) };
  },
  async receive(
    rootId: string,
    snapshot: { key: string; type: string; bytes: number[] }[],
    deferPublication = false
  ) {
    files.clear();
    for (const item of snapshot)
      files.set(item.key, new Blob([new Uint8Array(item.bytes)], { type: item.type }));
    const catalog = await outgoing.scan(SPACE);
    if (catalog.invalid.length || catalog.quarantined.length || catalog.pending.length)
      throw new Error('Image catalog is incomplete.');
    await outgoing.receive(SPACE, 'media', rootId, deferPublication);
    return inspect(rootId);
  },
  async recover(rootId: string) {
    await recoverAssetPublications();
    return inspect(rootId);
  },
  async copyAndRestore(rootId: string) {
    const before = await inspect(rootId);
    if (before.revision === null) throw new Error('Image revision is missing.');
    const copyId = await copyImageAggregate({
      aggregateId: rootId,
      expectedWorkspaceRevision: before.revision,
      targetAggregateId: `${rootId}-copy`,
    });
    await restoreImageAggregateOriginal(rootId, before.revision);
    return { copy: await inspect(copyId), restored: await inspect(rootId) };
  },
};
