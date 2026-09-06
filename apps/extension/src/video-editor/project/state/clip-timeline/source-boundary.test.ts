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
