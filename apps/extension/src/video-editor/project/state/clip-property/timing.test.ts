import { updateProjectTrackAudioVolume } from '../../../../features/video/project/timeline/track-audio';
import { describe, expect, it, vi } from 'vitest';
import { createAudioClipFromAsset } from '../../../../features/video/project/factories/clip';
import {
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { parseHydratableVideoProject } from '../../../../features/video/project/validation/root';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoClipTransitionKind,
  VideoClipLinkMode,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProject,
} from '../../../../features/video/project/types';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';

function createTimingStore() {
  return createVideoEditorProjectTestStore();
}

function createProjectWithVideoClip(): VideoProject {
  const project = createEmptyVideoProject('Timing');
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

describe('video editor clip timing actions', () => {
  it('keeps missing or locked targets as no-op', () => {
    vi.spyOn(Date, 'now').mockReturnValue(400);
    const store = createTimingStore();

    store.getState().updateClipFades('missing', { fadeOutMs: 200 });
    expect(store.getState().project).toBeNull();

    const project = createProjectWithVideoClip();
    store.getState().setProject(project);
    store.getState().updateClipFades('missing', { fadeOutMs: 200 });
    expect(store.getState().project?.clips[0]?.fadeOutMs).toBe(0);

    const lockedProject = {
      ...project,
      tracks: project.tracks.map((track) => ({ ...track, locked: true })),
    };
    store.getState().setProject(lockedProject);
    store.getState().updateClipTransitions('clip-1', {
      transitionOut: VideoClipTransitionKind.CROSSFADE,
    });
    expect(store.getState().project?.clips[0]?.transitionOut).toBe(VideoClipTransitionKind.NONE);
  });
});

describe('video editor clip timing valid updates', () => {
  it('stops a slowdown at the nearest neighbor and keeps selection and boundary requests stable', () => {
    const store = createTimingStore();
    const project = createProjectWithVideoClip();
    project.clips.push({ ...project.clips[1]!, id: 'third', startTime: 10 });
    store.getState().setProject(project);
    store.getState().selectClip('clip-1');
    const neighbors = store.getState().project!.clips.slice(1);
    store.getState().updateClipPlaybackRate('clip-1', 0.1);
    const stopped = store.getState();
    expect(stopped.project?.clips[0]).toMatchObject({
      playbackRate: 0.8,
      duration: 5,
      sourceDuration: 4,
    });
    expect(stopped.project?.clips.slice(1)).toEqual(neighbors);
    expect(stopped.selection).toEqual({ kind: 'clip', clipId: 'clip-1' });
    expect(stopped.projectHistory.past).toHaveLength(1);
    store.getState().updateClipPlaybackRate('clip-1', 0.1);
    expect(store.getState().project).toBe(stopped.project);
    expect(store.getState().projectHistory).toBe(stopped.projectHistory);
    store.getState().updateClipPlaybackRate('clip-1', 2);
    expect(store.getState().project?.clips[0]?.duration).toBe(2);
  });

  it('does not constrain slowdown by another logical lane', () => {
    const store = createTimingStore();
    const project = createProjectWithVideoClip();
    project.clips[1]!.timelineLaneId = 'line-2';
    store.getState().setProject(project);
    store.getState().updateClipPlaybackRate('clip-1', 0.1);
    expect(store.getState().project?.clips[0]?.duration).toBe(40);
  });

  it('applies bounded fade, playback-rate, and transition updates for valid clips', () => {
    vi.spyOn(Date, 'now').mockReturnValue(400);
    const store = createTimingStore();
    const project = createProjectWithVideoClip();

    store.getState().setProject(project);
    store.getState().updateClipFades('clip-1', { fadeInMs: 9000, fadeOutMs: 200 });
    store.getState().updateClipPlaybackRate('clip-1', 3.5);
    store.getState().updateClipPlaybackRate('clip-1', 99);
    store.getState().updateClipTransitions('clip-1', {
      transitionOut: VideoClipTransitionKind.CROSSFADE,
    });

    expect(store.getState().project?.clips[0]).toEqual(
      expect.objectContaining({
        fadeInMs: 4000,
        fadeOutMs: 200,
        playbackRate: 16,
        transitionOut: VideoClipTransitionKind.NONE,
      })
    );
    expect(store.getState().project?.clips[0]?.duration).toBeCloseTo(0.25, 5);
    expect(store.getState().project?.clips[1]).toEqual(
      expect.objectContaining({
        fadeInMs: 0,
        fadeOutMs: 0,
        transitionOut: VideoClipTransitionKind.NONE,
      })
    );
    expect(store.getState().project?.transitions ?? []).toEqual([]);

    store.getState().updateClipPlaybackRate('clip-1', 0);
    const rateClip = store.getState().project?.clips[0];
    expect(rateClip && 'playbackRate' in rateClip ? rateClip.playbackRate : null).toBe(0.8);
    expect(rateClip?.duration).toBeCloseTo(5, 5);
  });
});

it('keeps both ends reachable when speed changes inside an authored overlap', () => {
  const store = createTimingStore();
  const project = createProjectWithVideoClip();
  project.clips[1]!.startTime = 4;
  store.getState().setProject(project);
  store.getState().updateClipPlaybackRate('clip-1', 0.1);
  const leading = store.getState().project!.clips[0]!;
  expect(leading.startTime + leading.duration).toBeCloseTo(5.9);
  store.getState().setProject(project);
  store.getState().updateClipPlaybackRate('clip-2', 16);
  const trailing = store.getState().project!.clips[1]!;
  expect(trailing.startTime + trailing.duration).toBeCloseTo(5.1);
});

it('changes an AUDIO fade without changing its linked visual clip', () => {
  const store = createTimingStore();
  const project = createProjectWithVideoClip();
  const track = createVideoProjectTrack('Audio', 2, 'AUDIO');
  project.tracks.push(track);
  const asset = createVideoProjectAsset(
    'Audio',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'audio' },
    {
      width: 0,
      height: 0,
      duration: 80,
      mimeType: 'audio/wav',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const audio = createAudioClipFromAsset(track.id, asset);
  audio.groupId = 'linked';
  audio.linkMode = VideoClipLinkMode.LINKED;
  project.clips[0]!.groupId = 'linked';
  project.clips[0]!.linkMode = VideoClipLinkMode.LINKED;
  project.clips.push(audio);
  store.getState().setProject(project);
  store.getState().updateClipFades(audio.id, { fadeInMs: 2000 });
  expect(store.getState().project?.clips[0]?.fadeInMs).toBe(0);
  expect(store.getState().project?.clips.find((clip) => clip.id === audio.id)?.fadeInMs).toBe(2000);
});

it('bounds AUDIO fades and preserves current gain through lock refusal, deletion, restore and retry', () => {
  const store = createTimingStore();
  const project = createProjectWithVideoClip();
  project.tracks[0]!.locked = true;
  const track = createVideoProjectTrack('Music', 2, 'AUDIO');
  project.tracks.push(track);
  const asset = createVideoProjectAsset(
    'Music',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'music' },
    {
      width: 0,
      height: 0,
      duration: 80,
      mimeType: 'audio/wav',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const audio = createAudioClipFromAsset(track.id, asset);
  audio.groupId = 'linked';
  audio.linkMode = VideoClipLinkMode.LINKED;
  project.clips[0]!.groupId = 'linked';
  project.clips[0]!.linkMode = VideoClipLinkMode.LINKED;
  project.assets = [asset];
  project.clips.push(audio);
  store.getState().setProject(project);
  store.setState((state) => ({
    project: state.project ? updateProjectTrackAudioVolume(state.project, track.id, 1.5) : null,
  }));
  store.getState().updateClipVolume(audio.id, 0.7);
  store.getState().updateClipFades(audio.id, { fadeInMs: 12000, fadeOutMs: 90000 });
  expect(store.getState().project?.clips.find((clip) => clip.id === audio.id)).toMatchObject({
    fadeInMs: 12000,
    fadeOutMs: 60000,
    audioGainStart: 0.7,
  });
  expect(store.getState().project?.tracks.find((item) => item.id === track.id)?.audioVolume).toBe(
    1.5
  );
  expect(store.getState().project?.clips[0]?.fadeInMs).toBe(0);
  const current = store.getState().project!;
  store.getState().setProject({
    ...current,
    tracks: current.tracks.map((item) => (item.id === track.id ? { ...item, locked: true } : item)),
  });
  const locked = store.getState().project;
  store.getState().updateClipFades(audio.id, { fadeInMs: 1000 });
  expect(store.getState().project).toBe(locked);
  store
    .getState()
    .setProject({ ...current, clips: current.clips.filter((item) => item.id !== audio.id) });
  const deleted = store.getState().project;
  store.getState().updateClipFades(audio.id, { fadeInMs: 1000 });
  expect(store.getState().project).toBe(deleted);
  store.getState().setProject(current);
  store.getState().updateClipFades(audio.id, { fadeInMs: 1000 });
  expect(store.getState().project?.clips.find((item) => item.id === audio.id)?.fadeInMs).toBe(1000);
});
it('keeps visual-origin linked fades at five seconds', () => {
  const store = createTimingStore();
  const project = createProjectWithVideoClip();
  project.clips = project.clips.slice(0, 1);
  const visual = project.clips[0]!;
  visual.duration = 80;
  if (visual.type === VideoProjectClipType.VIDEO) visual.sourceDuration = 80;
  store.getState().setProject(project);
  store.getState().updateClipFades('clip-1', { fadeInMs: 12000 });
  expect(store.getState().project?.clips[0]?.fadeInMs).toBe(5000);
});

it('edits linked source clips to exact 1/16 and reopens the resulting schema27 montage', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'slow',
    filename: 'slow.webm',
    width: 640,
    height: 360,
    duration: 1,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: true,
  });
  const before = structuredClone(project);
  const store = createTimingStore();
  store.getState().setProject(project);
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  store.getState().selectClip(clip.id);
  store.getState().updateClipPlaybackRate(clip.id, 0.0625);
  const changed = store.getState().project!;
  expect(changed.version).toBe(27);
  expect(
    changed.clips.map((clip) => ({
      duration: clip.duration,
      rate: 'playbackRate' in clip ? clip.playbackRate : undefined,
    }))
  ).toEqual([
    { duration: 16, rate: 0.0625 },
    { duration: 16, rate: 0.0625 },
  ]);
  expect(changed.duration).toBe(16);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))?.clips).toEqual(
    changed.clips
  );
  expect(store.getState().selection).toEqual({ kind: 'clip', clipId: clip.id });
  expect(project).toEqual(before);
  store.getState().updateClipPlaybackRate(clip.id, 1);
  expect(store.getState().project!.version).toBe(27);
  expect(store.getState().project!.duration).toBe(1);
});
