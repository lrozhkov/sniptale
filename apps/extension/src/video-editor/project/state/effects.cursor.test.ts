import { useVideoEditorStore } from '../../state/store';
import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../../features/video/project/cursor';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import { hydrateVideoProject } from '../../../features/video/project/hydration';
import {
  deriveProjectCursorFocusPath,
  resolveProjectCursorFocus,
} from '../../../features/video/project/cursor-focus-path/projection';
import {
  insertCursorFocusKey,
  updateCursorFocusKey,
  authoredCursorFocusPath,
} from '../../../features/video/project/cursor-focus-path/authoring';
import {
  splitProjectClipsAtTimeWithResult,
  duplicateProjectClipsWithResult,
} from './clip-timeline/split';
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
      timeBasis: 'project',
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

it('inserts between existing samples and updates the inserted project-time segment', () => {
  const store = createStoreState();
  const project = createEmptyVideoProject('Cursor segments');
  project.duration = 4;
  project.cursorTrack = createCursorTrack([
    {
      id: 'sample-1',
      interpolation: VideoTemporalEasing.EASE_OUT,
      skinOverride: {
        animationPreset: VideoCursorAnimationPreset.PULSE,
        color: '#00ff88',
        hidden: false,
        preset: VideoCursorVisualPreset.DOT,
        scale: 1.2,
        shadow: false,
      },
      time: 1,
      visible: false,
      x: 200,
      y: 300,
    },
    { id: 'sample-2', time: 3, visible: true, x: 400, y: 500 },
  ]);
  store.getState().setProject(project);

  store.getState().insertCursorSample(2);
  const inserted = store
    .getState()
    .project?.cursorTrack?.samples.find((sample) => !['sample-1', 'sample-2'].includes(sample.id));
  expect(inserted).toEqual(
    expect.objectContaining({
      interpolation: VideoTemporalEasing.EASE_OUT,
      skinOverride: expect.objectContaining({ preset: VideoCursorVisualPreset.DOT }),
      time: 2,
      timeBasis: 'project',
      visible: false,
      x: 200,
      y: 300,
    })
  );

  store.getState().updateCursorSampleVisibility(inserted!.id, true);
  store.getState().updateCursorSampleInterpolation(inserted!.id, VideoTemporalEasing.INSTANT);
  store.getState().updateCursorSampleSkinOverride(inserted!.id, { scale: 1.5 });
  store.getState().clearCursorSampleSkinOverride('missing');
  store.getState().deleteCursorSample('sample-1');

  expect(store.getState().project?.cursorTrack?.samples).toEqual([
    expect.objectContaining({
      id: inserted!.id,
      interpolation: VideoTemporalEasing.INSTANT,
      skinOverride: expect.objectContaining({ scale: 1.5 }),
      visible: true,
    }),
    expect.objectContaining({ id: 'sample-2' }),
  ]);
});

