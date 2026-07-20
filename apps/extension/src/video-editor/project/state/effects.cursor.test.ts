import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
  VideoTemporalEasing,
} from '../../../features/video/project/types';
import { createVideoEditorProjectTestStore } from './test-store.test-support';

function createStoreState() {
  return createVideoEditorProjectTestStore();
}

function createCursorTrack(
  samples: NonNullable<ReturnType<typeof createEmptyVideoProject>['cursorTrack']>['samples']
): NonNullable<ReturnType<typeof createEmptyVideoProject>['cursorTrack']> {
  return {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples,
    skin: {
      animationPreset: VideoCursorAnimationPreset.NONE,
      color: '#fff',
      hidden: false,
      preset: VideoCursorVisualPreset.ARROW,
      scale: 1,
      shadow: true,
    },
  };
}

it('keeps cursor actions as no-ops when the project has no cursor track', () => {
  const store = createStoreState();
  store.getState().setProject(createEmptyVideoProject('No cursor'));

  store.getState().insertCursorSample(1);
  store.getState().deleteCursorSample('missing');
  store.getState().clearCursorSampleSkinOverride('missing');
  store.getState().updateCursorSampleVisibility('missing', false);
  store.getState().updateCursorSampleInterpolation('missing', VideoTemporalEasing.EASE_OUT);
  store.getState().updateCursorSampleSkinOverride('missing', { color: '#00ff88' });

  expect(store.getState().project?.cursorTrack).toBeNull();
});

it('inserts fallback samples into an empty cursor track and deletes the last sample to null', () => {
  const store = createStoreState();
  const project = createEmptyVideoProject('Cursor');
  project.duration = 3;
  project.cursorTrack = createCursorTrack([]);
  store.getState().setProject(project);

  store.getState().insertCursorSample(1.5);
  const insertedSample = store.getState().project?.cursorTrack?.samples[0];
  expect(insertedSample).toEqual(
    expect.objectContaining({
      interpolation: VideoTemporalEasing.LINEAR,
      time: 1.5,
      visible: true,
      x: project.width / 2,
      y: project.height / 2,
    })
  );

  store.getState().selectCursorSegment(insertedSample!.id);
  store.getState().deleteCursorSample(insertedSample!.id);

  expect(store.getState().project?.cursorTrack).toBeNull();
  expect(store.getState().selection).toEqual({ kind: 'scene' });
});

it('stores and clears per-sample cursor style overrides without mutating track skin', () => {
  const store = createStoreState();
  const project = createEmptyVideoProject('Cursor');
  project.cursorTrack = createCursorTrack([
    {
      id: 'sample-1',
      interpolation: VideoTemporalEasing.LINEAR,
      time: 1,
      visible: true,
      x: 200,
      y: 300,
    },
  ]);
  store.getState().setProject(project);

  store.getState().updateCursorSampleSkinOverride('sample-1', {
    color: '#00ff88',
    scale: 1.8,
    shadow: false,
  });

  expect(store.getState().project?.cursorTrack?.skin).toEqual({
    animationPreset: VideoCursorAnimationPreset.NONE,
    color: '#fff',
    hidden: false,
    preset: VideoCursorVisualPreset.ARROW,
    scale: 1,
    shadow: true,
  });
  expect(store.getState().project?.cursorTrack?.samples[0]?.skinOverride).toEqual({
    animationPreset: VideoCursorAnimationPreset.NONE,
    color: '#00ff88',
    hidden: false,
    preset: VideoCursorVisualPreset.ARROW,
    scale: 1.8,
    shadow: false,
  });

  store.getState().clearCursorSampleSkinOverride('sample-1');

  expect(store.getState().project?.cursorTrack?.samples[0]?.skinOverride).toBeNull();
});
