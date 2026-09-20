import { expect, it } from 'vitest';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import {
  createAudioClip,
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { buildTimelineTelemetryLaneData } from './telemetry-lane';

function telemetry(): RecordingTelemetryEntry {
  return {
    recordingId: 'rec-asset-video',
    createdAt: 1,
    updatedAt: 1,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [{ id: 'typing', kind: 'typing', startTime: 1, endTime: 4, point: null, data: {} }],
  };
}

it('projects the captured typing interval into each independent appearance at its own speed', () => {
  const project = createProject([
    createVideoClip({ id: 'first', sourceInstanceId: 'first-instance' }),
    createVideoClip({
      id: 'repeat',
      sourceInstanceId: 'repeat-instance',
      startTime: 10,
      sourceStart: 1,
      sourceDuration: 6,
      playbackRate: 2,
      duration: 3,
    }),
  ]);
  const source = telemetry();
  const original = structuredClone(source);
  const data = buildTimelineTelemetryLaneData(project, source.recordingId, source);
  expect(data.spans).toMatchObject([
    {
      kind: 'typing',
      startTime: 1,
      endTime: 4,
      clipId: 'first',
      sourceInstanceId: 'first-instance',
      recordingId: source.recordingId,
      signalId: 'typing',
    },
    {
      kind: 'typing',
      startTime: 10,
      endTime: 11.5,
      clipId: 'repeat',
      sourceInstanceId: 'repeat-instance',
      signalId: 'typing',
    },
  ]);
  expect(new Set(data.spans.map(({ id }) => id)).size).toBe(2);
  expect(source).toEqual(original);
});

it('shows one typing span for linked audiovisual material and none for a trimmed-out interval', () => {
  const linked = { groupId: 'av', linkMode: 'LINKED' as const };
  const project = createProject([
    createVideoClip({ ...linked, sourceInstanceId: 'first' }),
    createAudioClip(linked),
    createVideoClip({
      id: 'trimmed',
      sourceInstanceId: 'second',
      sourceStart: 4,
      sourceDuration: 4,
      duration: 4,
      startTime: 10,
    }),
  ]);
  expect(
    buildTimelineTelemetryLaneData(project, 'rec-asset-video', telemetry()).spans
  ).toHaveLength(1);
});

it('keeps exact source and clip identities across a split and an independent replay', () => {
  const project = createProject([
    createVideoClip({ id: 'head', sourceInstanceId: 'instance', sourceDuration: 2, duration: 2 }),
    createVideoClip({
      id: 'tail',
      sourceInstanceId: 'instance',
      sourceStart: 2,
      sourceDuration: 6,
      startTime: 2,
      duration: 6,
    }),
    createVideoClip({ id: 'repeat', sourceInstanceId: 'replay', startTime: 10 }),
  ]);
  const { spans } = buildTimelineTelemetryLaneData(project, 'rec-asset-video', telemetry());
  expect(
    spans.map(({ clipId, sourceStart, sourceEnd, startTime, endTime }) => [
      clipId,
      sourceStart,
      sourceEnd,
      startTime,
      endTime,
    ])
  ).toEqual([
    ['head', 1, 2, 1, 2],
    ['tail', 2, 4, 2, 4],
    ['repeat', 1, 4, 11, 14],
  ]);
});

it('rejects missing source identity and a foreign sidecar', () => {
  const project = createProject([createVideoClip()]);
  expect(buildTimelineTelemetryLaneData(project, 'rec-asset-video', telemetry())).toEqual({
    spans: [],
  });
  expect(
    buildTimelineTelemetryLaneData(project, 'rec-asset-video', {
      ...telemetry(),
      recordingId: 'other',
    })
  ).toEqual({ spans: [] });
});
