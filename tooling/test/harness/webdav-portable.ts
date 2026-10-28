import {
  moveStoredItemsToTrash,
  restoreStoredItemsFromTrash,
} from '../../../apps/extension/src/composition/persistence/library-lifecycle/trash';
import { imageHarness } from './sync-image';
import { saveScreenshotMediaAsset } from '../../../apps/extension/src/composition/persistence/media-library/index.screenshots';
import { restoreImageAggregateOriginal } from '../../../apps/extension/src/composition/persistence/image-aggregates';
import { createWebdavOutgoingHarness } from './webdav-outgoing';
import { importMediaHubBackup } from '../../../apps/extension/src/workflows/media-hub-backup/v6/public';
import type { VideoProjectEntry } from '../../../apps/extension/src/composition/persistence/projects/contracts';
import { buildMediaHubBackupExportPlanFromLibraryV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/inventory';
import { createMediaHubBackupExportOptions } from '../../../apps/extension/src/workflows/media-hub-backup/v6/options';
import { exportMediaHubBackupV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/export';
import { inspectMediaHubBackupV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/inspect';
import { createArchiveMemorySink } from '../../../apps/extension/src/composition/archive-transfer/test-support';
import { openArchiveReader } from '../../../apps/extension/src/composition/archive-transfer';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../apps/extension/src/features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../apps/extension/src/features/video/project/types';
import {
  saveProjectAsset,
  saveVideoProject,
} from '../../../apps/extension/src/composition/persistence/projects';
import { saveProjectExport } from '../../../apps/extension/src/composition/persistence/projects/index.exports';
import {
  parseProjectAssetEntry,
  parseVideoProjectEntry,
} from '../../../apps/extension/src/composition/persistence/projects/read-guards';
import { parseMediaLibraryEntry } from '../../../apps/extension/src/composition/persistence/media-library/read-guards';
import {
  initDB,
  SYNC_CAPTURE_STORE,
} from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import { installExperimentalCaptureProfile } from '../../../apps/extension/src/composition/persistence/sync-capture/profile';
import { parseSyncCaptureRecord } from '../../../apps/extension/src/composition/persistence/sync-capture/guards';
import {
  parseAssetRef,
  readAssetFile,
} from '../../../apps/extension/src/composition/persistence/assets';
import { encodeCapturedPortableRoot } from '../../../apps/extension/src/workflows/sync-transfer/captured-root';
import { digestBackupObject } from '../../../apps/extension/src/workflows/media-hub-backup/v6/shared-objects';
import type { SyncRemoteStore } from '../../../apps/extension/src/workflows/sync-transfer/remote-store';

const spaceId = 'provider-native-portable';
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function profile(connectionGeneration: number) {
  await installExperimentalCaptureProfile({
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: Date.now(),
    enabled: true,
    spaceId,
    connectionGeneration,
  });
}
async function hash(blob: Blob) {
  return digestBackupObject({
    size: blob.size,
    pipeTo: (sink, abort) => blob.stream().pipeTo(sink, abort ? { signal: abort } : {}),
  });
}
async function png(color: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 24;
  const context = canvas.getContext('2d');
  check(context, 'Canvas is unavailable.');
  context.fillStyle = color;
  context.fillRect(0, 0, 24, 24);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))),
      'image/png'
    )
  );
}
async function latest(rootId: string) {
  const db = await initDB();
  const rows = (await db.getAll(SYNC_CAPTURE_STORE))
    .flatMap((raw) => {
      const row = parseSyncCaptureRecord(raw);
      return row?.kind === 'sync-operation' && row.rootId === rootId ? [row] : [];
    })
    .sort((a, b) => b.generation - a.generation);
  check(rows[0], 'Native capture is missing.');
  return rows[0];
}

