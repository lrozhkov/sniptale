import { openDB } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';
import {
  DB_NAME,
  DB_VERSION,
} from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { handleDatabaseUpgrade } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { createQuickEditAdvancedState } from '../../../../apps/extension/src/features/video/review/advanced/defaults';
import { reviewAdvancedContentBaseline } from '../../../../apps/extension/src/features/video/review/document';
import type { ReviewOperation } from '../../../../apps/extension/src/features/video/review/types';
import { inspectVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import {
  readVideoWorkspace,
  commitVideoWorkspace,
} from '../../../../apps/extension/src/composition/persistence/review-workspaces/store';
import {
  workspaceStorageHead,
  workspaceStorageRows,
} from '../../../../apps/extension/src/composition/persistence/review-workspaces/storage-format';
import { withReviewWorkspaceUsage } from '../../../../apps/extension/src/composition/persistence/media-library/usage-index-keys';
import { ASSET_ROOT_DIRECTORY_NAME } from '../../../../apps/extension/src/composition/persistence/assets/opfs-store';
import { getProjectAsset } from '../../../../apps/extension/src/composition/persistence/projects';
import { createVideoReviewSession } from '../../../../apps/extension/src/workflows/video-review/session';
import { historyRetentionEffectSnapshot } from './editor-history-retention-probe';

const aggregateId = 'recording:beta-v1-recording';
const projectAssetId = 'retained-effect';
const assetId = 'native-history-effect-object';
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><circle cx="120" cy="120" r="80" fill="#123456"/></svg>';
let reader: ReturnType<typeof createVideoReviewSession> | undefined;

/** Isolated native source fixture includes real OPFS bytes and their exact canonical binding. */
export async function seed(source: string) {
  const raw: unknown = JSON.parse(source);
  if (!isRecord(raw) || !Array.isArray(raw['assets'])) throw new Error('Invalid neutral source');
  const bytes = new TextEncoder().encode(svg);
  const hash = await sha256EffectV1Bytes(bytes);
  raw['assets'] = raw['assets'].map((asset: unknown) => {
    if (!isRecord(asset)) throw new Error('Invalid neutral asset');
    return { ...asset, byteLength: bytes.byteLength, sha256: hash };
  });
  const snapshot = await historyRetentionEffectSnapshot(JSON.stringify(raw));
  const advanced = createQuickEditAdvancedState();
  const before = reviewAdvancedContentBaseline(advanced);
  const withEffect = {
    ...before,
    annotationEffects: {
      enabled: true,
      instances: [
        {
          id: 'old-effect',
          snapshotId: snapshot.id,
          enabled: true,
          start: 1,
          end: 4,
          attachment: 'viewport' as const,
          transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
          controls: {},
          order: 0,
        },
      ],
    },
  };
  const history: ReviewOperation[] = [
    { id: 'apply-old-effect', at: 1, target: 'advancedContent', before, after: withEffect },
    {
      id: 'remove-old-effect',
      at: 2,
      target: 'advancedContent',
      before: withEffect,
      after: before,
    },
  ];
  let gain = before.audio.original;
  for (let index = 0; index < 48; index++) {
    const after = { ...gain, muted: !gain.muted };
    history.push({
      id: `gain-${index}`,
      at: 3 + index,
      target: 'sourceAudio',
      before: gain,
      after,
    });
    gain = after;
  }
  const admitted = inspectVideoWorkspace({
    aggregateId,
    formatVersion: 1,
    advanced,
    history,
    cursor: 50,
    effectSnapshots: [snapshot],
    sourceAssetId: 'beta-v1-recording-asset',
    source: { duration: 12, width: 640, height: 360, size: 15, mimeType: 'video/webm' },
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  });
  if (!admitted.workspace) throw new Error('Invalid resource history fixture');
  const root = await navigator.storage.getDirectory();
  const objects = await (
    await root.getDirectoryHandle(ASSET_ROOT_DIRECTORY_NAME, { create: true })
  ).getDirectoryHandle('objects', { create: true });
  const writable = await (await objects.getFileHandle(assetId, { create: true })).createWritable();
  await writable.write(bytes);
  await writable.close();
  const db = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  try {
    const tx = db.transaction(
      [
        'media_library',
        'recordings',
        'project_assets',
        'asset_refs',
        'asset_owners',
        'video_workspaces',
        'video_workspace_history',
      ],
      'readwrite'
    );
    await tx.objectStore('media_library').put(betaV1Fixture.records.media_library[0]);
    await tx.objectStore('recordings').put(betaV1Fixture.records.recordings[0]);
    await tx.objectStore('project_assets').put({
      id: projectAssetId,
      assetId,
      mimeType: 'image/svg+xml',
      size: bytes.byteLength,
      createdAt: 1,
    });
    await tx.objectStore('asset_refs').put({
      assetId,
      mimeType: 'image/svg+xml',
      size: bytes.byteLength,
      sha256: hash,
      createdAt: 1,
      location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    });
    await tx
      .objectStore('asset_owners')
      .put({ assetId, ownerKind: 'project-asset', ownerId: projectAssetId, role: 'body' });
    const workspace = admitted.workspace;
    await tx
      .objectStore('video_workspaces')
      .put(workspaceStorageHead(workspace, withReviewWorkspaceUsage(workspace).usageReferenceKeys));
    for (const row of workspaceStorageRows(workspace))
      await tx.objectStore('video_workspace_history').put(row);
    await tx.done;
  } finally {
    db.close();
  }
  return { bytes: bytes.byteLength, sha256: hash };
}

/** Uses the actual local Undo owner; the other page mutates its durable graph independently. */
export async function holdReader() {
  const snapshot = await readVideoWorkspace(aggregateId);
  if (!snapshot) throw new Error('Missing native resource workspace');
  reader = createVideoReviewSession(snapshot);
  reader.setAutosaveEnabled(false);
  for (let index = 0; index < 49; index++) await reader.history('undo');
  return {
    oldEffectCount:
      reader.getSnapshot().document.advancedContent.annotationEffects?.instances.length,
    dirty: reader.getSnapshot().dirty,
  };
}

export async function trim() {
  let current = await readVideoWorkspace(aggregateId);
  if (!current) throw new Error('Missing native producer workspace');
  for (let index = 0; index < 3; index++) {
    const document = inspectVideoWorkspace(current.workspace).document;
    if (!document) throw new Error('Invalid native producer graph');
    const before = document.advancedContent.audio.original;
    current = await commitVideoWorkspace({
      aggregateId,
      expectedRevision: current.workspace.revision,
      expectedSourceAssetId: current.workspace.sourceAssetId,
      operation: {
        id: `rollover-${index}`,
        at: 51 + index,
        target: 'sourceAudio',
        before,
        after: { ...before, muted: !before.muted },
      },
    });
  }
  return {
    historyLength: current.workspace.history.length,
    snapshots: current.workspace.effectSnapshots?.length,
  };
}

export async function readReaderSource() {
  const source = await getProjectAsset(projectAssetId);
  return source.status === 'ready'
    ? {
        status: source.status,
        bytes: source.entry.file.size,
        sha256: await sha256EffectV1Bytes(new Uint8Array(await source.entry.file.arrayBuffer())),
      }
    : { status: source.status, bytes: 0, sha256: null };
}

export async function releaseReader() {
  await reader?.dispose();
  reader = undefined;
}
