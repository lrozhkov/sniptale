import { expect, it } from 'vitest';
import { setup } from '../insertion/material.test-support';
import { resolveVideoProjectActionOccurrences } from '../../../../features/video/project/action-occurrences';
import { planSourceRangeCompression, planSourceRangeRemoval } from './source-range';

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

it('compresses track and global FX with the source interval while retaining clip FX', () => {
  const { project, request, video } = fixture();
  const base = {
    kind: 'targetEffect' as const,
    snapshotId: 'snapshot',
    enabled: true,
    controls: {},
    startTime: 11,
    duration: 5,
    playbackRate: 1,
    rangeMode: 'interval' as const,
  };
  project.effectInstances = [
    { ...base, id: 'track-fx', target: { kind: 'track', trackId: video.trackId } },
    { ...base, id: 'global-fx', target: { kind: 'video-group' } },
    {
      ...base,
      id: 'clip-fx',
      startTime: 10,
      duration: 6,
      target: { kind: 'clip', clipId: video.id },
    },
  ];
  const result = planSourceRangeCompression(project, request);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Expected compression');
  for (const kind of ['track', 'video-group']) {
    const pieces = result.project.effectInstances!.filter(
      (instance) => instance.target.kind === kind
    );
    expect(
      pieces.map(({ startTime, duration, playbackRate, sourceStart }) => ({
        startTime,
        duration,
        playbackRate,
        sourceStart,
      }))
    ).toEqual([
      { startTime: 11, duration: 1, playbackRate: 1, sourceStart: 0 },
      { startTime: 12, duration: 0.5, playbackRate: 4, sourceStart: 1 },
      { startTime: 12.5, duration: 2, playbackRate: 1, sourceStart: 3 },
    ]);
  }
  expect(
    result.project.effectInstances!.filter((instance) => instance.target.kind === 'clip')
  ).toHaveLength(3);
  expect(project.effectInstances).toHaveLength(3);
});

it('rejects invalid compression requests and removes a whole interval without leaving scoped FX behind', () => {
  const { project, request, video } = fixture();
  for (const targetPlaybackRate of [NaN, -1, 10000])
    expect(planSourceRangeCompression(project, { ...request, targetPlaybackRate })).toMatchObject({
      status: 'blocked',
      reason: 'invalid-rate',
    });
  expect(
    planSourceRangeCompression(project, { ...request, sourceEnd: request.sourceStart })
  ).toMatchObject({ status: 'blocked', reason: 'range-too-short' });
  const mismatch = {
    ...project,
    clips: project.clips.map((clip) =>
      clip.type === 'AUDIO' ? { ...clip, playbackRate: 2 } : clip
    ),
  };
  expect(planSourceRangeCompression(mismatch, request)).toMatchObject({
    status: 'blocked',
    reason: 'linked-timing',
  });
  project.effectInstances = [
    {
      id: 'removed',
      kind: 'targetEffect',
      target: { kind: 'track', trackId: video.trackId },
      snapshotId: 'snapshot',
      controls: {},
      enabled: true,
      startTime: 10,
      duration: 6,
      playbackRate: 1,
      rangeMode: 'interval',
    },
  ];
  const removed = planSourceRangeRemoval(project, { ...request, sourceStart: 0, sourceEnd: 6 });
  expect(removed.status).toBe('ready');
  if (removed.status !== 'ready') throw new Error('Expected removal');
  expect(removed.project.effectInstances).toEqual([]);
  expect(removed.project.clips.some((clip) => clip.id === video.id)).toBe(false);
});
