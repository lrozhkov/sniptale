import { createWebdavOutgoingHarness } from './webdav-outgoing';
import { importMediaHubBackup } from '../../../apps/extension/src/workflows/media-hub-backup/v6/public';
import type { VideoProjectEntry } from '../../../apps/extension/src/composition/persistence/projects/contracts';
import { buildMediaHubBackupExportPlanFromLibraryV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/inventory';
import { createMediaHubBackupExportOptions } from '../../../apps/extension/src/workflows/media-hub-backup/v6/options';
import { exportMediaHubBackupV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/export';
import { inspectMediaHubBackupV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/inspect';
import { createArchiveMemorySink } from '../../../apps/extension/src/composition/archive-transfer/test-support';
import { openArchiveReader } from '../../../apps/extension/src/composition/archive-transfer';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
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
  captureRootKey,
  type CapturedMediaDependency,
} from '../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import {
  parseAssetRef,
  readAssetFile,
  publishReadyJournalWithRetry,
  type AssetRef,
} from '../../../apps/extension/src/composition/persistence/assets';
import {
  createPreparedReplicaJournal,
  publishPreparedReplicaJournal,
} from '../../../apps/extension/src/composition/persistence/sync-capture/replica-publication';
import { encodeCapturedPortableRoot } from '../../../apps/extension/src/workflows/sync-transfer/captured-root';
import {
  parsePortableSyncRoot,
  preparePortableReplica,
  type PortableReplicaAdmission,
} from '../../../apps/extension/src/workflows/sync-transfer/prepared-root';
import { stageRootObjects } from '../../../apps/extension/src/workflows/media-hub-backup/v6/staging';
import { digestBackupObject } from '../../../apps/extension/src/workflows/media-hub-backup/v6/shared-objects';
import { parseBoundedJson } from '../../../apps/extension/src/workflows/media-hub-backup/v6/codec';
import type { SyncRemoteStore } from '../../../apps/extension/src/workflows/sync-transfer/remote-store';

const spaceId = 'provider-native-portable';
const signal = () => new AbortController().signal;
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
      return row?.kind === 'captured-change' && row.rootId === rootId ? [row] : [];
    })
    .sort((a, b) => b.generation - a.generation);
  check(rows[0], 'Native capture is missing.');
  return rows[0];
}
async function state(kind: 'media' | 'video-project', id: string) {
  const db = await initDB();
  const row = parseSyncCaptureRecord(
    await db.get(
      SYNC_CAPTURE_STORE,
      JSON.stringify(['root-state', captureRootKey(spaceId, kind, id)])
    )
  );
  return row?.kind === 'root-state' ? row : null;
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
  async function send(rootId: string, key: string) {
    const capture = await latest(rootId);
    const encoded = await encodeCapturedPortableRoot(capture);
    const objects = [];
    for (const [index, object] of encoded.objects.entries()) {
      const objectKey = `${key}/${index}-${object.ref.filename}`;
      const sha256 = await hash(object.blob);
      await connected().write(objectKey, object.blob, signal());
      objects.push({
        objectId: object.ref.objectId,
        key: objectKey,
        sha256,
        size: object.blob.size,
      });
    }
    const metadata = new Blob(
      [
        JSON.stringify({
          envelope: encoded.envelope,
          dependencies: encoded.dependencies,
          operationId: capture.operationId,
          objects,
        }),
      ],
      { type: 'application/json' }
    );
    await connected().write(`${key}/metadata.json`, metadata, signal());
    return objects;
  }
  async function source(options: { skipFixtureTransfer?: boolean } = {}) {
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
    const borrowed = options.skipFixtureTransfer ? [] : await send(mediaId, 'Originals/borrowed');
    const project = options.skipFixtureTransfer ? [] : await send(entry.id, 'Projects/native');
    if (!options.skipFixtureTransfer)
      await connected().write('Exports/saved-export.png', exported, signal());
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
      objects: [...borrowed, ...project],
      exported: { size: exported.size, sha256: await hash(exported) },
    };
  }
  async function receive(key: string, dependencies: PortableReplicaAdmission['dependencies']) {
    const stream = await connected().read(`${key}/metadata.json`, signal());
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let bytes = 0;
    await stream.pipeTo(
      new WritableStream({
        write(chunk: Uint8Array) {
          bytes += chunk.byteLength;
          check(bytes <= 4 * 1024 * 1024, 'Fixture metadata exceeds limit.');
          chunks.push(new Uint8Array(chunk));
        },
      })
    );
    const metadata = new Blob(chunks);
    const raw = parseBoundedJson(await metadata.text());
    check(
      isRecord(raw) &&
        typeof raw['operationId'] === 'string' &&
        Array.isArray(raw['objects']) &&
        Array.isArray(raw['dependencies']),
      'Invalid fixture bundle.'
    );
    const parsed = await parsePortableSyncRoot(raw['envelope']);
    const senderDependencies: CapturedMediaDependency[] = raw['dependencies'].map(
      (item: unknown) => {
        check(
          isRecord(item) &&
            typeof item['mediaId'] === 'string' &&
            typeof item['generation'] === 'number' &&
            Array.isArray(item['basis']) &&
            item['basis'].every((value: unknown) => typeof value === 'string'),
          'Invalid causal descriptor.'
        );
        return { mediaId: item['mediaId'], generation: item['generation'], basis: item['basis'] };
      }
    );
    const table = raw['objects'].map((item: unknown) => {
      check(
        isRecord(item) &&
          typeof item['objectId'] === 'string' &&
          typeof item['key'] === 'string' &&
          typeof item['sha256'] === 'string' &&
          typeof item['size'] === 'number',
        'Invalid object descriptor.'
      );
      return {
        objectId: item['objectId'],
        key: item['key'],
        sha256: item['sha256'],
        size: item['size'],
      };
    });
    const editingIds =
      parsed.kind === 'media'
        ? [parsed.metadata.originalObjectId]
        : parsed.metadata.projectAssets
            .filter((asset) => !asset.libraryMediaId)
            .map((asset) => asset.objectId);
    const selected = parsed.envelope.objects.filter((object) =>
      editingIds.includes(object.objectId)
    );
    const staged = await stageRootObjects({
      objects: selected,
      expectedSha256: new Map(
        selected.map((object) => {
          const row = table.find((item) => item.objectId === object.objectId);
          check(row && row.size === object.size, 'Object manifest differs.');
          return [object.objectId, row.sha256];
        })
      ),
      signal: signal(),
      async readObject(object) {
        const row = table.find((item) => item.objectId === object.objectId);
        check(row, 'Object mapping is missing.');
        const body = await connected().read(row.key, signal());
        return { pipeTo: (sink, abort) => body.pipeTo(sink, abort ? { signal: abort } : {}) };
      },
    });
    const refs = new Map<string, AssetRef>(staged.map((object) => [object.objectId, object.ref]));
    if (parsed.kind === 'video-project')
      for (const asset of parsed.metadata.projectAssets)
        if (asset.libraryMediaId) {
          const local = dependencies.find((item) => item.entry.id === asset.libraryMediaId);
          check(local, 'Borrowed target binding is missing.');
          const row = table.find((item) => item.objectId === asset.objectId);
          check(
            row &&
              (await hash(await readAssetFile(local.ref, asset.filename))) === row.sha256 &&
              local.ref.size === row.size,
            'Borrowed target bytes differ.'
          );
          refs.set(asset.objectId, local.ref);
        }
    const local = await state(parsed.kind, parsed.envelope.descriptor.rootId);
    const payload = await preparePortableReplica({
      envelope: parsed.envelope,
      verifiedObjects: refs,
      senderDependencies,
      admission: {
        operationId: raw['operationId'],
        sourceDigest: await hash(metadata),
        connectionGeneration: 3,
        expectedLocalGeneration: local?.generation ?? 0,
        expectedWorkspaceRevision: null,
        dependencies,
      },
    });
    const journal = await createPreparedReplicaJournal(payload);
    await publishReadyJournalWithRetry(journal, publishPreparedReplicaJournal);
    return parsed.envelope.descriptor.rootId;
  }
  async function target() {
    await profile(3);
    const db = await initDB();
    check(
      (await db.getAll('video_projects')).length === 0 &&
        (await db.getAll('media_library')).length === 0,
      'Target profile is not empty.'
    );
    const mediaId = await receive('Originals/borrowed', []);
    const media = parseMediaLibraryEntry(await db.get('media_library', mediaId));
    check(media?.source.kind === 'project-asset', 'Borrowed admission is missing.');
    const child = parseProjectAssetEntry(
      await db.get('project_assets', media.source.projectAssetId)
    );
    check(child, 'Borrowed child is missing.');
    const ref = parseAssetRef(await db.get('asset_refs', child.assetId));
    const root = await state('media', mediaId);
    check(ref && root, 'Borrowed causal state is missing.');
    const projectId = await receive('Projects/native', [
      { entry: media, ref, expectedGeneration: root.generation, expectedBasis: root.basis },
    ]);
    return proof(projectId);
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
    target,
    proof,
    afterSaveBackup,
    outgoing: createWebdavOutgoingHarness(connected, latest),
  };
}
