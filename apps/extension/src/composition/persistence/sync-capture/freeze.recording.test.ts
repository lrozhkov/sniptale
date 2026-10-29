import { CaptureMode, VideoDisplaySurface } from '@sniptale/runtime-contracts/video/types/types';
import { parseRecordingEntry } from '../recordings/index.guards';

import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import { VideoProjectTrackRole } from '../../../features/video/project/types';
import {
  buildProjectExportMediaEntry,
  buildRecordingMediaEntry,
} from '../media-library/entry-mapping';

import { workspace as reviewWorkspace } from '../review-workspaces/backup-restore.test-support';

import { parseVideoProjectEntry } from '../projects/read-guards';

import {
  collectCapturedProjectEditingMediaIds,
  parseCapturedVideoProjectRows,
} from './project-snapshot';
import { expect, it } from 'vitest';

import {
  freezeVideoProjectInTransaction,
  freezeMediaInTransaction,
  UnsupportedSyncCaptureGraphError,
} from './freeze';

import {
  createProjectFreezeFixture as fixture,
  memoryStore,
  reference,
} from './test-support/freeze';

function recordingSourceFixture() {
  const data = fixture();
  const recordings = memoryStore();
  const telemetry = memoryStore();
  const recording = {
    id: 'saved',
    assetId: 'saved-bytes',
    filename: 'Saved.webm',
    createdAt: 1,
    size: 6,
    mimeType: 'video/webm',
  };
  const media = buildRecordingMediaEntry(recording);
  recordings.seed(recording.id, recording);
  data.stores.media.seed(media.id, media);
  data.stores.refs.seed(
    recording.assetId,
    reference(recording.assetId, recording.mimeType, recording.size)
  );
  const owner = {
    ownerKind: 'recording',
    ownerId: recording.id,
    role: 'body',
    assetId: recording.assetId,
  };
  data.stores.owners.seed(['recording', recording.id, 'body'], owner);
  const tx = new Proxy(data.tx, {
    get(target, property) {
      if (property !== 'objectStore') return Reflect.get(target, property);
      return (name: string) =>
        name === 'recordings'
          ? recordings
          : name === 'recording_telemetry'
            ? telemetry
            : target.objectStore(name);
    },
  });
  return { ...data, recording, media, recordings, telemetry, owner, tx };
}

it('freezes a canonical recording source and absent telemetry using only the caller transaction', async () => {
  const data = recordingSourceFixture();
  const rows = await freezeMediaInTransaction(data.tx, data.media.id);
  expect(rows).toMatchObject({
    media: { id: data.media.id },
    recording: data.recording,
    telemetry: null,
  });
  data.recording.filename = 'Later.webm';
  expect('recording' in rows && rows.recording.filename).toBe('Saved.webm');
  expect(data.stores.assets.get).not.toHaveBeenCalled();
  expect(data.recordings.put).not.toHaveBeenCalled();
});

it('refuses missing or foreign recording ownership and malformed telemetry before capture', async () => {
  const data = recordingSourceFixture();
  data.stores.owners.seed(['recording', data.recording.id, 'body'], {
    ...data.owner,
    ownerId: 'foreign',
  });
  await expect(freezeMediaInTransaction(data.tx, data.media.id)).rejects.toThrow();
  data.stores.owners.seed(['recording', data.recording.id, 'body'], data.owner);
  data.telemetry.seed(data.recording.id, { recordingId: data.recording.id });
  await expect(freezeMediaInTransaction(data.tx, data.media.id)).rejects.toThrow();
  data.telemetry.rows.clear();
  data.recordings.seed(data.recording.id, { ...data.recording, id: 'foreign' });
  await expect(freezeMediaInTransaction(data.tx, data.media.id)).rejects.toThrow();
});

