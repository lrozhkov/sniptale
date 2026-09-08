import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import {
  VideoTrackKind,
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProject,
} from '../../../../features/video/project/types';
import { moveProjectClip, trimProjectClipEnd, trimProjectClipStart } from './mutations';
import { duplicateProjectClips, splitProjectClipsAtTime } from './split';

function createTimelineProject(): VideoProject {
  const project = createEmptyVideoProject('Timeline');
  const [primaryTrack] = project.tracks;
  project.clips = [
    {
      id: 'clip-1',
      trackId: primaryTrack!.id,
      type: VideoProjectClipType.VIDEO,
      name: 'Clip 1',
      groupId: null,
      linkMode: VideoClipLinkMode.DETACHED,
      startTime: 1,
      duration: 4,
      muted: false,
      volume: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      transitionIn: VideoClipTransitionKind.NONE,
      transitionOut: VideoClipTransitionKind.NONE,
      transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
      assetId: 'asset-1',
      fitMode: VideoMediaFitMode.CONTAIN,
      sourceStart: 0,
      sourceDuration: 4,
    },
    {
      id: 'clip-2',
      trackId: primaryTrack!.id,
      type: VideoProjectClipType.VIDEO,
      name: 'Clip 2',
      groupId: null,
      linkMode: VideoClipLinkMode.DETACHED,
      startTime: 6,
      duration: 2,
      muted: false,
      volume: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      transitionIn: VideoClipTransitionKind.NONE,
      transitionOut: VideoClipTransitionKind.NONE,
      transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
      assetId: 'asset-2',
      fitMode: VideoMediaFitMode.CONTAIN,
      sourceStart: 0,
      sourceDuration: 2,
    },
  ];
  return project;
}

function createLinkedTimelineProject(): VideoProject {
  const project = createEmptyVideoProject('Timeline linked');
  project.tracks.push(createVideoProjectTrack('Audio', 2, VideoTrackKind.AUDIO));
  const [primaryTrack, audioTrack] = project.tracks;
  project.clips = [
    {
      id: 'video-1',
      trackId: primaryTrack!.id,
      type: VideoProjectClipType.VIDEO,
      name: 'Video 1',
      groupId: 'group-1',
      linkMode: VideoClipLinkMode.LINKED,
      startTime: 1,
      duration: 4,
      muted: false,
      volume: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      transitionIn: VideoClipTransitionKind.NONE,
      transitionOut: VideoClipTransitionKind.NONE,
      transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
      assetId: 'asset-1',
      fitMode: VideoMediaFitMode.CONTAIN,
      sourceStart: 0,
      sourceDuration: 4,
    },
    {
      id: 'audio-1',
      trackId: audioTrack!.id,
      type: VideoProjectClipType.AUDIO,
      name: 'Audio 1',
      groupId: 'group-1',
      linkMode: VideoClipLinkMode.LINKED,
      startTime: 1,
      duration: 4,
      muted: false,
      volume: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      transitionIn: VideoClipTransitionKind.NONE,
      transitionOut: VideoClipTransitionKind.NONE,
      transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
      assetId: 'asset-1',
      sourceStart: 0,
      sourceDuration: 4,
    },
  ];
  return project;
}

describe('video editor project clip timeline mutations', () => {
  it(
    'guards invalid move and trim mutations and applies valid timeline updates',
    verifyMoveAndTrimMutations
  );
  it(
    'preserves same-track overlaps when clips are moved into each other',
    verifyOverlapMoveMutations
  );
  it(
    'splits and duplicates clips while preserving mutation ownership',
    verifySplitAndDuplicateMutations
  );
  it(
    'guards invalid track moves and preserves linked ownership on split/duplicate',
    verifyLinkedMutationOwnership
  );
});

