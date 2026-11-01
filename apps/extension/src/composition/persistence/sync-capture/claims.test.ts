import { expect, it } from 'vitest';
import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';
import { workspace as reviewTemplate } from '../review-workspaces/backup-restore.test-support';
import { materializeVideoWorkspaceProject } from '../review-workspaces/project-metadata';
import eventsFixture from '../../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../../../features/video/project/recording-events/records';
import { hashCaptureText, parseSyncCaptureRecord, parseCapturedVideoProjectRows } from './guards';
import { parseCapturedVideoReviewRows } from './review-snapshot';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { captureRootKey } from './contracts';
import { collectSyncCaptureClaims } from './claims';

it('retains native image document assets until prepared claims replace them', () => {
  const ref = {
    assetId: 'document',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/document' },
    mimeType: 'image/png',
    size: 8,
    sha256: null,
  };
  const media = createMediaLibraryEntry({
    id: 'image',
    kind: 'screenshot',
    source: { kind: 'screenshot' },
    blob: new Blob(['original'], { type: 'image/png' }),
    size: 8,
    mimeType: 'image/png',
    workspaceRevision: 1,
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
  });
  const native = createNativeCapture({
    version: 1,
    kind: 'sync-operation',
    key: 'native',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 1,
    rootKind: 'media',
    rootId: media.id,
    rootKey: captureRootKey('space', 'media', media.id),
    generation: 1,
    operationId: 'operation',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: {
      kind: 'image',
      rows: {
        media,
        refs: [ref],
        presentation: null,
        workspace: {
          aggregateId: media.id,
          createdAt: 1,
          updatedAt: 1,
          revision: 1,
          sourceTitle: null,
          sourceUrl: null,
          document: createPersistedEditorDocumentFixture(
            createEditorDocumentFixture(),
            ref.assetId
          ),
        },
      },
    },
  });
  expect(collectSyncCaptureClaims([native])).toEqual({
    valid: true,
    assetIds: new Set(['document']),
  });
  const { change: _nativeRows, phase: _nativePhase, ...header } = native;
  const prepared = {
    ...header,
    phase: 'prepared',
    prepared: {
      recordText: '{}',
      recordSha256: hashCaptureText('{}'),
      objects: [
        {
          objectId: 'object',
          ref: {
            ...ref,
            assetId: 'transport',
            location: { kind: 'opfs', objectKey: 'objects/transport' },
          },
          sha256: 'b'.repeat(64),
          filename: 'image.png',
        },
      ],
    },
  };
  expect(collectSyncCaptureClaims([prepared])).toEqual({
    valid: true,
    assetIds: new Set(['transport']),
  });
  expect(collectSyncCaptureClaims([{ ...native, change: { kind: 'image', rows: {} } }]).valid).toBe(
    false
  );
});

function eventHistory() {
  if (!isRecordingEventsDescriptor(eventsFixture.descriptor))
    throw new Error('Expected event history fixture');
  return {
    recordingEvents: eventsFixture.descriptor,
    recordingEventsSnapshot: {
      sourceRecordingId: 'canonical',
      ref: {
        assetId: 'events',
        createdAt: 1,
        location: { kind: 'opfs' as const, objectKey: 'objects/events' },
        mimeType: 'application/octet-stream',
        size: eventsFixture.descriptor.totalBytes + 4 * eventsFixture.descriptor.totalBlocks,
        sha256: eventsFixture.descriptor.streamSha256,
      },
    },
  };
}

function recordingCapture(withEvents = false) {
  const ref = {
    assetId: 'body',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/body' },
    mimeType: 'video/webm',
    size: 8,
    sha256: null,
  };
  const descriptor = {
    format: 'cursor-trajectory-v1' as const,
    formatVersion: 1 as const,
    algorithm: 'sed-window-v1' as const,
    encoding: 'json-ascii-int-v1' as const,
    trajectoryId: 'a'.repeat(32),
    state: 'complete' as const,
    finalized: true,
    totalBlocks: 1,
    totalRecords: 3,
    totalSamples: 1,
    totalBytes: 512,
    streamSha256: 'b'.repeat(64),
  };
  const media = createMediaLibraryEntry({
    id: 'recording:one',
    kind: 'recording',
    source: { kind: 'recording', recordingId: 'one' },
    mimeType: ref.mimeType,
    size: ref.size,
  });
  const capture = createNativeCapture({
    version: 1,
    kind: 'sync-operation',
    key: 'native-cursor',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 1,
    rootKind: 'media',
    rootId: media.id,
    rootKey: captureRootKey('space', 'media', media.id),
    generation: 1,
    operationId: 'operation-cursor',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: {
      kind: 'media',
      rows: {
        media,
        ref,
        recording: {
          id: 'one',
          assetId: ref.assetId,
          createdAt: 1,
          filename: media.filename,
          mimeType: ref.mimeType,
          size: ref.size,
        },
        telemetry: {
          recordingId: 'one',
          createdAt: 1,
          updatedAt: 1,
          captureMode: null,
          viewport: null,
          cursorTrack: null,
          actionEvents: [],
          signals: [],
          ...(withEvents ? eventHistory() : {}),
          cursorTrajectory: descriptor,
          cursorTrajectorySnapshot: {
            sourceRecordingId: 'canonical',
            width: 160,
            height: 90,
            ref: {
              assetId: 'cursor',
              createdAt: 1,
              location: { kind: 'opfs', objectKey: 'objects/cursor' },
              mimeType: 'application/octet-stream',
              size: 516,
              sha256: descriptor.streamSha256,
            },
          },
        },
      },
    },
  });
  return capture;
}

