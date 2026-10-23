import { resolveVideoCompositionCamera } from '../../../features/video/composition/motion';
import { expect, it } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { bindMotionRegionToClip } from '../../../features/video/project/motion/source-binding';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../history';
import { resolveVideoCompositionRenderPasses } from '../../../features/video/composition/timeline/render';
import { motionTransitionSettings } from '../../../features/video/project/motion/timing';
import { isHydratableVideoProject } from '../../../features/video/project/validation/root';

function setup() {
  const clip = createVideoClip({
    id: 'source',
    duration: 8,
    sourceDuration: 8,
    sourceStart: 0,
    startTime: 0,
    playbackRate: 1,
  });
  const project = createProject([clip]);
  const region = bindMotionRegionToClip(
    {
      ...createVideoProjectMotionRegion(project, 1),
      id: 'motion',
      duration: 4,
      zoomInDuration: 3,
      zoomOutDuration: 0.5,
      easing: 'LINEAR',
      motionBlurAmount: 0.6,
      scale: 3,
    },
    clip
  );
  project.motionRegions = [
    region,
    { ...createVideoProjectMotionRegion(project, 6), id: 'independent', duration: 1 },
  ];
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  return { store, clip, region };
}

it('merges current scalar edits without replacing another phase or region', () => {
  const { store, region } = setup();
  const before = store.getState().project!;
  const edit = (patch: Parameters<ReturnType<typeof store.getState>['updateMotionRegion']>[1]) =>
    store.getState().updateMotionRegion(region.id, patch);
  edit({ motionTransitionPhase: { phase: 'enter', type: 'ease-in-out', duration: 2.5 } });
  edit({ motionTransitionPhase: { phase: 'exit', type: 'none' } });
  edit({ motionTransitionPhase: { phase: 'enter', duration: 3.5 } });
  const after = store.getState().project!;
  expect(after.version).toBe(18);
  expect(after.motionRegions?.[0]).toMatchObject({
    phaseTransitions: { enter: 'ease-in-out', exit: 'none' },
    zoomInDuration: 3.5,
    zoomOutDuration: 0.5,
  });
  expect(motionTransitionSettings(after.motionRegions![0]!, 'exit').duration).toBe(0);
  expect(after.motionRegions?.[1]).toEqual(before.motionRegions?.[1]);
  expect(after.clips).toEqual(before.clips);
  expect(after.assets).toEqual(before.assets);
  expect(isHydratableVideoProject(after)).toBe(true);
});

it('refuses invalid repeated missing and locked edits without history', () => {
  const { store, region } = setup();
  store.getState().updateMotionRegion(region.id, {
    motionTransitionPhase: { phase: 'enter', type: 'ease-in-out', duration: 2 },
  });
  const accepted = store.getState();
  for (const duration of [-1, 61, NaN, Infinity])
    store
      .getState()
      .updateMotionRegion(region.id, { motionTransitionPhase: { phase: 'enter', duration } });
  store
    .getState()
    .updateMotionRegion(region.id, { motionTransitionPhase: { phase: 'enter', duration: 2 } });
  store.getState().updateMotionRegion(region.id, { motionTransitionPhase: { phase: 'enter' } });
  store
    .getState()
    .updateMotionRegion('missing', { motionTransitionPhase: { phase: 'enter', type: 'none' } });
  expect(store.getState().project).toBe(accepted.project);
  expect(store.getState().projectHistory).toBe(accepted.projectHistory);
  store.getState().setProject({
    ...accepted.project!,
    utilityLanes: {
      actions: { visible: true, locked: false },
      camera: { visible: true, locked: true },
    },
  });
  const locked = store.getState();
  store
    .getState()
    .updateMotionRegion(region.id, { motionTransitionPhase: { phase: 'exit', type: 'none' } });
  expect(store.getState().project).toBe(locked.project);
  expect(store.getState().projectHistory).toBe(locked.projectHistory);
});