function verifyMoveAndTrimMutations(): void {
  vi.spyOn(Date, 'now').mockReturnValue(100);
  const project = createTimelineProject();

  expect(moveProjectClip(project, 'missing', 2)).toBe(project);
  expect(trimProjectClipStart(project, 'clip-1', 4.99).clips[0]?.duration).toBeCloseTo(
    1 / project.fps
  );

  const movedProject = moveProjectClip(project, 'clip-1', 3);
  const movedClip = movedProject.clips.find((clip) => clip.id === 'clip-1');
  expect(movedClip?.startTime).toBe(3);

  const trimmedStartProject = trimProjectClipStart(project, 'clip-1', 2);
  const trimmedStartClip = trimmedStartProject.clips.find((clip) => clip.id === 'clip-1');
  expect(trimmedStartClip).toEqual(
    expect.objectContaining({
      duration: 3,
      sourceDuration: 3,
      sourceStart: 1,
      startTime: 2,
    })
  );

  const trimmedEndProject = trimProjectClipEnd(project, 'clip-1', 4);
  const trimmedEndClip = trimmedEndProject.clips.find((clip) => clip.id === 'clip-1');
  expect(trimmedEndClip).toEqual(
    expect.objectContaining({
      duration: 3,
      sourceDuration: 3,
    })
  );
  const minimalEndClip = trimProjectClipEnd(project, 'clip-1', 0.5).clips.find(
    (clip) => clip.id === 'clip-1'
  );
  expect(minimalEndClip?.type).toBe(VideoProjectClipType.VIDEO);
  expect(minimalEndClip?.duration).toBeCloseTo(1 / project.fps, 5);
  expect(
    minimalEndClip && 'sourceDuration' in minimalEndClip ? minimalEndClip.sourceDuration : null
  ).toBeCloseTo(1 / project.fps, 5);

  expect(trimProjectClipEnd(project, 'clip-1', 10)).toBe(project);
}

function verifyOverlapMoveMutations(): void {
  const project = createTimelineProject();

  const overlappedProject = moveProjectClip(project, 'clip-2', 4);
  const movedClip = overlappedProject.clips.find((clip) => clip.id === 'clip-2');
  expect(movedClip?.startTime).toBe(4);
  expect(
    overlappedProject.clips.some(
      (clip) => clip.id === 'clip-1' && clip.startTime + clip.duration > (movedClip?.startTime ?? 0)
    )
  ).toBe(true);

  const trimmedOverlapProject = trimProjectClipStart(overlappedProject, 'clip-2', 4.5);
  const trimmedClip = trimmedOverlapProject.clips.find((clip) => clip.id === 'clip-2');
  expect(trimmedClip).toEqual(
    expect.objectContaining({
      duration: 1.5,
      sourceDuration: 1.5,
      sourceStart: 0.5,
      startTime: 4.5,
    })
  );
}

function verifySplitAndDuplicateMutations(): void {
  vi.spyOn(Date, 'now').mockReturnValue(200);
  const project = createTimelineProject();

  expect(splitProjectClipsAtTime(project, 'clip-1', 1.01)).toBe(project);

  const splitProject = splitProjectClipsAtTime(project, 'clip-1', 3);
  expect(splitProject.clips).toHaveLength(3);
  expect(splitProject.updatedAt).toBe(200);
  const splitClips = splitProject.clips
    .filter((clip) => clip.trackId === project.tracks[0]!.id)
    .sort((left, right) => left.startTime - right.startTime);
  const firstSplitClip = splitClips[0];
  const secondSplitClip = splitClips[1];
  expect(firstSplitClip).toBeDefined();
  expect(secondSplitClip).toBeDefined();
  expect(firstSplitClip!.startTime + firstSplitClip!.duration).toBe(secondSplitClip!.startTime);
  expect(splitProject.transitions ?? []).toEqual([]);

  const duplicatedProject = duplicateProjectClips(project, 'clip-1');
  expect(duplicatedProject.clips).toHaveLength(3);
  expect(duplicatedProject.clips.some((clip) => clip.id !== 'clip-1' && clip.startTime > 1)).toBe(
    true
  );
  expect(duplicatedProject.updatedAt).toBe(200);
}

function verifyLinkedMutationOwnership(): void {
  vi.spyOn(Date, 'now').mockReturnValue(300);
  const project = createLinkedTimelineProject();

  expect(moveProjectClip(project, 'video-1', 2, project.tracks[1]!.id)).toBe(project);

  const lockedProject = {
    ...project,
    tracks: project.tracks.map((track) =>
      track.id === project.tracks[0]!.id ? { ...track, locked: true } : track
    ),
  };
  expect(moveProjectClip(lockedProject, 'video-1', 2)).toBe(lockedProject);
  expect(splitProjectClipsAtTime(lockedProject, 'video-1', 3)).toBe(lockedProject);

  const splitProject = splitProjectClipsAtTime(project, 'video-1', 3);
  expect(splitProject.clips).toHaveLength(4);
  expect(
    splitProject.clips.filter((clip) => clip.linkMode === VideoClipLinkMode.LINKED)
  ).toHaveLength(4);
  expect(new Set(splitProject.clips.map((clip) => clip.groupId)).size).toBe(2);
  expect(splitProject.clips.filter((clip) => clip.type === VideoProjectClipType.AUDIO)[1]).toEqual(
    expect.objectContaining({ sourceStart: 2, sourceDuration: 2, startTime: 3 })
  );

  const duplicatedProject = duplicateProjectClips(project, 'video-1');
  expect(duplicatedProject.clips).toHaveLength(4);
  expect(
    duplicatedProject.clips.filter((clip) => clip.linkMode === VideoClipLinkMode.LINKED)
  ).toHaveLength(4);
}

