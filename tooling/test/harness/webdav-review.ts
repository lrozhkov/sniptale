import { saveRecordingsBatch } from '../../../apps/extension/src/composition/persistence/recordings/batch';
import { parseRecordingEntry } from '../../../apps/extension/src/composition/persistence/recordings/index.guards';
import { saveRecordingTelemetry } from '../../../apps/extension/src/composition/persistence/recordings/telemetry';
import { saveMediaThumbnail } from '../../../apps/extension/src/composition/persistence/media-library/index.library';
import { loadVideoReviewSource } from '../../../apps/extension/src/workflows/video-review/source';
import { createWebdavOutgoingHarness } from './webdav-outgoing';
import { saveProjectAsset } from '../../../apps/extension/src/composition/persistence/projects';
import {
  initDB,
  SYNC_CAPTURE_STORE,
} from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import { parseProjectAssetEntry } from '../../../apps/extension/src/composition/persistence/projects/read-guards';
import { parseMediaLibraryEntry } from '../../../apps/extension/src/composition/persistence/media-library/read-guards';
import { updateMediaLibraryEntry } from '../../../apps/extension/src/composition/persistence/media-library/index.library';
import {
  parseAssetRef,
  readAssetFile,
} from '../../../apps/extension/src/composition/persistence/assets';
import { installExperimentalCaptureProfile } from '../../../apps/extension/src/composition/persistence/sync-capture/profile';
import { parseSyncCaptureRecord } from '../../../apps/extension/src/composition/persistence/sync-capture/guards';
import {
  readVideoWorkspace,
  commitVideoWorkspace,
  saveVideoWorkspaceDraft,
  createVideoWorkspaceProject,
} from '../../../apps/extension/src/composition/persistence/review-workspaces/store';
import { collectReviewAssetReferences } from '../../../apps/extension/src/composition/persistence/review-workspaces/asset-refs';
import { reviewAdvancedContentBaseline } from '../../../apps/extension/src/features/video/review/document';
import { updateQuickEditBackground } from '../../../apps/extension/src/features/video/review/advanced/background';
import { digestBackupObject } from '../../../apps/extension/src/workflows/media-hub-backup/v6/shared-objects';
import type { SyncRemoteStore } from '../../../apps/extension/src/workflows/sync-transfer/remote-store';

const spaceId = 'provider-native-review';
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function hash(blob: Blob) {
  return digestBackupObject({
    size: blob.size,
    pipeTo: (sink, signal) => blob.stream().pipeTo(sink, signal ? { signal } : {}),
  });
}
async function latest(rootId: string) {
  const db = await initDB();
  const records = (await db.getAll(SYNC_CAPTURE_STORE))
    .flatMap((raw) => {
      const row = parseSyncCaptureRecord(raw);
      return row?.kind === 'sync-operation' &&
        row.rootKind === 'video-review' &&
        row.rootId === rootId
        ? [row]
        : [];
    })
    .sort((a, b) => b.generation - a.generation);
  check(records[0], 'Review capture is missing.');
  return records[0];
}
async function sourceFile(mediaId: string) {
  const db = await initDB();
  const media = parseMediaLibraryEntry(await db.get('media_library', mediaId));
  check(media, 'Review source is missing.');
  const asset =
    media.source.kind === 'project-asset'
      ? parseProjectAssetEntry(await db.get('project_assets', media.source.projectAssetId))
      : media.source.kind === 'recording'
        ? parseRecordingEntry(await db.get('recordings', media.source.recordingId))
        : null;
  const ref = asset ? parseAssetRef(await db.get('asset_refs', asset.assetId)) : null;
  check(ref, 'Review source bytes are missing.');
  const file = await readAssetFile(ref, media.filename);
  return { ref, file, media };
}

