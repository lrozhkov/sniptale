import { beforeEach, expect, it, vi } from 'vitest';
import { buildRecordingMediaEntry } from '../../composition/persistence/media-library/entry-mapping';
import { createNativeCapture } from '../../composition/persistence/sync-capture/test-support/frozen-snapshot-database';
import {
  captureRootKey,
  type CapturedChange,
} from '../../composition/persistence/sync-capture/contracts';
import type { AssetRef } from '../../composition/persistence/assets';
import { encodeCapturedPortableRoot } from './captured-root';
import { preparePortableReplica, type PortableReplicaAdmission } from './prepared-root';

const io = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: io.read,
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.read.mockImplementation(
    async (ref: AssetRef, name: string) =>
      new File([new Uint8Array(ref.size)], name, { type: ref.mimeType })
  );
});
function ref(assetId = 'sender-bytes'): AssetRef {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType: 'video/webm',
    size: 1024,
    sha256: 'a'.repeat(64),
  };
}
function capture(change: CapturedChange['change']): CapturedChange {
  const rootKind =
    change.kind === 'video-review'
      ? 'video-review'
      : change.kind === 'media'
        ? 'media'
        : 'video-project';
  const rootId =
    change.kind === 'media'
      ? change.rows.media.id
      : change.kind === 'video-review'
        ? change.rows.review.workspace.aggregateId
        : change.kind === 'video-project'
          ? change.rows.project.id
          : 'deleted';
  const rootKey = captureRootKey('space', rootKind, rootId);
  return createNativeCapture({
    version: 1,
    kind: 'sync-operation',
    key: JSON.stringify(['captured-change', 'op']),
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 19,
    rootKind,
    rootId,
    rootKey,
    generation: 4,
    operationId: 'op',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change,
  });
}
function admission(): PortableReplicaAdmission {
  return {
    operationId: 'remote-operation',
    sourceDigest: 'b'.repeat(64),
    connectionGeneration: 3,
    spaceId: 'space',
    profileCreatedAt: 1,
    expectedBasis: [],
    expectedLocalGeneration: 0,
    expectedWorkspaceRevision: null,
    dependencies: [],
  };
}

it('encodes and prepares a saved recording through the backup inventory without local byte identity', async () => {
  const original = ref('recording-original');
  const recording = {
    id: 'recording-source',
    assetId: original.assetId,
    filename: 'Saved recording.webm',
    createdAt: 1,
    mimeType: original.mimeType,
    size: original.size,
    lifecycle: { savedAt: 1, storageClass: 'library' as const, updatedAt: 1 },
    recordingMetadata: {
      captureMode: null,
      displaySurface: null,
      actionCount: 0,
      hasPointer: false,
    },
    recordingGroup: {
      groupId: 'group',
      order: 0,
      role: 'display' as const,
      sourceLabel: 'Screen',
      sourceUrl: null,
      sourceFavicon: null,
    },
  };
  const telemetry = {
    recordingId: recording.id,
    createdAt: 1,
    updatedAt: 2,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
  };
  const rows = { recording, ref: original, telemetry, media: buildRecordingMediaEntry(recording) };
  const result = await encodeCapturedPortableRoot(capture({ kind: 'media', rows }));
  expect(JSON.stringify(result.envelope)).not.toContain('"assetId"');
  const metadata = result.envelope.metadata;
  expect(metadata).toMatchObject({ recording: { entry: { id: recording.id } } });
  const local = ref('target-recording-original');
  const payload = await preparePortableReplica({
    envelope: result.envelope,
    verifiedObjects: new Map([[result.envelope.objects[0]!.objectId, local]]),
    senderDependencies: [],
    admission: admission(),
  });
  if (payload.kind !== 'media' || !('recording' in payload.input.rows))
    throw new Error('Expected recording.');
  expect(payload.input.rows.recording).toEqual({ ...recording, assetId: local.assetId });
  expect(payload.input.rows.telemetry).toEqual(telemetry);
  expect(result.bindings).toEqual([
    { objectId: result.envelope.objects[0]!.objectId, ref: original },
  ]);
});
