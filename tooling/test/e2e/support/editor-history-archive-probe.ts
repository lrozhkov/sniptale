import { openDB } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
} from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { handleDatabaseUpgrade } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core';
import { initDB } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import {
  ASSET_ROOT_DIRECTORY_NAME,
  readAssetFile,
} from '../../../../apps/extension/src/composition/persistence/assets/opfs-store';
import { parseAssetRef } from '../../../../apps/extension/src/composition/persistence/assets/guards';
import { parseMediaLibraryEntry } from '../../../../apps/extension/src/composition/persistence/media-library/read-guards';
import { parseImageWorkspaceEntry } from '../../../../apps/extension/src/composition/persistence/image-workspaces/parser';
import { hydratePersistedEditorDocument } from '../../../../apps/extension/src/composition/persistence/document-assets/codec';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../apps/extension/src/features/editor/document/constants';
import { createArchiveMemorySink } from '../../../../apps/extension/src/composition/archive-transfer/test-support';
import { openArchiveReader } from '../../../../apps/extension/src/composition/archive-transfer';
import { buildMediaHubBackupExportPlanFromLibraryV6 } from '../../../../apps/extension/src/workflows/media-hub-backup/v6/inventory';
import { exportMediaHubBackupV6 } from '../../../../apps/extension/src/workflows/media-hub-backup/v6/export';
import { inspectMediaHubBackupV6 } from '../../../../apps/extension/src/workflows/media-hub-backup/v6/inspect';
import { createMediaHubRestoreSession } from '../../../../apps/extension/src/workflows/media-hub-backup/v6/restore-session';
import { restoreMediaHubBackupV6 } from '../../../../apps/extension/src/workflows/media-hub-backup/v6/restore';
import { mediaLibraryRootPublisher } from '../../../../apps/extension/src/workflows/media-hub-backup/v6/root-publication/media';
import { digestBackupObject } from '../../../../apps/extension/src/workflows/media-hub-backup/v6/shared-objects';
import type { ArchiveRestoreStrategy } from '../../../../apps/extension/src/composition/persistence/assets/contracts';

const ids = ['native-image-one', 'native-image-two'];
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';

async function seed() {
  const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'image/png' });
  const hash = await digestBackupObject({
    size: blob.size,
    pipeTo: (writable) => blob.stream().pipeTo(writable),
  });
  const root = await navigator.storage.getDirectory();
  const objects = await (
    await root.getDirectoryHandle(ASSET_ROOT_DIRECTORY_NAME, { create: true })
  ).getDirectoryHandle('objects', { create: true });
  const writer = await (
    await objects.getFileHandle('native-shared-image', { create: true })
  ).createWritable();
  await writer.write(bytes);
  await writer.close();
  const db = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  try {
    const tx = db.transaction(
      ['media_library', 'asset_refs', 'asset_owners', 'image_workspaces'],
      'readwrite'
    );
    await tx.objectStore('asset_refs').put({
      assetId: 'native-shared-image',
      mimeType: blob.type,
      size: blob.size,
      createdAt: 1,
      sha256: hash,
      location: { kind: 'opfs', objectKey: 'objects/native-shared-image' },
    });
    const { backgroundImageData: _background, ...frame } = DEFAULT_EDITOR_FRAME_SETTINGS;
    for (const id of ids) {
      await tx.objectStore('media_library').put({
        id,
        kind: 'image',
        filename: `${id}.png`,
        originalFilename: `${id}.png`,
        mimeType: blob.type,
        size: blob.size,
        width: 1,
        height: 1,
        duration: null,
        createdAt: 1,
        updatedAt: 1,
        sourceUrl: null,
        sourceTitle: null,
        sourceFavicon: null,
        source: { kind: 'stored-asset', assetId: 'native-shared-image' },
        tags: [],
        workspaceRevision: 1,
      });
      await tx.objectStore('image_workspaces').put({
        aggregateId: id,
        revision: 1,
        sourceUrl: null,
        sourceTitle: null,
        createdAt: 1,
        updatedAt: 1,
        document: {
          version: 3,
          sourceImage: { assetId: 'native-shared-image' },
          sourceName: `${id}.png`,
          sourceWidth: 1,
          sourceHeight: 1,
          canvasWidth: 1,
          canvasHeight: 1,
          sourceLeft: 0,
          sourceTop: 0,
          sourceDisplayWidth: 1,
          sourceDisplayHeight: 1,
          frame: { ...frame, backgroundImage: null },
          canvasJson: JSON.stringify({
            objects: [{ type: 'textbox', text: 'Sanitized caption '.repeat(128) }],
          }),
          assets: [{ assetId: 'native-shared-image', role: 'source-image' }],
        },
      });
      await tx.objectStore('asset_owners').put({
        assetId: 'native-shared-image',
        ownerId: id,
        ownerKind: 'media-library',
        role: 'source',
      });
      await tx.objectStore('asset_owners').put({
        assetId: 'native-shared-image',
        ownerId: id,
        ownerKind: 'image-workspace',
        role: 'source-image',
      });
    }
    await tx.done;
  } finally {
    db.close();
  }
  return { bytes: blob.size, sha256: hash };
}