async function nativeProjectObjects(entry: VideoProjectEntry) {
  const db = await initDB();
  const objects: { size: number; sha256: string }[] = [];
  for (const asset of entry.project.assets) {
    const source = asset.source;
    let projectAssetId: string;
    if (source.kind === 'project-asset') projectAssetId = source.projectAssetId;
    else {
      check(source.kind === 'library-asset', 'Restored project source is unsupported.');
      const media = parseMediaLibraryEntry(await db.get('media_library', source.mediaId));
      check(media?.source.kind === 'project-asset', 'Restored Library source is missing.');
      projectAssetId = media.source.projectAssetId;
    }
    const child = parseProjectAssetEntry(await db.get('project_assets', projectAssetId));
    check(child, 'Restored source child is missing.');
    const ref = parseAssetRef(await db.get('asset_refs', child.assetId));
    check(ref, 'Restored source reference is missing.');
    const file = await readAssetFile(ref, 'source.png');
    check(
      file.size === asset.metadata.size && file.size === ref.size,
      'Restored source size differs.'
    );
    objects.push({ size: file.size, sha256: await hash(file) });
  }
  return objects;
}

/** Read the editor's native after-image and verify its ordinary backup objects. */
async function afterSaveBackup(input: {
  projectId: string;
  mediaId: string;
  clipId: string;
  editing: { size: number; sha256: string }[];
  exported: { sha256: string };
}) {
  const captured = await latest(input.projectId);
  check(
    captured.change.kind === 'video-project' && captured.generation > 1,
    'The editor did not capture a native project after-image.'
  );
  const db = await initDB();
  const current = parseVideoProjectEntry(await db.get('video_projects', input.projectId));
  check(
    current &&
      JSON.stringify(captured.change.rows.project) === JSON.stringify(current) &&
      captured.change.rows.project.project.clips.some((clip) => clip.id === input.clipId),
    'The latest capture differs from the saved editor after-image.'
  );
  const portable = await encodeCapturedPortableRoot(captured);
  check(
    portable.envelope.descriptor.rootId === input.projectId &&
      captured.change.rows.exports.length === 0,
    'The edited portable capture resurrected a saved export.'
  );
  const plan = await buildMediaHubBackupExportPlanFromLibraryV6(
    createMediaHubBackupExportOptions({
      scope: 'selected',
      selected: {
        mediaAssetIds: [],
        scenarioProjectIds: [],
        videoProjectIds: [input.projectId],
      },
    })
  );
  const sink = createArchiveMemorySink();
  await exportMediaHubBackupV6({ plan, sink: sink.sink });
  const archive = sink.blob();
  const inspected = await inspectMediaHubBackupV6(archive);
  check(
    inspected.descriptors.some(
      (item) => item.rootKind === 'video-project' && item.rootId === input.projectId
    ) &&
      inspected.descriptors.some(
        (item) => item.rootKind === 'media' && item.rootId === input.mediaId
      ),
    'The backup omitted the project or its borrowed source descriptor.'
  );
  const reader = await openArchiveReader(archive);
  const objects: { size: number; sha256: string }[] = [];
  try {
    for (const entry of reader.entries().filter((item) => item.path.endsWith('.png'))) {
      const source = reader.entry(entry.path);
      check(source, 'The backup PNG object is missing.');
      objects.push({ size: source.size, sha256: await digestBackupObject(source) });
    }
  } finally {
    await reader.close();
  }
  const expected = input.editing.map((item) => `${item.size}:${item.sha256}`).sort();
  const actual = objects.map((item) => `${item.size}:${item.sha256}`).sort();
  check(
    JSON.stringify(actual) === JSON.stringify(expected) &&
      !objects.some((item) => item.sha256 === input.exported.sha256),
    'Backup PNG bytes differ from editing sources or contain the saved export.'
  );
  const originalObjects = await nativeProjectObjects(current);
  const originalSnapshot = JSON.stringify(current);
  const previousIds = new Set(await db.getAllKeys('video_projects'));
  const imported = await importMediaHubBackup(archive, 'duplicate');
  check(
    imported.imported === inspected.descriptors.length && imported.skipped === 0,
    'Duplicate backup import did not restore every selected root.'
  );
  const newIds = (await db.getAllKeys('video_projects')).filter((id) => !previousIds.has(id));
  check(
    newIds.length === 1 && newIds[0],
    'Duplicate backup import did not create exactly one project.'
  );
  const restored = parseVideoProjectEntry(await db.get('video_projects', newIds[0]));
  check(restored, 'The restored native project is invalid.');
  const restoredObjects = await nativeProjectObjects(restored);
  check(
    JSON.stringify(restoredObjects.map((item) => `${item.size}:${item.sha256}`).sort()) ===
      JSON.stringify(expected),
    'Restored native sources differ from the original editing bytes.'
  );
  const original = parseVideoProjectEntry(await db.get('video_projects', input.projectId));
  check(
    original &&
      JSON.stringify(original) === originalSnapshot &&
      original.project.clips.some((clip) => clip.id === input.clipId) &&
      JSON.stringify(await nativeProjectObjects(original)) === JSON.stringify(originalObjects),
    'Duplicate backup import changed the original native project or source bytes.'
  );
  check(
    (await db.getAll('project_exports')).length === 0,
    'Duplicate backup import resurrected a saved export.'
  );
  return {
    imported: imported.imported,
    clonedProjectId: restored.id,
    restoredObjects,
    originalUnchanged: true,
    generation: captured.generation,
    portableEncoded: true,
    projectIncluded: true,
    borrowedSourceIncluded: true,
    exportAbsent: true,
    objects,
  };
}