it('holds transition trims before they engulf either adjacent clip', () => {
  const project = createTimelineProject();
  const first = project.clips[0]!;
  const second = project.clips[1]!;
  if (first.type !== VideoProjectClipType.VIDEO || second.type !== VideoProjectClipType.VIDEO)
    throw new Error('Video fixture');
  first.sourceStart = 5;
  second.startTime = 4;
  second.sourceStart = 5;
  const start = trimProjectClipStart(project, second.id, -10).clips[1]!;
  expect(start.startTime).toBeCloseTo(1.1);
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'asset-1' },
    {
      duration: 20,
      width: 1280,
      height: 720,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  asset.id = first.assetId;
  project.assets = [asset];
  const end = trimProjectClipEnd(project, first.id, 20).clips[0]!;
  expect(end.startTime + end.duration).toBeCloseTo(5.9);
});

it('keeps outer trims from moving an overlapping clip inside its neighbor', () => {
  const project = createTimelineProject();
  const first = project.clips[0]!;
  const second = project.clips[1]!;
  second.startTime = 4;
  const shortenedLeading = trimProjectClipStart(project, first.id, 4.5).clips[0]!;
  expect(shortenedLeading.startTime).toBeCloseTo(3.9);
  expect(shortenedLeading.startTime + shortenedLeading.duration).toBeCloseTo(5);
  const shortenedTrailing = trimProjectClipEnd(project, second.id, 4.5).clips[1]!;
  expect(shortenedTrailing.startTime + shortenedTrailing.duration).toBeCloseTo(5.1);
  expect(shortenedTrailing.startTime).toBe(4);
});

it.each([30, 60, 240])(
  'trims short source clips by project frames at %sfps without a 100ms expansion',
  (fps) => {
    const project = createTimelineProject();
    project.fps = fps;
    const clip = project.clips[0]!;
    if (clip.type !== VideoProjectClipType.VIDEO) throw new Error('Expected video fixture');
    clip.duration = 3 / fps;
    clip.sourceDuration = 3 / fps;
    const end = trimProjectClipEnd(project, clip.id, clip.startTime + 2 / fps).clips[0]!;
    expect(end.duration).toBeCloseTo(2 / fps, 10);
    const start = trimProjectClipStart(project, clip.id, clip.startTime + 1 / fps).clips[0]!;
    expect(start.duration).toBeCloseTo(2 / fps, 10);
    const minimum = trimProjectClipEnd(project, clip.id, 0).clips[0]!;
    expect(minimum.duration).toBeCloseTo(1 / fps, 10);
  }
);

it('preserves authored names through repeated cuts instead of accumulating part suffixes', () => {
  const original = createTimelineProject();
  original.clips[0]!.name = 'Мой дубль · часть 2';
  let project = original;
  let clipId = 'clip-1';
  for (const time of [2, 3, 4]) {
    project = splitProjectClipsAtTime(project, clipId, time);
    const trailing = project.clips.find((clip) => clip.startTime === time)!;
    expect(trailing.name).toBe('Мой дубль · часть 2');
    clipId = trailing.id;
  }
  expect(project.clips.filter((clip) => clip.startTime < 5).map((clip) => clip.name)).toEqual(
    Array(4).fill('Мой дубль · часть 2')
  );
  expect(original.clips).toHaveLength(2);
});

it('keeps each linked video and audio name when cutting the group', () => {
  const original = createLinkedTimelineProject();
  const originalNames = new Map(original.clips.map((clip) => [clip.type, clip.name]));
  const project = splitProjectClipsAtTime(original, 'video-1', 3);
  expect(project.clips).toHaveLength(4);
  for (const clip of project.clips) expect(clip.name).toBe(originalNames.get(clip.type));
});
