import { describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
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
  expect(trimProjectClipStart(project, 'clip-1', 4.99)).toBe(project);

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
  expect(minimalEndClip?.duration).toBeCloseTo(0.1, 5);
  expect(
    minimalEndClip && 'sourceDuration' in minimalEndClip ? minimalEndClip.sourceDuration : null
  ).toBeCloseTo(0.1, 5);

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
