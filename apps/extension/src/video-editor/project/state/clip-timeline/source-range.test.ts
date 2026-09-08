import { expect, it } from 'vitest';
import { setup } from '../insertion/material.test-support';
import { resolveVideoProjectActionOccurrences } from '../../../../features/video/project/action-occurrences';
import { planSourceRangeCompression } from './source-range';

function fixture() {
  const { store, asset } = setup(true);
  asset.source = { kind: 'recording', recordingId: 'recording' };
  store.getState().appendMaterial(asset.id, { start: 0, end: 6 });
  const original = store.getState().project!;
  const video = original.clips.find((clip) => clip.type === 'VIDEO')!;
  if (video.type !== 'VIDEO' || !video.sourceInstanceId) throw new Error('Expected source video');
  const replay = {
    ...video,
    id: 'replay',
    sourceInstanceId: 'replay-instance',
    groupId: null,
    linkMode: 'DETACHED' as const,
    startTime: 30,
  };
  const project = {
    ...original,
    duration: 36,
    clips: [...original.clips.map((clip) => ({ ...clip, startTime: 10 })), replay],
    actionEvents: [
      {
        id: 'captured',
        anchor: {
          kind: 'recording-source' as const,
          recordingId: 'recording',
          sourceInstanceId: video.sourceInstanceId,
          sourceEventId: 'click',
          sourceTime: 5,
        },
        kind: 'CLICK' as const,
        point: { x: 0.5, y: 0.5 },
        label: 'Button',
        data: {},
        presentation: { offset: -0.2 },
      },
    ],
  };
  const request = {
    clipId: video.id,
    recordingId: 'recording',
    sourceInstanceId: video.sourceInstanceId,
    sourceStart: 2,
    sourceEnd: 4,
    targetPlaybackRate: 4,
  };
  return { project, request, video };
}

it('compresses only the chosen occurrence and keeps the original gap, linked audio and source facts', () => {
  const { project, request } = fixture();
  const result = planSourceRangeCompression(project, request);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(result.status);
  expect(result.removedDuration).toBe(1.5);
  expect(result.projectDurationDelta).toBe(1.5);
  expect(
    result.project.clips
      .filter((clip) => clip.type === 'VIDEO')
      .filter((clip) => clip.id !== 'replay')
      .map((clip) => [clip.startTime, clip.duration, clip.playbackRate ?? 1])
  ).toEqual([
    [10, 2, 1],
    [12, 0.5, 4],
    [12.5, 2, 1],
  ]);
  expect(
    result.project.clips
      .filter((clip) => clip.type === 'AUDIO')
      .map((clip) => [clip.startTime, clip.duration, clip.playbackRate ?? 1])
  ).toEqual([
    [10, 2, 1],
    [12, 0.5, 4],
    [12.5, 2, 1],
  ]);
  expect(result.project.clips.find((clip) => clip.id === 'replay')).toMatchObject({
    startTime: 28.5,
    duration: 6,
    sourceInstanceId: 'replay-instance',
  });
  expect(result.project.actionEvents).toEqual(project.actionEvents);
  expect(resolveVideoProjectActionOccurrences(result.project)[0]?.time).toBe(13.5);
  expect(project.clips[0]?.startTime).toBe(10);
  expect(
    planSourceRangeCompression(result.project, { ...request, clipId: result.clipId }).status
  ).toBe('unchanged');
});

it('rejects locked linked audio and stale source identity without a partial mutation', () => {
  const { project, request } = fixture();
  const locked = {
    ...project,
    tracks: project.tracks.map((track) => ({ ...track, locked: track.kind === 'AUDIO' })),
  };
  expect(planSourceRangeCompression(locked, request)).toMatchObject({
    status: 'blocked',
    reason: 'locked',
  });
  expect(
    planSourceRangeCompression(project, { ...request, sourceInstanceId: 'other-insertion' })
  ).toMatchObject({ status: 'blocked', reason: 'missing-source' });
});