it('retains the animation through history source split rate and independent duplication', () => {
  const { store, region, clip } = setup();
  store.getState().updateMotionRegion(region.id, {
    motionTransitionPhase: { phase: 'enter', type: 'ease-in-out', duration: 3 },
  });
  store.getState().updateMotionRegion(region.id, {
    motionTransitionPhase: { phase: 'exit', type: 'linear', duration: 0.75 },
  });
  const accepted = store.getState();
  const undo = undoVideoEditorProjectHistory(accepted.projectHistory, accepted.project!);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.motionRegions?.[0]?.phaseTransitions).toEqual({ enter: 'ease-in-out' });
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  if (redo?.status !== 'applied') throw new Error('Expected redo');
  expect(redo.project.motionRegions).toEqual(accepted.project!.motionRegions);
  const before = accepted.project!;
  const samples = (project: typeof before, time: number) =>
    resolveVideoCompositionRenderPasses(project, time).visualPasses.map((pass) => ({
      time: pass.time,
      alpha: pass.alpha,
      scale: pass.frame.camera.scale,
      x: pass.frame.camera.viewportX,
      y: pass.frame.camera.viewportY,
    }));
  store.getState().splitClipAt(clip.id, 2);
  const split = store.getState().project!;
  for (const time of [1.999, 2, 2.001]) expect(samples(split, time)).toEqual(samples(before, time));
  const child = split.clips.find((item) => item.id !== clip.id)!;
  const childRegion = split.motionRegions!.find((item) => item.sourceBinding?.clipId === child.id)!;
  store.getState().updateClipPlaybackRate(child.id, 2);
  const sped = store.getState().project!;
  const spedRegion = sped.motionRegions!.find((item) => item.id === childRegion.id)!;
  expect(spedRegion.animation).toEqual(childRegion.animation);
  expect(spedRegion.phaseTransitions).toEqual(childRegion.phaseTransitions);
  store.getState().duplicateClip(child.id);
  const duplicated = store.getState().project!;
  const copy = duplicated.clips.find((item) => !sped.clips.some((prior) => prior.id === item.id))!;
  const copyRegion = duplicated.motionRegions!.find(
    (item) => item.sourceBinding?.clipId === copy.id
  )!;
  expect(copyRegion.phaseTransitions).toEqual(spedRegion.phaseTransitions);
  store
    .getState()
    .updateMotionRegion(copyRegion.id, { motionTransitionPhase: { phase: 'exit', type: 'none' } });
  expect(
    store.getState().project!.motionRegions!.find((item) => item.id === spedRegion.id)
      ?.phaseTransitions
  ).toEqual(spedRegion.phaseTransitions);
});

it.each(['enter', 'exit'] as const)(
  'authors Gallery smooth over inherited legacy %s without duplicate history',
  (phase) => {
    const { store, region } = setup();
    const initial = store.getState().project!;
    store.getState().setProject({
      ...initial,
      motionRegions: initial.motionRegions!.map((item) =>
        item.id === region.id ? { ...item, easing: 'EASE_IN_OUT' } : item
      ),
    });
    const time = phase === 'enter' ? 1.75 : 4.625;
    const scale = () =>
      resolveVideoCompositionCamera({
        project: store.getState().project!,
        currentTime: time,
        actions: [],
        cursorSample: null,
      }).scale;
    expect(scale()).toBe(phase === 'enter' ? 1.125 : 2.875);
    store
      .getState()
      .updateMotionRegion(region.id, { motionTransitionPhase: { phase, type: 'ease-in-out' } });
    const accepted = store.getState();
    expect(accepted.project!.motionRegions![0]!.phaseTransitions).toEqual({
      [phase]: 'ease-in-out',
    });
    expect(scale()).toBe(phase === 'enter' ? 1.3125 : 2.6875);
    store
      .getState()
      .updateMotionRegion(region.id, { motionTransitionPhase: { phase, type: 'ease-in-out' } });
    expect(store.getState().project).toBe(accepted.project);
    expect(store.getState().projectHistory).toBe(accepted.projectHistory);
  }
);