it('retains the immutable history file in a frozen recording capture after native rows disappear', () => {
  const capture = recordingCapture();
  expect(collectSyncCaptureClaims([capture])).toEqual({
    valid: true,
    assetIds: new Set(['body', 'cursor']),
  });
  expect(collectSyncCaptureClaims([])).toEqual({ valid: true, assetIds: new Set() });
});

it('retains both immutable history files through a frozen Quick Edit source', () => {
  const original = recordingCapture(true);
  if (original.change.kind !== 'media' || !('recording' in original.change.rows))
    throw new Error('Expected recording source');
  const source = original.change.rows;
  source.media.lifecycle = { storageClass: 'library', savedAt: 1, updatedAt: 1 };
  const {
    change: _change,
    phase: _phase,
    source: _source,
    sourceSha256: _sha,
    ...header
  } = original;
  const capture = createNativeCapture({
    ...header,
    rootKind: 'video-review',
    rootKey: captureRootKey('space', 'video-review', source.media.id),
    change: {
      kind: 'video-review',
      rows: {
        source,
        review: {
          workspace: materializeVideoWorkspaceProject(
            {
              ...structuredClone(reviewTemplate),
              aggregateId: source.media.id,
              sourceAssetId: source.ref.assetId,
              source: {
                ...reviewTemplate.source,
                size: source.ref.size,
                mimeType: source.ref.mimeType,
              },
              history: [],
              cursor: 0,
            },
            'Recorded source'
          ),
          draft: null,
        },
        assets: [],
        refs: [],
        media: [],
        privateReviews: [],
      },
      mediaDependencies: [{ mediaId: source.media.id, generation: 1, basis: ['source'] }],
    },
  });
  if (capture.change.kind !== 'video-review') throw new Error('Expected review');
  expect(parseCapturedVideoReviewRows(capture.change.rows)).not.toBeNull();
  expect(parseSyncCaptureRecord(capture)).not.toBeNull();
  expect(collectSyncCaptureClaims([capture])).toEqual({
    valid: true,
    assetIds: new Set(['body', 'cursor', 'events']),
  });
});

it('retains recording history claimed by a frozen montage after its recording rows disappear', () => {
  const original = recordingCapture(true);
  if (original.change.kind !== 'media' || !('recording' in original.change.rows))
    throw new Error('Expected recording source');
  const source = original.change.rows;
  const project = createVideoProjectEntryWithMediaClip({ id: 'montage' });
  project.project.assets[0]!.source = { kind: 'recording', recordingId: source.recording.id };
  project.project.assets[0]!.metadata = {
    ...project.project.assets[0]!.metadata,
    mimeType: source.ref.mimeType,
    size: source.ref.size,
  };
  const {
    change: _change,
    phase: _phase,
    source: _source,
    sourceSha256: _sha,
    ...header
  } = original;
  const capture = createNativeCapture({
    ...header,
    rootId: project.id,
    rootKind: 'video-project',
    rootKey: captureRootKey('space', 'video-project', project.id),
    change: {
      kind: 'video-project',
      rows: {
        project,
        recordings: [source.recording],
        telemetry: source.telemetry ? [source.telemetry] : [],
        assets: [],
        exports: [],
        media: [source.media],
        refs: [source.ref],
      },
    },
  });
  if (capture.change.kind !== 'video-project') throw new Error('Expected project');
  expect(parseCapturedVideoProjectRows(capture.change.rows)).not.toBeNull();
  expect(parseSyncCaptureRecord(capture)).not.toBeNull();
  expect(collectSyncCaptureClaims([capture])).toEqual({
    valid: true,
    assetIds: new Set(['body', 'cursor', 'events']),
  });
});

it('marks malformed retained claims incomplete while preserving the other valid claims', () => {
  const capture = recordingCapture();
  expect(collectSyncCaptureClaims(null)).toEqual({ valid: false, assetIds: new Set() });
  expect(collectSyncCaptureClaims([null, capture])).toEqual({
    valid: false,
    assetIds: new Set(['body', 'cursor']),
  });
});

it('retains cursor and event originals in a frozen recording root before preparation', () => {
  const capture = recordingCapture(true);
  expect(parseSyncCaptureRecord(capture)).not.toBeNull();
  expect(collectSyncCaptureClaims([capture])).toEqual({
    valid: true,
    assetIds: new Set(['body', 'cursor', 'events']),
  });
});