/** Exercises real saved review writers and byte ownership in disposable provider profiles. */
export function createWebdavReviewHarness(connected: () => SyncRemoteStore) {
  const outgoing = createWebdavOutgoingHarness(connected, latest);
  async function proof(rootId: string) {
    const db = await initDB();
    const review = await readVideoWorkspace(rootId);
    check(review, 'Native review is missing.');
    const sourceMediaId = review.workspace.sourceMediaId ?? rootId;
    const original = await sourceFile(sourceMediaId);
    const resources = [];
    for (const reference of [...collectReviewAssetReferences(review.workspace)].sort()) {
      const entry = parseProjectAssetEntry(
        await db.get('project_assets', reference.slice('project-asset:'.length))
      );
      const ref = entry ? parseAssetRef(await db.get('asset_refs', entry.assetId)) : null;
      check(ref, 'Review resource bytes are missing.');
      const file = await readAssetFile(ref, 'resource');
      resources.push({
        size: file.size,
        sha256: await hash(file),
        private: (await db.get('media_library', reference)) === undefined,
      });
    }
    return {
      rootId,
      sourceMediaId,
      project: review.workspace.project,
      history: review.workspace.history.map(({ target, before, after }) => ({
        target,
        before,
        after,
      })),
      cursor: review.workspace.cursor,
      mode: review.workspace.advanced.ui.mode,
      modeSelectionPending: review.workspace.advanced.ui.modeSelectionPending ?? false,
      draft: review.draft?.annotation ?? null,
      original: { size: original.file.size, sha256: await hash(original.file) },
      resources,
      fakeLibraryRow:
        rootId !== sourceMediaId && (await db.get('media_library', rootId)) !== undefined,
    };
  }
  async function seed(
    bytes: number[],
    sourceKind: 'project-asset' | 'recording' = 'project-asset'
  ) {
    await installExperimentalCaptureProfile({
      version: 1,
      kind: 'profile',
      key: 'profile',
      createdAt: Date.now(),
      enabled: true,
      spaceId,
      connectionGeneration: 3,
    });
    const sourceId = crypto.randomUUID();
    const mediaId = `${sourceKind}:${sourceId}`;
    const createdExportId = sourceKind === 'recording' ? `recording:${crypto.randomUUID()}` : null;
    const original = new File([Uint8Array.from(bytes)], 'review-original.webm', {
      type: 'video/webm',
    });
    if (sourceKind === 'recording') {
      check(createdExportId, 'Created export identity is missing.');
      await saveRecordingsBatch([
        { id: sourceId, blob: original, filename: original.name },
        {
          id: createdExportId.slice('recording:'.length),
          blob: original,
          filename: 'Created export.webm',
        },
      ]);
    } else await saveProjectAsset(sourceId, original, original.type, original.name);
    const canvas = new OffscreenCanvas(24, 24);
    const context = canvas.getContext('2d');
    check(context, 'Review background canvas is missing.');
    context.fillStyle = 'rgb(240,80,20)';
    context.fillRect(0, 0, 24, 24);
    const background = await canvas.convertToBlob({ type: 'image/png' });
    if (sourceKind === 'recording') {
      await saveMediaThumbnail({
        assetId: mediaId,
        blob: background,
        createdAt: 1,
        updatedAt: 1,
        width: 24,
        height: 24,
      });
      await updateMediaLibraryEntry(mediaId, { tags: ['derived-thumbnail-before-review'] });
      await saveRecordingTelemetry({
        recordingId: sourceId,
        createdAt: 1,
        updatedAt: 1,
        captureMode: null,
        viewport: null,
        cursorTrack: null,
        actionEvents: [],
        signals: [],
      });
    }
    const privateId = crypto.randomUUID();
    await saveProjectAsset(
      privateId,
      background,
      background.type,
      'private-background.png',
      Date.now(),
      { publishToLibrary: false }
    );
    const source = await sourceFile(mediaId);
    let current = (await loadVideoReviewSource(mediaId, new AbortController().signal)).snapshot;
    const before = reviewAdvancedContentBaseline(current.workspace.advanced);
    const after = {
      ...structuredClone(before),
      background: updateQuickEditBackground(before.background, {
        enabled: true,
        type: 'image',
        assetId: `project-asset:${privateId}`,
      }),
    };
    current = await commitVideoWorkspace({
      aggregateId: mediaId,
      expectedRevision: current.workspace.revision,
      expectedSourceAssetId: source.ref.assetId,
      operation: { id: crypto.randomUUID(), at: 1, target: 'advancedContent', before, after },
    });
    current = await commitVideoWorkspace({
      aggregateId: mediaId,
      expectedRevision: current.workspace.revision,
      expectedSourceAssetId: source.ref.assetId,
      operation: {
        id: crypto.randomUUID(),
        at: 2,
        target: 'annotation',
        before: null,
        after: {
          id: 'saved-note',
          text: 'WebDAV retained review note',
          anchor: { kind: 'point', time: 1 },
        },
      },
    });
    await saveVideoWorkspaceDraft({
      aggregateId: mediaId,
      expectedRevision: current.workspace.revision,
      expectedSourceAssetId: source.ref.assetId,
      expectedDraftRevision: null,
      before: null,
      annotation: {
        id: 'draft-note',
        text: 'WebDAV retained recovery',
        anchor: { kind: 'point', time: 2 },
      },
    });
    const archiveId = `${sourceKind}:quick-project:${crypto.randomUUID()}`;
    await createVideoWorkspaceProject({
      aggregateId: mediaId,
      expectedRevision: current.workspace.revision,
      expectedSourceAssetId: source.ref.assetId,
      archiveId,
    });
    current = (await readVideoWorkspace(mediaId))!;
    check(current, 'Default review is missing after New.');
    await commitVideoWorkspace({
      aggregateId: mediaId,
      expectedRevision: current.workspace.revision,
      expectedSourceAssetId: source.ref.assetId,
      operation: {
        id: crypto.randomUUID(),
        at: 3,
        target: 'annotation',
        before: null,
        after: {
          id: 'default-note',
          text: 'Independent default review',
          anchor: { kind: 'point', time: 1 },
        },
      },
    });
    await updateMediaLibraryEntry(mediaId, {
      filename: 'Renamed review original.webm',
      tags: ['provider'],
    });
    return {
      spaceId,
      mediaId,
      archiveId,
      createdExportId,
      createdExport: createdExportId ? await originalProof(createdExportId) : null,
      default: await proof(mediaId),
      archive: await proof(archiveId),
    };
  }
  async function originalProof(mediaId: string) {
    const original = await sourceFile(mediaId);
    return {
      filename: original.media.filename,
      size: original.file.size,
      sha256: await hash(original.file),
    };
  }
  async function initializeReceiver() {
    await installExperimentalCaptureProfile({
      version: 1,
      kind: 'profile',
      key: 'profile',
      createdAt: Date.now(),
      enabled: true,
      spaceId,
      connectionGeneration: 3,
    });
  }
  return { seed, proof, originalProof, initializeReceiver, outgoing };
}
