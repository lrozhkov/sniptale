import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import {
  VideoProjectTrackRole,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import { setup } from '../insertion/material.test-support';
import { resetVideoEditorProjectHistory } from '../../history';

function recording(rate = 1, cameraStart = 2) {
  const { store } = setup();
  const base = createVideoProjectFromRecording({
    recordingId: 'source-bounds',
    filename: 'screen.webm',
    width: 1280,
    height: 720,
    duration: 8,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    sidecarVideos: [
      {
        recordingId: 'camera',
        filename: 'camera.webm',
        width: 640,
        height: 480,
        duration: 8,
        mimeType: 'video/webm',
        size: 100,
        trackRole: VideoProjectTrackRole.CAMERA,
      },
    ],
  });
  const project = {
    ...base,
    duration: 6,
    clips: base.clips.map((clip, index) => ({
      ...clip,
      startTime: index === 0 ? 2 : cameraStart,
      duration: 2,
      playbackRate: rate,
      sourceStart: index === 0 ? 2 : 0.25,
      sourceDuration: 2 * rate,
    })),
  };
  store.setState({ project, projectHistory: resetVideoEditorProjectHistory(project.id) });
  return { store, project };
}

it.each([1, 2])(
  'clamps a linked start trim to camera source zero at %sx and records only one action',
  (rate) => {
    const { store, project } = recording(rate);
    store.getState().trimClipStart(project.clips[0]!.id, 1.5);
    const clamped = store.getState();
    const clips = clamped.project!.clips as VideoProjectVideoClip[];
    clips.forEach((clip, index) => {
      const before = project.clips[index] as VideoProjectVideoClip;
      expect(clip.startTime).toBe(2 - 0.25 / rate);
      expect(clip.startTime + clip.duration).toBe(before.startTime + before.duration);
      expect(clip.sourceStart + clip.sourceDuration).toBe(
        before.sourceStart + before.sourceDuration
      );
    });
    expect(clips[1]!.sourceStart).toBe(0);
    expect(clamped.projectHistory.past).toHaveLength(1);
    expect(clamped.projectHistory.past[0]!.clips).toEqual(project.clips);
    store.getState().trimClipStart(project.clips[0]!.id, 1.5);
    expect(store.getState().project).toBe(clamped.project);
    expect(store.getState().projectHistory).toBe(clamped.projectHistory);
  }
);

it('can expand to exact source zero while keeping both project and source Out fixed', () => {
  const { store, project } = recording(2);
  store.getState().trimClipStart(project.clips[0]!.id, 1.875);
  const clips = store.getState().project!.clips as VideoProjectVideoClip[];
  clips.forEach((clip, index) => {
    const before = project.clips[index] as VideoProjectVideoClip;
    expect(clip.startTime + clip.duration).toBeCloseTo(before.startTime + before.duration);
    expect(clip.sourceStart + clip.sourceDuration).toBeCloseTo(
      before.sourceStart + before.sourceDuration
    );
  });
  expect(clips[1]!.sourceStart).toBe(0);
  expect(store.getState().projectHistory.past).toHaveLength(1);
  expect(store.getState().projectHistory.past[0]!.clips).toEqual(project.clips);
});

it('does not constrain a start trim by a linked companion whose start edge is elsewhere', () => {
  const { store, project } = recording(1, 3);
  store.getState().trimClipStart(project.clips[0]!.id, 1.5);
  expect(store.getState().project!.clips[0]!.startTime).toBe(1.5);
  expect(store.getState().project!.clips[1]).toEqual(project.clips[1]);
});

it('holds an expanding end before a separated neighbor instead of tunneling across several clips', () => {
  const { store, project } = recording();
  const screen = project.clips[0]!;
  project.clips.push(
    { ...screen, id: 'next-screen', groupId: null, startTime: 5, sourceDuration: 1, duration: 1 },
    { ...screen, id: 'last-screen', groupId: null, startTime: 7, sourceDuration: 1, duration: 1 }
  );
  const untouched = project.clips.slice(2);
  store.getState().trimClipEnd(screen.id, 50);
  const stopped = store.getState();
  expect(stopped.project!.clips[0]!.startTime + stopped.project!.clips[0]!.duration).toBe(5);
  expect(stopped.project!.clips[1]!.startTime + stopped.project!.clips[1]!.duration).toBe(5);
  expect(stopped.project!.clips.slice(2)).toEqual(untouched);
  store.getState().trimClipEnd(screen.id, 50);
  expect(store.getState().project).toBe(stopped.project);
});

it('holds an expanding start after a separated neighbor', () => {
  const { store, project } = recording();
  const screen = project.clips[0]!;
  project.clips.push({
    ...screen,
    id: 'previous-screen',
    groupId: null,
    startTime: 0,
    sourceDuration: 1.9,
    duration: 1.9,
  });
  store.getState().trimClipStart(screen.id, 0);
  expect(store.getState().project!.clips[0]!.startTime).toBeCloseTo(1.9);
  expect(store.getState().project!.clips[1]!.startTime).toBeCloseTo(1.9);
});

it('uses the tightest linked lane limit for a common playback rate without moving neighbors', () => {
  const { store, project } = recording();
  const screen = project.clips[0]!;
  const camera = project.clips[1]!;
  project.clips.push({
    ...camera,
    id: 'next-camera',
    groupId: null,
    startTime: 4.5,
    sourceDuration: 1,
    duration: 1,
  });
  const neighbor = project.clips[2];
  store.getState().updateClipPlaybackRate(screen.id, 0.1);
  const result = store.getState().project!;
  expect(result.clips[0]).toMatchObject({ playbackRate: 0.8, duration: 2.5, sourceDuration: 2 });
  expect(result.clips[1]).toMatchObject({ playbackRate: 0.8, duration: 2.5, sourceDuration: 2 });
  expect(result.clips[2]).toEqual(neighbor);
  expect(store.getState().projectHistory.past).toHaveLength(1);
});