/** Disposable acceptance fixture, not a production ingress or wire protocol. */
export function createWebdavPortableHarness(connected: () => SyncRemoteStore) {
  async function source() {
    await profile(19);
    const privateId = crypto.randomUUID();
    const borrowedId = crypto.randomUUID();
    const privateFile = await png('rgb(240,80,20)');
    const borrowedFile = await png('rgb(20,180,60)');
    await saveProjectAsset(privateId, privateFile, privateFile.type, 'private.png', Date.now(), {
      publishToLibrary: false,
    });
    await saveProjectAsset(borrowedId, borrowedFile, borrowedFile.type, 'borrowed 100%.png');
    const mediaId = `project-asset:${borrowedId}`;
    const candidate = createEmptyVideoProject('WebDAV native portable project', 1280, 720);
    candidate.assets = [privateFile, borrowedFile].map((file, index) =>
      createVideoProjectAsset(
        index ? 'Borrowed original' : 'Private original',
        VideoProjectAssetType.IMAGE,
        index
          ? { kind: 'library-asset', mediaId }
          : { kind: 'project-asset', projectAssetId: privateId },
        {
          width: 24,
          height: 24,
          duration: null,
          mimeType: file.type,
          size: file.size,
          hasAudio: false,
          audioPeaks: null,
        }
      )
    );
    const track = candidate.tracks[0];
    check(track, 'Root track is missing.');
    const second = {
      ...structuredClone(track),
      id: crypto.randomUUID(),
      isRoot: false,
      name: 'Borrowed source',
      order: 2,
    };
    candidate.tracks.push(second);
    candidate.clips = candidate.assets.map((asset, index) => {
      const clip = createVideoClipFromAsset(index ? second.id : track.id, asset, 1280, 720);
      return {
        ...clip,
        duration: 2,
        fadeInMs: 0,
        fadeOutMs: 0,
        transform: { ...clip.transform, x: index * 640, y: 0, width: 640, height: 720 },
      };
    });
    candidate.duration = 2;
    let entry = await saveVideoProject(candidate, {
      expectedProject: null,
      expectedWorkspaceRevision: null,
    });
    const exportId = crypto.randomUUID();
    const exported = await png('rgb(20,80,240)');
    await saveProjectExport({
      id: exportId,
      projectId: entry.id,
      filename: 'saved-export.png',
      createdAt: Date.now(),
      duration: 2,
      width: 24,
      height: 24,
      fps: 30,
      mimeType: exported.type,
      blob: exported,
    });
    // Capture the saved export in the actual frozen project snapshot.
    entry = await saveVideoProject(
      { ...entry.project, name: candidate.name },
      { expectedProject: entry.project, expectedWorkspaceRevision: entry.workspaceRevision ?? null }
    );
    const frozen = await latest(entry.id);
    check(
      frozen.change.kind === 'video-project' &&
        frozen.change.rows.exports.some((item) => item.id === exportId),
      'Saved export is missing from actual frozen capture.'
    );
    return {
      projectId: entry.id,
      mediaId,
      clipId: candidate.clips[0]!.id,
      exportId,
      editing: await Promise.all(
        [privateFile, borrowedFile].map(async (file) => ({
          size: file.size,
          sha256: await hash(file),
        }))
      ),
      exported: { size: exported.size, sha256: await hash(exported) },
    };
  }
  async function proof(projectId: string) {
    const db = await initDB();
    const entry = parseVideoProjectEntry(await db.get('video_projects', projectId));
    check(entry, 'Native project is missing.');
    const objects = [];
    for (const asset of entry.project.assets) {
      const source = asset.source;
      let id: string;
      if (source.kind === 'project-asset') id = source.projectAssetId;
      else {
        check(source.kind === 'library-asset', 'Unsupported source.');
        const media = parseMediaLibraryEntry(await db.get('media_library', source.mediaId));
        check(media?.source.kind === 'project-asset', 'Library source is missing.');
        id = media.source.projectAssetId;
      }
      const child = parseProjectAssetEntry(await db.get('project_assets', id));
      check(child, 'Source child is missing.');
      const ref = parseAssetRef(await db.get('asset_refs', child.assetId));
      check(ref, 'Source ref is missing.');
      const file = await readAssetFile(ref, 'source.png');
      check(file.size === asset.metadata.size, 'Native source size differs.');
      objects.push({ size: file.size, sha256: await hash(file) });
      if (source.kind === 'project-asset')
        check(
          (await db.get('media_library', `project-asset:${id}`)) === undefined,
          'Private source was published to Library.'
        );
    }
    check((await db.getAll('project_exports')).length === 0, 'Saved export was resurrected.');
    return {
      projectId,
      objects,
      clipIds: entry.project.clips.map((clip) => clip.id),
      exportAbsent: true,
    };
  }
  return {
    source,
    proof,
    async imageSource() {
      await profile(3);
      const rootId = crypto.randomUUID();
      await saveScreenshotMediaAsset({
        id: rootId,
        filename: 'original: image 100%?.png',
        blob: await png('rgb(20,80,240)'),
      });
      await restoreImageAggregateOriginal(rootId, 0);
      return { rootId, spaceId, native: await imageHarness.inspect(rootId) };
    },
    async imageRevise(rootId: string) {
      const before = await imageHarness.inspect(rootId);
      if (before.revision === null) throw new Error('Image revision is missing.');
      await restoreImageAggregateOriginal(rootId, before.revision);
      return imageHarness.inspect(rootId);
    },
    imageProof: imageHarness.inspect,
    imageTrash: imageHarness.trash,
    async lifecycleRoots(mediaId: string, projectId: string, restore: boolean) {
      const targets = [
        { kind: 'video-project' as const, id: projectId },
        { kind: 'media' as const, id: mediaId },
      ];
      if (restore) await restoreStoredItemsFromTrash(targets);
      else await moveStoredItemsToTrash(targets);
    },
    async originalBinding(mediaId: string) {
      const db = await initDB();
      const entry = parseMediaLibraryEntry(await db.get('media_library', mediaId));
      check(entry?.source.kind === 'project-asset', 'Original source is missing.');
      const child = parseProjectAssetEntry(
        await db.get('project_assets', entry.source.projectAssetId)
      );
      check(child, 'Original child is missing.');
      const ref = parseAssetRef(await db.get('asset_refs', child.assetId));
      check(ref, 'Original reference is missing.');
      return {
        assetId: ref.assetId,
        lifecycle: entry.lifecycle,
        sha256: await hash(await readAssetFile(ref, entry.filename)),
      };
    },
    afterSaveBackup,
    outgoing: createWebdavOutgoingHarness(connected, latest),
  };
}
