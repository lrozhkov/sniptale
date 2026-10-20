import { resolveVideoCompositionBorders } from '../../../features/video/composition/timeline/frame/borders';
import { expect, it } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { bindMotionRegionToClip } from '../../../features/video/project/motion/source-binding';
import { createQuickEditBorder } from '../../../features/video/project/scene/focus-appearance';
import { isHydratableVideoProject } from '../../../features/video/project/validation/root';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../history';

function setup() {
  const clip = createVideoClip({ id: 'source' });
  const project = createProject([clip]);
  const region = bindMotionRegionToClip(
    { ...createVideoProjectMotionRegion(project, 1), id: 'focus', duration: 4 },
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

it('merges border fields and nested geometry against the latest interval', () => {
  const { store, region } = setup();
  const before = store.getState().project!;
  store.getState().updateMotionRegion(region.id, { borderEdit: { enabled: true } });
  store
    .getState()
    .updateMotionRegion(region.id, { borderEdit: { settings: { color: '#1166ccff', width: 7 } } });
  store
    .getState()
    .updateMotionRegion(region.id, { borderEdit: { settings: { area: { x: 0.1 } } } });
  store
    .getState()
    .updateMotionRegion(region.id, { borderEdit: { settings: { area: { width: 0.7 } } } });
  store.getState().updateMotionRegion(region.id, {
    borderEdit: { settings: { style: 'dotted', loop: true, motion: 'pulse' } },
  });
  const after = store.getState().project!;
  expect(after.version).toBe(21);
  expect(after.motionRegions?.[0]).toMatchObject({
    borderTarget: 'window',
    border: {
      color: '#1166ccff',
      width: 7,
      area: { x: 0.1, y: 0.25, width: 0.7, height: 0.5 },
      style: 'dotted',
      loop: true,
      motion: 'pulse',
    },
  });
  expect(after.motionRegions?.[0]?.sourceBinding).toEqual(before.motionRegions?.[0]?.sourceBinding);
  expect(after.motionRegions?.[1]).toEqual(before.motionRegions?.[1]);
  expect(after.clips).toEqual(before.clips);
  expect(after.assets).toEqual(before.assets);
  expect(isHydratableVideoProject(after)).toBe(true);
  store.getState().setProject(JSON.parse(JSON.stringify(after)));
  expect(store.getState().project?.motionRegions).toEqual(after.motionRegions);
});

it('refuses invalid, repeated, removed and locked border edits without history', () => {
  const { store, region } = setup();
  store.getState().updateMotionRegion(region.id, { borderEdit: { enabled: true } });
  const accepted = store.getState();
  for (const width of [-1, 25, NaN, Infinity])
    store.getState().updateMotionRegion(region.id, { borderEdit: { settings: { width } } });
  for (const x of [-1, 2, NaN, Infinity])
    store.getState().updateMotionRegion(region.id, { borderEdit: { settings: { area: { x } } } });
  store.getState().updateMotionRegion(region.id, { borderEdit: { settings: {} } });
  store.getState().updateMotionRegion(region.id, { borderEdit: { enabled: true } });
  store.getState().updateMotionRegion('missing', { borderEdit: { enabled: true } });
  expect(store.getState().project).toBe(accepted.project);
  expect(store.getState().projectHistory).toBe(accepted.projectHistory);
  store.getState().setProject({ ...accepted.project!, motionRegions: [] });
  const removed = store.getState();
  store.getState().updateMotionRegion(region.id, { borderEdit: { settings: { width: 9 } } });
  expect(store.getState().project).toBe(removed.project);
  expect(store.getState().projectHistory).toBe(removed.projectHistory);
  store.getState().setProject({
    ...accepted.project!,
    utilityLanes: {
      actions: { visible: true, locked: false },
      camera: { visible: true, locked: true },
    },
  });
  const locked = store.getState();
  store.getState().updateMotionRegion(region.id, { borderEdit: { enabled: false } });
  expect(store.getState().project).toBe(locked.project);
  expect(store.getState().projectHistory).toBe(locked.projectHistory);
});

it('retains camera authoring across border mode and refuses a stale style edit after mode removal', () => {
  const { store, region } = setup();
  const camera = store.getState().project!.motionRegions![0]!;
  store.getState().updateMotionRegion(region.id, { borderEdit: { enabled: true } });
  expect(store.getState().project!.motionRegions![0]!.border).toEqual(createQuickEditBorder());
  store.getState().updateMotionRegion(region.id, { borderEdit: { enabled: false } });
  const cleared = store.getState();
  expect(cleared.project!.motionRegions![0]).toEqual(camera);
  store
    .getState()
    .updateMotionRegion(region.id, { borderEdit: { settings: { color: '#ff0000ff' } } });
  expect(store.getState().project).toBe(cleared.project);
  expect(store.getState().projectHistory).toBe(cleared.projectHistory);
  const undo = undoVideoEditorProjectHistory(cleared.projectHistory, cleared.project!);
  if (undo?.status !== 'applied') throw new Error('Expected undo.');
  expect(undo.project.motionRegions![0]!.border).toEqual(createQuickEditBorder());
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  if (redo?.status !== 'applied') throw new Error('Expected redo.');
  expect(redo.project.motionRegions![0]).toEqual(camera);
});

it('switches a bound window to viewport when its clock is detached and permits atomic rebinding', () => {
  const { store, region, clip } = setup();
  store.getState().updateMotionRegion(region.id, { borderEdit: { enabled: true } });
  store.getState().updateMotionRegion(region.id, { sourceClipId: null });
  expect(store.getState().project!.motionRegions![0]).toMatchObject({ borderTarget: 'viewport' });
  expect(store.getState().project!.motionRegions![0]).not.toHaveProperty('sourceBinding');
  const detached = store.getState();
  store.getState().updateMotionRegion(region.id, { borderEdit: { target: 'window' } });
  expect(store.getState().project).toBe(detached.project);
  store
    .getState()
    .updateMotionRegion(region.id, { sourceClipId: clip.id, borderEdit: { target: 'window' } });
  const rebound = store.getState();
  expect(rebound.project!.motionRegions![0]).toMatchObject({
    borderTarget: 'window',
    sourceBinding: { clipId: clip.id },
  });
  store
    .getState()
    .updateMotionRegion(region.id, { sourceClipId: clip.id, borderEdit: { target: 'window' } });
  expect(store.getState().project).toBe(rebound.project);
  expect(isHydratableVideoProject(rebound.project)).toBe(true);
});

it('changes reveal while retaining an unchanged phase curve in one atomic command', () => {
  const { store, region } = setup();
  store.getState().updateMotionRegion(region.id, { borderEdit: { enabled: true } });
  store.getState().updateMotionRegion(region.id, {
    motionTransitionPhase: { phase: 'enter', type: 'ease-in-out' },
  });
  store.getState().updateMotionRegion(region.id, {
    borderEdit: { settings: { reveal: 'draw' } },
    motionTransitionPhase: { phase: 'enter', type: 'ease-in-out' },
  });
  expect(store.getState().project!.motionRegions![0]!.border!.reveal).toBe('draw');
});

it('cancels an active camera placement when the selected interval becomes a border', () => {
  const { store, region } = setup();
  store.getState().selectMotionRegion(region.id);
  store.setState({ placementMode: { kind: 'motion-focus', motionRegionId: region.id } });
  expect(store.getState().placementMode?.kind).toBe('motion-focus');
  store.getState().updateMotionRegion(region.id, { borderEdit: { enabled: true } });
  expect(store.getState().placementMode).toBeNull();
});

it('retains border source phases through actual split, rate and duplicate commands with independent edits', () => {
  const { store, region, clip } = setup();
  store.getState().updateMotionRegion(region.id, {
    borderEdit: {
      enabled: true,
      settings: { style: 'dotted', motion: 'ripple', loop: true, period: 0.5 },
    },
  });
  const before = store.getState().project!;
  const appearance = before.motionRegions![0]!.border;
  const clock = resolveVideoCompositionBorders(before, 3.5).windows.get(clip.id)![0]!.clock;
  store.getState().splitClipAt(clip.id, 3);
  const split = store.getState().project!;
  const child = split.clips.find((item) => item.id !== clip.id)!;
  const childRegion = split.motionRegions!.find((item) => item.sourceBinding?.clipId === child.id)!;
  expect(childRegion.border).toEqual(appearance);
  expect(childRegion.borderTarget).toBe('window');
  expect(resolveVideoCompositionBorders(split, 3.5).windows.get(child.id)![0]!.clock).toEqual(
    clock
  );
  store.getState().updateClipPlaybackRate(child.id, 2);
  const sped = store.getState().project!;
  const spedRegion = sped.motionRegions!.find((item) => item.id === childRegion.id)!;
  expect(spedRegion.animation).toEqual(childRegion.animation);
  expect(spedRegion.border).toEqual(appearance);
  expect(
    resolveVideoCompositionBorders(sped, child.startTime + 0.25).windows.get(child.id)![0]!.clock
  ).toEqual(clock);
  store.getState().duplicateClip(child.id);
  const duplicated = store.getState().project!;
  const copy = duplicated.clips.find((item) => !sped.clips.some((prior) => prior.id === item.id))!;
  const copyRegion = duplicated.motionRegions!.find(
    (item) => item.sourceBinding?.clipId === copy.id
  )!;
  expect(copyRegion.border).toEqual(appearance);
  expect(copyRegion.borderTarget).toBe('window');
  expect(copyRegion.sourceBinding?.animation).toEqual(spedRegion.sourceBinding?.animation);
  store.getState().updateMotionRegion(copyRegion.id, { borderEdit: { settings: { width: 9 } } });
  expect(
    store.getState().project!.motionRegions!.find((item) => item.id === spedRegion.id)?.border
  ).toEqual(appearance);
  expect(isHydratableVideoProject(store.getState().project)).toBe(true);
});

it('refuses missing or invalid phase commands and source changes on empty intervals', () => {
  const { store, region } = setup();
  const before = store.getState();
  store
    .getState()
    .updateMotionRegion('missing', { motionTransitionPhase: { phase: 'enter', type: 'linear' } });
  store
    .getState()
    .updateMotionRegion(region.id, { motionTransitionPhase: { phase: 'enter', duration: -1 } });
  expect(store.getState().project).toBe(before.project);
  expect(store.getState().projectHistory).toBe(before.projectHistory);
  store.setState({ project: { ...before.project!, motionRegions: [{ ...region, duration: 0 }] } });
  const empty = store.getState();
  store
    .getState()
    .updateMotionRegion(region.id, { sourceClipId: null, borderEdit: { enabled: true } });
  expect(store.getState().project).toBe(empty.project);
  expect(store.getState().projectHistory).toBe(empty.projectHistory);
});

it('keeps copied source phases independent while propagating only explicit incoming connections', () => {
  const { store, region, clip } = setup();
  const project = store.getState().project!;
  const binding = project.motionRegions![0]!.sourceBinding!;
  const first = {
    ...project.motionRegions![0]!,
    sourceBinding: { ...binding, animationGroupId: 'shared-clock' },
  };
  const sibling = { ...first, id: 'sibling', startTime: 6, duration: 1 };
  store.setState({ project: { ...project, motionRegions: [first, sibling] } });
  store.getState().updateMotionRegion(region.id, { borderEdit: { enabled: true } });
  expect(store.getState().project!.motionRegions![1]!.border).toBeUndefined();
  const before = store.getState().project!;
  store.getState().updateMotionRegion(region.id, { incomingConnection: null });
  expect(store.getState().project!.motionRegions![1]!.incomingConnection).toBeUndefined();
  expect(store.getState().project!.clips).toEqual(before.clips);
  expect(store.getState().project!.clips.some((item) => item.id === clip.id)).toBe(true);
});

it('preserves dormant spatial edits and rejects invalid combined phase changes for a border', () => {
  const { store, region } = setup();
  store.getState().updateMotionRegion(region.id, { borderEdit: { enabled: true } });
  for (const spatialEdit of [
    { kind: 'perspective' as const, enabled: true, rotateY: 18 },
    { kind: 'depth' as const, enabled: true, strength: 0.6 },
    { kind: 'reference' as const, x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  ])
    store.getState().updateMotionRegion(region.id, { spatialEdit });
  const accepted = store.getState();
  expect(accepted.project!.motionRegions![0]!).toMatchObject({
    border: createQuickEditBorder(),
    perspective: { rotateY: 18 },
    depthOfField: { strength: 0.6 },
    spatialReference: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  });
  store.getState().updateMotionRegion(region.id, {
    borderEdit: { settings: { width: 9 } },
    motionTransitionPhase: { phase: 'enter', duration: -1 },
  });
  expect(store.getState().project).toBe(accepted.project);
  expect(store.getState().projectHistory).toBe(accepted.projectHistory);
});
