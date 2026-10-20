import { motionBlurSampleBounds } from '../../../features/video/composition/motion/camera-interval';
import { resolveVideoCompositionCamera } from '../../../features/video/composition/motion';
import { expect, it } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { bindMotionRegionToClip } from '../../../features/video/project/motion/source-binding';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import { isHydratableVideoProject } from '../../../features/video/project/validation/root';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../history';

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
    { ...createVideoProjectMotionRegion(project, 1), id: 'motion', duration: 4 },
    clip
  );
  project.motionRegions = [
    region,
    { ...createVideoProjectMotionRegion(project, 6), id: 'independent', duration: 1 },
  ];
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  return { store, region, clip };
}

it('merges current spatial fields without replacing concurrent authoring', () => {
  const { store, region } = setup();
  const before = store.getState().project!;
  store
    .getState()
    .updateMotionRegion(region.id, { spatialEdit: { kind: 'perspective', enabled: true } });
  store
    .getState()
    .updateMotionRegion(region.id, { spatialEdit: { kind: 'depth', strength: 0.81 } });
  store
    .getState()
    .updateMotionRegion(region.id, { spatialEdit: { kind: 'perspective', rotateX: 31 } });
  store
    .getState()
    .updateMotionRegion(region.id, { spatialEdit: { kind: 'perspective', rotateY: -22 } });
  store.getState().updateMotionRegion(region.id, { spatialEdit: { kind: 'depth', enabled: true } });
  store
    .getState()
    .updateMotionRegion(region.id, { spatialEdit: { kind: 'reference', width: 0.7 } });
  store.getState().updateMotionRegion(region.id, { spatialEdit: { kind: 'reference', x: 0.2 } });
  store
    .getState()
    .updateMotionRegion(region.id, { spatialEdit: { kind: 'perspective', enabled: false } });
  const after = store.getState().project!;
  expect(after.version).toBe(19);
  expect(after.motionRegions?.[0]).toMatchObject({
    perspective: { enabled: false, rotateX: 31, rotateY: -22 },
    depthOfField: { enabled: true, strength: 0.81 },
    spatialReference: { x: 0.2, y: 0, width: 0.7, height: 1 },
  });
  expect(after.motionRegions?.[0]?.sourceBinding).toEqual(before.motionRegions?.[0]?.sourceBinding);
  expect(after.motionRegions?.[1]).toEqual(before.motionRegions?.[1]);
  expect(after.clips).toEqual(before.clips);
  expect(isHydratableVideoProject(after)).toBe(true);
  store.getState().setProject(JSON.parse(JSON.stringify(after)));
  expect(store.getState().project?.motionRegions).toEqual(after.motionRegions);
});

it('retries accepted or refused spatial commands without duplicate history', () => {
  const { store, region } = setup();
  store
    .getState()
    .updateMotionRegion(region.id, { spatialEdit: { kind: 'perspective', rotateY: 35 } });
  const accepted = store.getState();
  for (const rotateY of [35, -61, 61, NaN, Infinity])
    store
      .getState()
      .updateMotionRegion(region.id, { spatialEdit: { kind: 'perspective', rotateY } });
  store.getState().updateMotionRegion(region.id, { spatialEdit: { kind: 'depth' } });
  store.getState().updateMotionRegion(region.id, { spatialEdit: { kind: 'reference', x: 0.5 } });
  store.getState().updateMotionRegion('missing', { spatialEdit: { kind: 'depth', enabled: true } });
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
  store.getState().updateMotionRegion(region.id, { spatialEdit: { kind: 'depth', enabled: true } });
  expect(store.getState().project).toBe(locked.project);
  expect(store.getState().projectHistory).toBe(locked.projectHistory);
  store.getState().setProject({
    ...locked.project!,
    utilityLanes: {
      actions: { visible: true, locked: false },
      camera: { visible: true, locked: false },
    },
  });
  store.getState().updateMotionRegion(region.id, { spatialEdit: { kind: 'depth', enabled: true } });
  const retried = store.getState();
  expect(retried.project?.motionRegions?.[0]?.depthOfField?.enabled).toBe(true);
  store.getState().updateMotionRegion(region.id, { spatialEdit: { kind: 'depth', enabled: true } });
  expect(store.getState().projectHistory).toBe(retried.projectHistory);
});