it('retains the independent review option for a saved recording and validates its immutable source', async () => {
  const data = recordingSourceFixture();
  data.stores.videoWorkspaces.seed(data.media.id, {
    ...structuredClone(reviewWorkspace),
    aggregateId: data.media.id,
    sourceAssetId: data.recording.assetId,
    source: {
      ...reviewWorkspace.source,
      size: data.recording.size,
      mimeType: 'video/webm; codecs="vp8"',
    },
    history: [],
    cursor: 0,
  });
  await expect(freezeMediaInTransaction(data.tx, data.media.id)).rejects.toThrow();
  await expect(
    freezeMediaInTransaction(data.tx, data.media.id, { allowIndependentReview: true })
  ).resolves.toMatchObject({ recording: data.recording });
  data.stores.refs.seed(
    data.recording.assetId,
    reference(data.recording.assetId, data.recording.mimeType, 7)
  );
  await expect(
    freezeMediaInTransaction(data.tx, data.media.id, { allowIndependentReview: true })
  ).rejects.toThrow();
});

it('ignores a derived recording thumbnail before any review workspace exists', async () => {
  const data = recordingSourceFixture();
  data.stores.thumbnails.seed(data.media.id, {
    assetId: data.media.id,
    blob: new Blob(['generated-frame'], { type: 'image/webp' }),
    createdAt: data.recording.createdAt,
    generatorVersion: 2,
    height: 180,
    updatedAt: 2,
    width: 320,
  });
  const rows = await freezeMediaInTransaction(data.tx, data.media.id, {
    allowIndependentReview: true,
  });
  expect(rows).toMatchObject({ recording: data.recording, telemetry: null });
  expect(rows).not.toHaveProperty('thumbnail');
  expect(data.stores.videoWorkspaces.rows.size).toBe(0);
  await expect(freezeMediaInTransaction(data.tx, data.media.id)).resolves.toEqual(rows);
});

