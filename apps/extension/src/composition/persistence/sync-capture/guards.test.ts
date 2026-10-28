import { buildRecordingMediaEntry } from '../media-library/entry-mapping';
import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { expect, it } from 'vitest';
import {
  createProjectAssetEntry,
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';
import { captureRootKey, type CapturedChange, type CapturedVideoProjectRows } from './contracts';
import {
  parseCapturedVideoProjectRows,
  parseSyncCaptureRecord,
  parseCapturedMediaRows,
} from './guards';
import { collectSyncCaptureClaims } from './claims';

function fixture(): CapturedVideoProjectRows {
  const project = createVideoProjectEntryWithMediaClip();
  const asset = createProjectAssetEntry({
    id: 'project-asset-1',
    mimeType: 'video/webm',
    size: 1024,
  });
  return {
    project,
    assets: [asset],
    exports: [],
    media: [],
    refs: [
      {
        assetId: asset.assetId,
        createdAt: 1,
        location: { kind: 'opfs', objectKey: `objects/${asset.assetId}` },
        mimeType: asset.mimeType,
        size: asset.size,
        sha256: null,
      },
    ],
  };
}
function change(): CapturedChange {
  const rows = fixture();
  return createNativeCapture({
    version: 1,
    kind: 'sync-operation',
    key: '["change","operation-1"]',
    createdAt: 1,
    spaceId: 'space-1',
    connectionGeneration: 1,
    rootKind: 'video-project',
    rootId: rows.project.id,
    rootKey: captureRootKey('space-1', 'video-project', rows.project.id),
    generation: 1,
    operationId: 'operation-1',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: { kind: 'video-project', rows },
  });
}

it('admits native metadata without placing media bytes in the capture store', () => {
  const rows = fixture();
  expect(parseCapturedVideoProjectRows(rows)).toMatchObject(rows);
});
it('rejects a missing dependency and a contradictory descriptor', () => {
  const rows = fixture();
  rows.refs[0]!.size++;
  expect(parseCapturedVideoProjectRows(rows)).toBeNull();
  rows.refs = [];
  expect(parseCapturedVideoProjectRows(rows)).toBeNull();
});
it('rejects unrelated extra native rows instead of adding arbitrary retention claims', () => {
  const rows = fixture();
  rows.refs.push({
    ...rows.refs[0]!,
    assetId: 'unrelated',
    location: { kind: 'opfs', objectKey: 'objects/unrelated' },
  });
  expect(parseCapturedVideoProjectRows(rows)).toBeNull();
});
it('rejects binary values and cycles before serializing native metadata', () => {
  const rows = fixture();
  expect(parseCapturedVideoProjectRows({ ...rows, unexpected: new Blob(['bytes']) })).toBeNull();
  const cyclic: Record<string, unknown> = { ...rows };
  cyclic['loop'] = cyclic;
  expect(parseCapturedVideoProjectRows(cyclic)).toBeNull();
});
it('rejects unknown versions kinds and inconsistent root identities', () => {
  const row = change();
  expect(parseSyncCaptureRecord({ ...row, version: 2 })).toBeNull();
  expect(parseSyncCaptureRecord({ ...row, kind: 'future' })).toBeNull();
  expect(parseSyncCaptureRecord({ ...row, rootId: 'another-root' })).toBeNull();
  expect(parseSyncCaptureRecord({ ...row, change: { kind: 'future' } })).toBeNull();
});
it('keeps tuple keys distinct when opaque identities contain delimiters', () => {
  expect(captureRootKey('a:b', 'media', 'c')).not.toBe(captureRootKey('a', 'media', 'b:c'));
});
it('projects pending claims after the domain ref and owner can disappear', () => {
  const row = change();
  const claims = collectSyncCaptureClaims([row]);
  expect(claims.valid).toBe(true);
  expect(claims.assetIds).toEqual(new Set(['asset-object-1']));
  expect(collectSyncCaptureClaims([{ ...row, change: { kind: 'tombstone' } }]).assetIds.size).toBe(
    0
  );
});
it('makes retention invalid when any persisted capture cannot be admitted', () => {
  const claims = collectSyncCaptureClaims([change(), { kind: 'captured-change', version: 99 }]);
  expect(claims.valid).toBe(false);
  expect(claims.assetIds.has('asset-object-1')).toBe(true);
});

function mediaFixture() {
  const rows = fixture();
  const asset = rows.assets[0]!;
  return {
    media: createMediaLibraryEntry({
      id: `project-asset:${asset.id}`,
      kind: 'video',
      source: { kind: 'project-asset', projectAssetId: asset.id },
      mimeType: asset.mimeType,
      size: asset.size,
    }),
    projectAsset: asset,
    ref: rows.refs[0]!,
  };
}

it('admits a source after-image and retains its ref after the native owner disappears', () => {
  const rows = mediaFixture();
  const capture = createNativeCapture({
    ...change(),
    rootKind: 'media',
    rootId: rows.media.id,
    rootKey: captureRootKey('space-1', 'media', rows.media.id),
    change: { kind: 'media', rows },
  });
  expect(parseSyncCaptureRecord(capture)).toMatchObject({ change: { kind: 'media', rows } });
  expect(collectSyncCaptureClaims([capture])).toEqual({
    valid: true,
    assetIds: new Set([rows.ref.assetId]),
  });
  expect(parseSyncCaptureRecord({ ...capture, rootId: 'different' })).toBeNull();
});

it('refuses malformed media identity descriptors inline bytes and unsupported resources', () => {
  const rows = mediaFixture();
  for (const candidate of [
    { ...rows, media: { ...rows.media, id: 'wrong' } },
    { ...rows, media: { ...rows.media, blob: new Blob(['bytes']) } },
    { ...rows, media: { ...rows.media, workspaceRevision: 1 } },
    { ...rows, projectAsset: { ...rows.projectAsset, originMediaId: 'other' } },
    { ...rows, ref: { ...rows.ref, size: rows.ref.size + 1 } },
    { ...rows, ref: { ...rows.ref, assetId: 'other' } },
    { ...rows, media: { ...rows.media, mimeType: 'image/png' } },
  ])
    expect(parseCapturedMediaRows(candidate)).toBeNull();
});

it('retains explicit dependency evidence but keeps legacy rows distinguishable', () => {
  const rows = fixture();
  expect(parseCapturedVideoProjectRows(rows)?.mediaDependencies).toBeUndefined();
  expect(parseCapturedVideoProjectRows({ ...rows, mediaDependencies: [] })).toMatchObject({
    mediaDependencies: [],
  });
  expect(
    parseCapturedVideoProjectRows({
      ...rows,
      mediaDependencies: [{ mediaId: 'extra', generation: 1, basis: ['op'] }],
    })
  ).toBeNull();
});

it('retains a valid native digest and refuses malformed or project root digests', () => {
  const rows = mediaFixture();
  const root = {
    version: 1,
    kind: 'root-state',
    key: 'state',
    createdAt: 1,
    spaceId: 'space-1',
    rootKind: 'media',
    rootId: rows.media.id,
    rootKey: captureRootKey('space-1', 'media', rows.media.id),
    generation: 1,
    basis: ['op'],
    nativeDigest: 'a'.repeat(64),
  };
  expect(parseSyncCaptureRecord(root)).toEqual(root);
  expect(parseSyncCaptureRecord({ ...root, nativeDigest: 'wrong' })).toBeNull();
  expect(
    parseSyncCaptureRecord({
      ...root,
      rootKind: 'video-project',
      rootKey: captureRootKey('space-1', 'video-project', rows.media.id),
    })
  ).toBeNull();
});

it('preserves obsolete experiment and unknown phase rows while refusing sync and cleanup', () => {
  const current = change();
  for (const row of [
    { ...current, kind: 'captured-change' },
    { ...current, phase: 'future' },
  ]) {
    const before = structuredClone(row);
    expect(parseSyncCaptureRecord(row)).toBeNull();
    expect(collectSyncCaptureClaims([row]).valid).toBe(false);
    expect(row).toEqual(before);
  }
});

it('retains only explicit graveyards and refuses deleted states with live native digests', () => {
  for (const rootKind of ['media', 'video-project'] as const) {
    const root = {
      version: 1,
      kind: 'root-state',
      key: 'state',
      createdAt: 1,
      spaceId: 'space',
      rootKind,
      rootId: 'root',
      rootKey: captureRootKey('space', rootKind, 'root'),
      generation: 2,
      basis: ['delete'],
    };
    expect(parseSyncCaptureRecord({ ...root, deleted: true })).toEqual({ ...root, deleted: true });
    expect(parseSyncCaptureRecord(root)).toEqual(root);
    for (const deleted of [false, null, 1, 'true'])
      expect(parseSyncCaptureRecord({ ...root, deleted })).toBeNull();
    expect(
      parseSyncCaptureRecord({ ...root, deleted: true, nativeDigest: 'a'.repeat(64) })
    ).toBeNull();
  }
});

function recordingFixture() {
  const recording = {
    id: 'saved',
    assetId: 'saved-bytes',
    filename: 'Saved.webm',
    createdAt: 1,
    size: 6,
    mimeType: 'video/webm',
  };
  return {
    media: buildRecordingMediaEntry(recording),
    recording,
    ref: {
      ...mediaFixture().ref,
      assetId: recording.assetId,
      size: recording.size,
      mimeType: recording.mimeType,
      location: { kind: 'opfs' as const, objectKey: `objects/${recording.assetId}` },
    },
    telemetry: {
      recordingId: recording.id,
      createdAt: 1,
      updatedAt: 2,
      captureMode: null,
      viewport: null,
      cursorTrack: null,
      actionEvents: [],
      signals: [],
    },
  };
}

it('admits saved recording metadata and canonical telemetry through their native parsers', () => {
  const rows = recordingFixture();
  expect(parseCapturedMediaRows(rows)).toMatchObject(rows);
  expect(parseCapturedMediaRows({ ...rows, telemetry: null })).toMatchObject({ telemetry: null });
  const { signals: _signals, ...legacy } = rows.telemetry;
  expect(parseCapturedMediaRows({ ...rows, telemetry: legacy })).toMatchObject({
    telemetry: { signals: [] },
  });
});

it('refuses recording identity ref telemetry and hybrid source contradictions', () => {
  const rows = recordingFixture();
  for (const candidate of [
    { ...rows, projectAsset: mediaFixture().projectAsset },
    { ...rows, media: { ...rows.media, id: 'alias' } },
    { ...rows, recording: { ...rows.recording, id: 'foreign' } },
    { ...rows, recording: { ...rows.recording, assetId: 'foreign' } },
    { ...rows, ref: { ...rows.ref, size: 7 } },
    { ...rows, recording: { ...rows.recording, mimeType: 'video/mp4' } },
    { ...rows, telemetry: { ...rows.telemetry, recordingId: 'foreign' } },
    { ...rows, telemetry: { ...rows.telemetry, updatedAt: 0 } },
    { ...rows, telemetry: undefined },
    { ...rows, recording: { ...rows.recording, recordingGroup: { role: 'camera' } } },
    { ...rows, media: { ...rows.media, recordingMetadata: { captureMode: 'unknown' } } },
  ])
    expect(parseCapturedMediaRows(candidate)).toBeNull();
});

it('preserves recording acquisition facts and group metadata and refuses contradictory mirrors', () => {
  const rows = recordingFixture();
  const recording = {
    ...rows.recording,
    recordingMetadata: {
      captureMode: 'TAB' as const,
      displaySurface: 'browser' as const,
      actionCount: 4,
      hasPointer: true,
    },
    recordingGroup: {
      groupId: 'capture',
      order: 0,
      role: 'display' as const,
      sourceLabel: 'Screen',
      dimensions: { width: 1280, height: 720 },
    },
  };
  const candidate = { ...rows, recording, media: buildRecordingMediaEntry(recording) };
  expect(parseCapturedMediaRows(candidate)).toMatchObject({ recording });
  expect(
    parseCapturedMediaRows({
      ...candidate,
      media: { ...candidate.media, recordingMetadata: undefined },
    })
  ).toBeNull();
  expect(
    parseCapturedMediaRows({
      ...candidate,
      media: {
        ...candidate.media,
        recordingGroup: { ...recording.recordingGroup, groupId: 'foreign' },
      },
    })
  ).toBeNull();
});