it('restores spatial authoring through undo redo and resets only the reference', () => {
  const { store, region } = setup();
  store
    .getState()
    .updateMotionRegion(region.id, { spatialEdit: { kind: 'perspective', rotateZ: 45 } });
  store
    .getState()
    .updateMotionRegion(region.id, { spatialEdit: { kind: 'reference', height: 0.8 } });
  const authored = store.getState().project!;
  const accepted = store.getState();
  const undo = undoVideoEditorProjectHistory(accepted.projectHistory, authored);
  if (undo?.status !== 'applied') throw new Error('Expected spatial undo');
  expect(undo.project.motionRegions?.[0]).not.toHaveProperty('spatialReference');
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  if (redo?.status !== 'applied') throw new Error('Expected spatial redo');
  expect(redo.project.motionRegions).toEqual(authored.motionRegions);
  store
    .getState()
    .updateMotionRegion(region.id, { spatialEdit: { kind: 'reference', reset: true } });
  expect(store.getState().project?.motionRegions?.[0]).not.toHaveProperty('spatialReference');
  expect(store.getState().project?.motionRegions?.[0]?.perspective?.rotateZ).toBe(45);
  expect(store.getState().project?.version).toBe(19);
});

it('retains spatial settings through source split rate and duplicate without coupling identities', () => {
  const { store, region, clip } = setup();
  store.getState().updateMotionRegion(region.id, {
    spatialEdit: { kind: 'perspective', enabled: true, rotateY: 35 },
    motionTransitionPhase: { phase: 'enter', type: 'linear', duration: 1.25 },
  });
  store.getState().updateMotionRegion(region.id, {
    spatialEdit: { kind: 'depth', enabled: true, strength: 0.8 },
  });
  store
    .getState()
    .updateMotionRegion(region.id, { spatialEdit: { kind: 'reference', width: 0.8 } });
  const beforeSplit = store.getState().project!;
  const authored = beforeSplit.motionRegions!.find((item) => item.id === region.id)!;
  expect(authored.phaseTransitions?.enter).toBe('linear');
  expect(authored.zoomInDuration).toBe(1.25);
  store.getState().splitClipAt(clip.id, 2);
  const split = store.getState().project!;
  for (const currentTime of [1.999, 2, 2.001]) {
    const prior = resolveVideoCompositionCamera({
      project: beforeSplit,
      currentTime,
      actions: [],
      cursorSample: null,
    }).spatial!;
    const next = resolveVideoCompositionCamera({
      project: split,
      currentTime,
      actions: [],
      cursorSample: null,
    }).spatial!;
    for (const index of [0, 1, 2, 3] as const)
      expect(next.rotation[index]).toBeCloseTo(prior.rotation[index], 9);
    expect(next.reference).toEqual(prior.reference);
  }
  const child = split.clips.find((item) => item.id !== clip.id)!;
  const childRegion = split.motionRegions!.find((item) => item.sourceBinding?.clipId === child.id)!;
  expect(childRegion).toMatchObject({
    perspective: authored.perspective,
    depthOfField: authored.depthOfField,
    spatialReference: authored.spatialReference,
  });
  expect(motionBlurSampleBounds(split, 2.001, 1).start).toBeLessThan(2);
  for (const changed of [
    { perspective: { ...childRegion.perspective!, rotateY: -25 } },
    { depthOfField: { ...childRegion.depthOfField!, strength: 0.2 } },
    { spatialReference: { ...childRegion.spatialReference!, width: 0.6 } },
  ]) {
    const discontinuous = {
      ...split,
      motionRegions: split.motionRegions!.map((item) =>
        item.id === childRegion.id ? { ...item, ...changed } : item
      ),
    };
    expect(motionBlurSampleBounds(discontinuous, 2.001, 1).start).toBe(2);
  }

  store.getState().updateClipPlaybackRate(child.id, 2);
  const sped = store.getState().project!;
  const spedRegion = sped.motionRegions!.find((item) => item.id === childRegion.id)!;
  expect(spedRegion).toMatchObject({
    perspective: authored.perspective,
    depthOfField: authored.depthOfField,
    spatialReference: authored.spatialReference,
  });
  expect(spedRegion.animation).toEqual(childRegion.animation);
  store.getState().duplicateClip(child.id);
  const duplicated = store.getState().project!;
  const copy = duplicated.clips.find((item) => !sped.clips.some((prior) => prior.id === item.id))!;
  const copyRegion = duplicated.motionRegions!.find(
    (item) => item.sourceBinding?.clipId === copy.id
  )!;
  expect(copyRegion).toMatchObject({
    perspective: authored.perspective,
    depthOfField: authored.depthOfField,
    spatialReference: authored.spatialReference,
  });
  store
    .getState()
    .updateMotionRegion(copyRegion.id, { spatialEdit: { kind: 'perspective', rotateY: -25 } });
  expect(
    store.getState().project!.motionRegions!.find((item) => item.id === spedRegion.id)?.perspective
  ).toEqual(spedRegion.perspective);
  expect(isHydratableVideoProject(store.getState().project)).toBe(true);
});