async function assertReadableRoots() {
  const db = await initDB();
  const media = (await db.getAll('media_library')).map(parseMediaLibraryEntry);
  let readable = 0;
  for (const entry of media) {
    if (!entry || entry.source.kind !== 'stored-asset')
      throw new Error('Invalid native restored source.');
    const ref = parseAssetRef(await db.get('asset_refs', entry.source.assetId));
    if (!ref) throw new Error('Missing native restored ref.');
    const file = await readAssetFile(ref, entry.filename);
    if (btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer()))) !== png)
      throw new Error('Changed native restored bytes.');
    const workspace = parseImageWorkspaceEntry(await db.get('image_workspaces', entry.id));
    if (!workspace) throw new Error('Missing native restored workspace.');
    const hydrated = await hydratePersistedEditorDocument({
      document: workspace.document,
      refs: await db.getAll('asset_refs'),
    });
    if (!hydrated.document.canvasJson.includes('Sanitized caption'))
      throw new Error('Changed authored text.');
    hydrated.release();
    readable += 1;
  }
  return readable;
}

/** Actual native IDB/OPFS, production inventory, codec, staging and publisher roundtrip. */
export async function probe(strategy: ArchiveRestoreStrategy, failSecondRoot = false) {
  const source = await seed();
  const plan = await buildMediaHubBackupExportPlanFromLibraryV6({
    scope: 'selected',
    selected: { mediaAssetIds: ids, videoProjectIds: [], scenarioProjectIds: [] },
    includeDrafts: true,
    includeSourceMetadata: false,
    includeTelemetry: false,
    includeWebSnapshots: false,
  });
  const legacySink = createArchiveMemorySink();
  await exportMediaHubBackupV6({
    plan: { ...plan, manifest: { ...plan.manifest, layout: 'library-folders-v2' } },
    sink: legacySink.sink,
  });
  const sink = createArchiveMemorySink();
  await exportMediaHubBackupV6({ plan, sink: sink.sink });
  const inspection = await inspectMediaHubBackupV6(sink.blob());
  const reader = await openArchiveReader(sink.blob());
  const legacy = await openArchiveReader(legacySink.blob());
  let entries;
  try {
    const images = (path: string) => path.endsWith('-source-image');
    entries = {
      legacyServiceCopies: legacy.entries().filter((entry) => images(entry.path)).length,
      sharedServiceCopies: reader.entries().filter((entry) => images(entry.path)).length,
      selectedVisibleFiles: reader
        .entries()
        .filter((entry) => entry.path.startsWith('Screenshots/')).length,
      logicalObjects: inspection.manifest.totals.objects,
      sharedObjects: inspection.manifest.sharedObjects?.length ?? 0,
      json: reader
        .entries()
        .filter((entry) => entry.path.endsWith('/root.json'))
        .map(({ size, compressedSize }) => ({ size, compressedSize })),
    };
  } finally {
    await Promise.all([reader.close(), legacy.close()]);
  }
  const { session } = await createMediaHubRestoreSession({ file: sink.blob(), strategy });
  let failure = false;
  try {
    const publisher = failSecondRoot
      ? {
          ...mediaLibraryRootPublisher,
          async publish(args: Parameters<typeof mediaLibraryRootPublisher.publish>[0]) {
            if (args.envelope.descriptor.rootId === ids[1])
              throw new Error('Native second root publication refused.');
            return mediaLibraryRootPublisher.publish(args);
          },
        }
      : mediaLibraryRootPublisher;
    await restoreMediaHubBackupV6({
      file: sink.blob(),
      operationId: session.operationId,
      publishers: [publisher],
    });
  } catch (error) {
    if (
      !failSecondRoot ||
      !(error instanceof Error) ||
      error.message !== 'Native second root publication refused.'
    )
      throw error;
    failure = true;
  }
  const db = await initDB();
  return {
    source,
    ...entries,
    strategy,
    failure,
    readableRoots: await assertReadableRoots(),
    nativePhysicalRefs: (await db.getAll('asset_refs')).length,
    nativeOwners: (await db.getAll('asset_owners')).length,
  };
}