function sourceFocusFixture() {
  return createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'focus.webm',
    width: 100,
    height: 100,
    duration: 4,
    mimeType: 'video/webm',
    size: 100,
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: (
        [
          ['start', 0, 10, 10, true, 0],
          ['middle', 1, 40, 50, true, 0],
          ['loss', 2, 40, 50, false, 0],
          ['return', 3, 80, 80, true, 1],
        ] as const
      ).map(([id, time, x, y, visible, captureSegment]) => ({
        id,
        time,
        x,
        y,
        visible,
        captureSegment,
        observation: visible ? ('observed' as const) : ('outside' as const),
        recordingPoint: visible ? { x: x / 100, y: y / 100 } : null,
      })),
    },
  });
}
it('source-time focus survives split/speed and duplicate gets its own binding and edits', () => {
  const project = sourceFocusFixture();
  const original = project.clips.find((clip) => clip.type === 'VIDEO')!;
  let authored = applyVideoProjectMutationPatch(project, {
    cursorFocusPath: authoredCursorFocusPath(deriveProjectCursorFocusPath(project)),
  });
  const path = deriveProjectCursorFocusPath(project);
  authored = applyVideoProjectMutationPatch(authored, {
    cursorFocusPath: authoredCursorFocusPath(
      insertCursorFocusKey(path, path.segments[0]!.id, { id: 'manual', time: 0.5, x: 0.25, y: 0.6 })
    ),
  });
  const split = splitProjectClipsAtTimeWithResult(authored, original.id, 0.75)!;
  expect(resolveProjectCursorFocus(split.project, 0.5)).toMatchObject({ x: 25, y: 60 });
  const fast = applyVideoProjectMutationPatch(split.project, {
    clips: split.project.clips.map((clip) =>
      clip.id === original.id && clip.type === 'VIDEO'
        ? { ...clip, playbackRate: 2, duration: clip.duration / 2 }
        : clip
    ),
  });
  expect(resolveProjectCursorFocus(fast, 0.25)).toMatchObject({ x: 25, y: 60 });
  const duplicate = duplicateProjectClipsWithResult(authored, original.id)!;
  expect(duplicate.project.cursorFocusPath!.segments).toHaveLength(2);
  const instances = new Set(
    duplicate.project.cursorFocusPath!.segments.flatMap((segment) =>
      segment.binding.kind === 'recording-source' ? [segment.binding.sourceInstanceId] : []
    )
  );
  expect(instances.size).toBe(2);
  expect(duplicate.project.cursorTrack!.samples.length).toBe(
    project.cursorTrack!.samples.length * 2
  );
  expect(
    duplicate.project
      .cursorFocusPath!.segments.flatMap((segment) => segment.keys)
      .filter((key) => key.id === 'manual')
  ).toHaveLength(1);
  const duplicateClip = duplicate.project.clips.find(
    (clip) => clip.id === duplicate.duplicateClipId
  )!;
  const duplicateManual = duplicate.project
    .cursorFocusPath!.segments.flatMap((segment) => segment.keys)
    .find((key) => key.anchor === 'manual' && key.id !== 'manual')!;
  const separatelyAuthored = applyVideoProjectMutationPatch(duplicate.project, {
    cursorFocusPath: updateCursorFocusKey(duplicate.project.cursorFocusPath!, duplicateManual.id, {
      x: 0.9,
    }),
  });
  expect(resolveProjectCursorFocus(separatelyAuthored, 0.5)).toMatchObject({ x: 25, y: 60 });
  expect(
    resolveProjectCursorFocus(separatelyAuthored, duplicateClip.startTime + 0.5)
  ).toMatchObject({ x: 90, y: 60 });
});

it('keeps original source focus after deleting a split head; duplicate edits stay independent', () => {
  const initial = useVideoEditorStore.getState();
  try {
    const project = sourceFocusFixture();
    const original = project.clips.find((clip) => clip.type === 'VIDEO')!;
    const derived = deriveProjectCursorFocusPath(project);
    const authored = applyVideoProjectMutationPatch(project, {
      cursorFocusPath: authoredCursorFocusPath(
        insertCursorFocusKey(derived, derived.segments[1]!.id, {
          id: 'tail-focus',
          time: 3.5,
          x: 0.6,
          y: 0.7,
        })
      ),
    });
    useVideoEditorStore.getState().setProject(authored);
    useVideoEditorStore.getState().duplicateClip(original.id);
    let snapshot = useVideoEditorStore.getState().project!;
    const duplicate = snapshot.clips.find(
      (clip) => clip.type === 'VIDEO' && clip.id !== original.id
    )!;
    const duplicateKey = snapshot
      .cursorFocusPath!.segments.flatMap((segment) => segment.keys)
      .find((key) => key.anchor === 'manual' && key.id !== 'tail-focus')!;
    useVideoEditorStore.getState().updateProject((current) =>
      applyVideoProjectMutationPatch(current, {
        cursorFocusPath: updateCursorFocusKey(current.cursorFocusPath!, duplicateKey.id, {
          x: 0.9,
        }),
      })
    );
    useVideoEditorStore.getState().splitClipAt(original.id, 2);
    snapshot = useVideoEditorStore.getState().project!;
    const returnBefore = snapshot.cursorTrack!.samples.find((sample) => sample.id === 'return')!;
    expect(returnBefore.sourceAnchor).toBeDefined();
    useVideoEditorStore.getState().deleteClip(original.id);
    const retained = useVideoEditorStore.getState().project!;
    expect(resolveProjectCursorFocus(retained, 3)).toMatchObject({ x: 80, y: 80 });
    expect(resolveProjectCursorFocus(retained, 3.5)).toMatchObject({ x: 60, y: 70 });
    expect(resolveProjectCursorFocus(retained, duplicate.startTime + 3.5)).toMatchObject({
      x: 90,
      y: 70,
    });
    expect(retained.cursorTrack!.samples.find((sample) => sample.id === 'return')).toEqual(
      returnBefore
    );
    const reopened = hydrateVideoProject(structuredClone(retained));
    expect(resolveProjectCursorFocus(reopened, 3.5)).toMatchObject({ x: 60, y: 70 });
  } finally {
    useVideoEditorStore.setState(initial, true);
  }
});
