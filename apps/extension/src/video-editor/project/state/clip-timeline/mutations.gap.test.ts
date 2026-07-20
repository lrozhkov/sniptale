import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProject,
} from '../../../../features/video/project/types';
import { closeProjectTrackGap } from './mutations';

describe('video editor project gap close mutations', () => {
  it('closes a simple same-track gap', () => {
    const project = createTimelineProject();
    const closedProject = closeProjectTrackGap(project, project.tracks[0]!.id, 5, 6);

    expect(closedProject.clips.find((clip) => clip.id === 'clip-1')?.startTime).toBe(1);
    expect(closedProject.clips.find((clip) => clip.id === 'clip-2')?.startTime).toBe(5);
  });

  it('moves linked companions together when closing a gap', () => {
    const linkedProject = createGapProjectWithLinkedTrailingClip();
    const closedProject = closeProjectTrackGap(linkedProject, linkedProject.tracks[0]!.id, 5, 6);

    expect(closedProject.clips.find((clip) => clip.id === 'clip-2')?.startTime).toBe(5);
    expect(closedProject.clips.find((clip) => clip.id === 'audio-2')?.startTime).toBe(5);
  });

  it('keeps gap close atomic when a linked companion is locked', () => {
    const project = createGapProjectWithLinkedTrailingClip();
    const lockedProject = {
      ...project,
      tracks: project.tracks.map((track) =>
        track.id === project.tracks[1]!.id ? { ...track, locked: true } : track
      ),
    };

    expect(closeProjectTrackGap(lockedProject, lockedProject.tracks[0]!.id, 5, 6)).toBe(
      lockedProject
    );
  });

  it('keeps the project unchanged for invalid or stale gap requests', () => {
    const project = createTimelineProject();
    const lockedProject = {
      ...project,
      tracks: project.tracks.map((track) =>
        track.id === project.tracks[0]!.id ? { ...track, locked: true } : track
      ),
    };

    expect(closeProjectTrackGap(project, project.tracks[0]!.id, 6, 5)).toBe(project);
    expect(closeProjectTrackGap(lockedProject, lockedProject.tracks[0]!.id, 5, 6)).toBe(
      lockedProject
    );
    expect(closeProjectTrackGap(project, project.tracks[0]!.id, 4.5, 6)).toBe(project);
  });
});

function createTimelineProject(): VideoProject {
  const project = createEmptyVideoProject('Timeline gap');
  const [primaryTrack] = project.tracks;

  return {
    ...project,
    clips: [
      createVideoClip({
        assetId: 'asset-1',
        id: 'clip-1',
        startTime: 1,
        trackId: primaryTrack!.id,
      }),
      createVideoClip({
        assetId: 'asset-2',
        id: 'clip-2',
        startTime: 6,
        trackId: primaryTrack!.id,
      }),
    ],
  };
}

function createGapProjectWithLinkedTrailingClip(): VideoProject {
  const project = createTimelineProject();
  const audioTrackId = project.tracks[1]!.id;
  const trailingClip = project.clips.find((clip) => clip.id === 'clip-2')!;

  return {
    ...project,
    clips: [
      project.clips[0]!,
      {
        ...trailingClip,
        groupId: 'group-2',
        linkMode: VideoClipLinkMode.LINKED,
      },
      createAudioClip({
        assetId: 'asset-2',
        duration: trailingClip.duration,
        id: 'audio-2',
        startTime: trailingClip.startTime,
        trackId: audioTrackId,
      }),
    ],
  };
}

function createVideoClip(params: {
  assetId: string;
  id: string;
  startTime: number;
  trackId: string;
}) {
  return {
    id: params.id,
    trackId: params.trackId,
    type: VideoProjectClipType.VIDEO,
    name: params.id,
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: params.startTime,
    duration: 4,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId: params.assetId,
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 0,
    sourceDuration: 4,
  };
}

function createAudioClip(params: {
  assetId: string;
  duration: number;
  id: string;
  startTime: number;
  trackId: string;
}) {
  return {
    id: params.id,
    trackId: params.trackId,
    type: VideoProjectClipType.AUDIO,
    name: params.id,
    groupId: 'group-2',
    linkMode: VideoClipLinkMode.LINKED,
    startTime: params.startTime,
    duration: params.duration,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId: params.assetId,
    sourceStart: 0,
    sourceDuration: params.duration,
  };
}
