import { describe, expect, it, vi } from 'vitest';
import { applyTimelinePlacementPolicy } from './index';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  type VideoProject,
  type VideoProjectClip,
  VideoProjectClipType,
  type VideoProjectVideoClip,
  VideoTimelinePlacementMode,
  VideoTrackKind,
} from '../types/index';

function createTransform() {
  return {
    height: 720,
    opacity: 1,
    rotation: 0,
    width: 1280,
    x: 0,
    y: 0,
  };
}

function createTrack(id: string) {
  return {
    id,
    kind: VideoTrackKind.PRIMARY,
    locked: false,
    name: id,
    order: 0,
    visible: true,
  };
}

function createVideoClip(overrides: Partial<VideoProjectVideoClip> = {}): VideoProjectVideoClip {
  return {
    assetId: 'asset-video',
    duration: 2,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Video',
    sourceDuration: 2,
    sourceStart: 0,
    startTime: 0,
    trackId: 'track-main',
    transform: createTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
    ...overrides,
  };
}

function createProject(
  timelinePlacementMode: VideoTimelinePlacementMode,
  clips: VideoProjectClip[]
): VideoProject {
  return {
    assets: [],
    backgroundColor: '#000',
    baseRecordingId: null,
    source: { kind: 'manual' },
    clips,
    createdAt: 1,
    duration: 20,
    fps: 30,
    height: 720,
    id: 'project-1',
    name: 'Demo',
    timelinePlacementMode,
    tracks: [createTrack('track-main')],
    updatedAt: 2,
    version: 2,
    width: 1280,
    cursorTrack: null,
    actionEvents: [],
  };
}

describe('video project timeline placement policy', () => {
  it('returns the original project for empty anchors and allow-overlap mode', verifyEarlyReturns);
  it('shifts anchors and later clips for ripple-push placement', verifyRipplePushPlacement);
  it('keeps ripple-push placement scoped to the clip logical lane', verifyRippleLogicalLaneScope);
  it('delegates overwrite mode to overwrite placement flow', verifyOverwritePlacement);
});

function verifyEarlyReturns(): void {
  const rippleProject = createProject(VideoTimelinePlacementMode.RIPPLE_PUSH, [createVideoClip()]);
  const overlapProject = createProject(VideoTimelinePlacementMode.ALLOW_OVERLAP, [
    createVideoClip(),
  ]);

  expect(applyTimelinePlacementPolicy(rippleProject, [])).toBe(rippleProject);
  expect(applyTimelinePlacementPolicy(rippleProject, ['missing'])).toBe(rippleProject);
  expect(applyTimelinePlacementPolicy(overlapProject, ['clip-1'])).toBe(overlapProject);
}

function verifyRipplePushPlacement(): void {
  vi.spyOn(Date, 'now').mockReturnValue(99);
  const project = createProject(VideoTimelinePlacementMode.RIPPLE_PUSH, [
    createVideoClip({ duration: 4, id: 'previous', startTime: 0 }),
    createVideoClip({ duration: 2, id: 'anchor', startTime: 3 }),
    createVideoClip({ duration: 2, id: 'after-anchor', startTime: 4 }),
  ]);

  const result = applyTimelinePlacementPolicy(project, ['anchor']);

  expect(result).toEqual({
    ...project,
    clips: [
      expect.objectContaining({ id: 'previous', startTime: 0 }),
      expect.objectContaining({ id: 'anchor', startTime: 4 }),
      expect.objectContaining({ id: 'after-anchor', startTime: 6 }),
    ],
    updatedAt: 99,
  });
  expect(result.clips).not.toBe(project.clips);
}

function verifyRippleLogicalLaneScope(): void {
  const project = createProject(VideoTimelinePlacementMode.RIPPLE_PUSH, [
    createVideoClip({ duration: 5, id: 'upper', startTime: 0, timelineLaneId: 'line-1' }),
    createVideoClip({ duration: 2, id: 'anchor', startTime: 1, timelineLaneId: 'line-2' }),
    createVideoClip({ duration: 2, id: 'lower-after', startTime: 2, timelineLaneId: 'line-2' }),
  ]);

  const result = applyTimelinePlacementPolicy(project, ['anchor']);

  expect(result.clips).toEqual([
    expect.objectContaining({ id: 'upper', startTime: 0, timelineLaneId: 'line-1' }),
    expect.objectContaining({ id: 'anchor', startTime: 1, timelineLaneId: 'line-2' }),
    expect.objectContaining({ id: 'lower-after', startTime: 3, timelineLaneId: 'line-2' }),
  ]);
}

function verifyOverwritePlacement(): void {
  const project = createProject(VideoTimelinePlacementMode.OVERWRITE, [
    createVideoClip({ duration: 6, id: 'existing', startTime: 0 }),
    createVideoClip({ duration: 2, id: 'anchor', startTime: 3 }),
  ]);

  const result = applyTimelinePlacementPolicy(project, ['anchor']);

  expect(result).not.toBe(project);
  expect(result.clips).toHaveLength(3);
  expect(result.clips).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ duration: 3, id: 'existing', startTime: 0 }),
      expect.objectContaining({ id: 'anchor', startTime: 3 }),
      expect.objectContaining({ duration: 1, startTime: 5 }),
    ])
  );
}