it('freezes canonical screen, camera, audio, action bindings and telemetry', async () => {
  const data = recordingSourceFixture();
  const camera = {
    ...data.recording,
    id: 'camera',
    assetId: 'camera-bytes',
    filename: 'Camera.webm',
  };
  data.recordings.seed(camera.id, camera);
  data.stores.media.seed(`recording:${camera.id}`, buildRecordingMediaEntry(camera));
  data.stores.refs.seed(camera.assetId, reference(camera.assetId, camera.mimeType, camera.size));
  data.stores.owners.seed(['recording', camera.id, 'body'], {
    ownerKind: 'recording',
    ownerId: camera.id,
    role: 'body',
    assetId: camera.assetId,
  });
  const telemetry = {
    recordingId: data.recording.id,
    createdAt: 1,
    updatedAt: 1,
    captureMode: 'TAB',
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
  };
  data.telemetry.seed(data.recording.id, telemetry);
  const project = createVideoProjectFromRecording({
    recordingId: data.recording.id,
    filename: data.recording.filename,
    width: 640,
    height: 360,
    duration: 2,
    mimeType: data.recording.mimeType,
    size: data.recording.size,
    hasAudio: true,
    recordingSignals: [],
    sourceNormalizedActionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        time: 1,
        duration: 0.45,
        point: { x: 0.2, y: 0.3 },
        label: 'Click',
        preset: 'CLICK_RIPPLE',
        data: {},
      },
    ],
    sidecarVideos: [
      {
        recordingId: camera.id,
        filename: camera.filename,
        width: 320,
        height: 180,
        duration: 2,
        mimeType: camera.mimeType,
        size: camera.size,
        trackRole: VideoProjectTrackRole.CAMERA,
      },
    ],
  });
  project.id = data.project.id;
  data.stores.projects.seed(project.id, { ...data.project, project });
  const rows = await freezeVideoProjectInTransaction(data.tx, project.id);
  expect(rows.project.project).toEqual(
    parseVideoProjectEntry({ ...data.project, project })?.project
  );
  expect(rows.recordings).toEqual(
    expect.arrayContaining([parseRecordingEntry(data.recording), parseRecordingEntry(camera)])
  );
  expect(rows.recordings).toHaveLength(2);
  expect(rows.telemetry).toEqual([telemetry]);
  expect(collectCapturedProjectEditingMediaIds(rows)).toEqual(
    new Set([data.media.id, `recording:${camera.id}`])
  );
  expect(rows.assets).toEqual([]);
  expect(rows.project.project.clips.some((clip) => clip.type === 'AUDIO')).toBe(true);
  expect(
    rows.project.project.tracks.some((track) => track.role === VideoProjectTrackRole.CAMERA)
  ).toBe(true);
  expect(rows.project.project.actionEvents?.[0]?.anchor).toMatchObject({
    kind: 'recording-source',
    recordingId: data.recording.id,
  });
  data.stores.owners.seed(['recording', camera.id, 'body'], {
    ownerKind: 'recording',
    ownerId: camera.id,
    role: 'body',
    assetId: 'wrong-bytes',
  });
  await expect(freezeVideoProjectInTransaction(data.tx, project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('refuses a recording project whose canonical original is missing rather than dropping that source', async () => {
  const data = recordingSourceFixture();
  const project = createVideoProjectFromRecording({
    recordingId: data.recording.id,
    filename: data.recording.filename,
    width: 640,
    height: 360,
    duration: 2,
    mimeType: data.recording.mimeType,
    size: data.recording.size,
  });
  project.id = data.project.id;
  data.stores.projects.seed(project.id, { ...data.project, project });
  data.stores.media.rows.delete(JSON.stringify(data.media.id));
  await expect(freezeVideoProjectInTransaction(data.tx, project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('freezes export acquisition metadata only with its exact native export binding', async () => {
  const data = fixture();
  const exported = {
    ...data.exported,
    recordingMetadata: {
      captureMode: CaptureMode.TAB,
      displaySurface: VideoDisplaySurface.BROWSER,
      actionCount: 4,
      hasPointer: true,
    },
  };
  const mirror = buildProjectExportMediaEntry(exported);
  data.stores.exports.seed(exported.id, exported);
  data.stores.media.seed(mirror.id, mirror);
  const rows = await freezeVideoProjectInTransaction(data.tx, data.project.id);
  expect(rows.exports).toContainEqual(exported);
  expect(rows.media.find((entry) => entry.id === mirror.id)?.recordingMetadata).toEqual(
    exported.recordingMetadata
  );
  expect(parseCapturedVideoProjectRows(rows)).not.toBeNull();
  const mutations = [
    { recordingMetadata: { ...exported.recordingMetadata, actionCount: 5 } },
    { recordingMetadata: undefined },
    { recordingGroup: { groupId: 'foreign', role: 'webcam', order: 1, sourceLabel: null } },
    { size: mirror.size + 1 },
    { mimeType: 'video/mp4' },
    { source: { kind: 'project-export', exportId: exported.id, projectId: 'foreign' } },
  ];
  for (const mutation of mutations) {
    const changed = { ...mirror, ...mutation };
    data.stores.media.seed(mirror.id, changed);
    await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toThrow(
      UnsupportedSyncCaptureGraphError
    );
    expect(
      parseCapturedVideoProjectRows({
        ...rows,
        media: rows.media.map((entry) => (entry.id === mirror.id ? changed : entry)),
      })
    ).toBeNull();
  }
  data.stores.media.seed(mirror.id, mirror);
  const foreignAssetMetadata = {
    ...data.mirror,
    recordingMetadata: exported.recordingMetadata,
  };
  data.stores.media.seed(data.mirror.id, foreignAssetMetadata);
  expect(
    parseCapturedVideoProjectRows({
      ...rows,
      media: rows.media.map((entry) =>
        entry.id === data.mirror.id ? foreignAssetMetadata : entry
      ),
    })
  ).toBeNull();
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toThrow(
    UnsupportedSyncCaptureGraphError
  );
});
