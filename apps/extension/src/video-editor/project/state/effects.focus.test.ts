import { fixture } from '../../../features/video/review/project-conversion.test-support';
import { planReviewProjectConversion } from '../../../features/video/review/project-conversion';
import { resolveVideoCompositionCamera } from '../../../features/video/composition/motion';
import { isExportReadyVideoProject } from '../../../features/video/project/validation/root';
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
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'border' as const, enabled: true } });
  store.getState().updateMotionRegion(region.id, {
    focusEdit: { kind: 'border' as const, settings: { color: '#1166ccff', width: 7 } },
  });
  store.getState().updateMotionRegion(region.id, {
    focusEdit: { kind: 'border' as const, settings: { area: { x: 0.1 } } },
  });
  store.getState().updateMotionRegion(region.id, {
    focusEdit: { kind: 'border' as const, settings: { area: { width: 0.7 } } },
  });
  store.getState().updateMotionRegion(region.id, {
    focusEdit: {
      kind: 'border' as const,
      settings: { style: 'dotted', loop: true, motion: 'pulse' },
    },
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
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'border' as const, enabled: true } });
  const accepted = store.getState();
  for (const width of [-1, 25, NaN, Infinity])
    store.getState().updateMotionRegion(region.id, {
      focusEdit: { kind: 'border' as const, settings: { width } },
    });
  for (const x of [-1, 2, NaN, Infinity])
    store.getState().updateMotionRegion(region.id, {
      focusEdit: { kind: 'border' as const, settings: { area: { x } } },
    });
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'border' as const, settings: {} } });
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'border' as const, enabled: true } });
  store
    .getState()
    .updateMotionRegion('missing', { focusEdit: { kind: 'border' as const, enabled: true } });
  expect(store.getState().project).toBe(accepted.project);
  expect(store.getState().projectHistory).toBe(accepted.projectHistory);
  store.getState().setProject({ ...accepted.project!, motionRegions: [] });
  const removed = store.getState();
  store.getState().updateMotionRegion(region.id, {
    focusEdit: { kind: 'border' as const, settings: { width: 9 } },
  });
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
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'border' as const, enabled: false } });
  expect(store.getState().project).toBe(locked.project);
  expect(store.getState().projectHistory).toBe(locked.projectHistory);
});

it('retains camera authoring across border mode and refuses a stale style edit after mode removal', () => {
  const { store, region } = setup();
  const camera = store.getState().project!.motionRegions![0]!;
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'border' as const, enabled: true } });
  expect(store.getState().project!.motionRegions![0]!.border).toEqual(createQuickEditBorder());
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'border' as const, enabled: false } });
  const cleared = store.getState();
  expect(cleared.project!.motionRegions![0]).toEqual(camera);
  store.getState().updateMotionRegion(region.id, {
    focusEdit: { kind: 'border' as const, settings: { color: '#ff0000ff' } },
  });
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
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'border' as const, enabled: true } });
  store.getState().updateMotionRegion(region.id, { sourceClipId: null });
  expect(store.getState().project!.motionRegions![0]).toMatchObject({ borderTarget: 'viewport' });
  expect(store.getState().project!.motionRegions![0]).not.toHaveProperty('sourceBinding');
  const detached = store.getState();
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'border' as const, target: 'window' } });
  expect(store.getState().project).toBe(detached.project);
  store.getState().updateMotionRegion(region.id, {
    sourceClipId: clip.id,
    focusEdit: { kind: 'border' as const, target: 'window' },
  });
  const rebound = store.getState();
  expect(rebound.project!.motionRegions![0]).toMatchObject({
    borderTarget: 'window',
    sourceBinding: { clipId: clip.id },
  });
  store.getState().updateMotionRegion(region.id, {
    sourceClipId: clip.id,
    focusEdit: { kind: 'border' as const, target: 'window' },
  });
  expect(store.getState().project).toBe(rebound.project);
  expect(isHydratableVideoProject(rebound.project)).toBe(true);
});

it('changes reveal while retaining an unchanged phase curve in one atomic command', () => {
  const { store, region } = setup();
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'border' as const, enabled: true } });
  store.getState().updateMotionRegion(region.id, {
    motionTransitionPhase: { phase: 'enter', type: 'ease-in-out' },
  });
  store.getState().updateMotionRegion(region.id, {
    focusEdit: { kind: 'border' as const, settings: { reveal: 'draw' } },
    motionTransitionPhase: { phase: 'enter', type: 'ease-in-out' },
  });
  expect(store.getState().project!.motionRegions![0]!.border!.reveal).toBe('draw');
});

it.each(['border', 'spotlight'] as const)(
  'cancels active camera placement when the interval becomes %s',
  (kind) => {
    const { store, region } = setup();
    store.getState().selectMotionRegion(region.id);
    store.setState({ placementMode: { kind: 'motion-focus', motionRegionId: region.id } });
    expect(store.getState().placementMode?.kind).toBe('motion-focus');
    store.getState().updateMotionRegion(region.id, { focusEdit: { kind, enabled: true } });
    expect(store.getState().placementMode).toBeNull();
  }
);

it('retains border source phases through actual split, rate and duplicate commands with independent edits', () => {
  const { store, region, clip } = setup();
  store.getState().updateMotionRegion(region.id, {
    focusEdit: {
      kind: 'border' as const,
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
  store.getState().updateMotionRegion(copyRegion.id, {
    focusEdit: { kind: 'border' as const, settings: { width: 9 } },
  });
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
  store.getState().updateMotionRegion(region.id, {
    sourceClipId: null,
    focusEdit: { kind: 'border' as const, enabled: true },
  });
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
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'border' as const, enabled: true } });
  expect(store.getState().project!.motionRegions![1]!.border).toBeUndefined();
  const before = store.getState().project!;
  store.getState().updateMotionRegion(region.id, { incomingConnection: null });
  expect(store.getState().project!.motionRegions![1]!.incomingConnection).toBeUndefined();
  expect(store.getState().project!.clips).toEqual(before.clips);
  expect(store.getState().project!.clips.some((item) => item.id === clip.id)).toBe(true);
});

it('preserves dormant spatial edits and rejects invalid combined phase changes for a border', () => {
  const { store, region } = setup();
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'border' as const, enabled: true } });
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
    focusEdit: { kind: 'border' as const, settings: { width: 9 } },
    motionTransitionPhase: { phase: 'enter', duration: -1 },
  });
  expect(store.getState().project).toBe(accepted.project);
  expect(store.getState().projectHistory).toBe(accepted.projectHistory);
});

it('activates spotlight through the current project owner and retains camera settings across mode changes', () => {
  const { store, region } = setup();
  const before = store.getState().project!.motionRegions![0]!;
  const patch = {};
  Reflect.set(patch, 'focusEdit', { kind: 'spotlight', enabled: true });
  store.getState().updateMotionRegion(region.id, patch);
  const spotlight = store.getState().project!.motionRegions![0]!;
  expect(spotlight.spotlight).toBeDefined();
  expect(spotlight.spotlightTarget).toBe('window');
  expect(spotlight.scale).toBe(before.scale);
  expect(spotlight.sourceBinding).toEqual(before.sourceBinding);
  expect(store.getState().project!.version).toBe(22);
});

it('merges spotlight edits against current authoring and preserves its schema through Undo and Redo', () => {
  const { store, region } = setup();
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'spotlight', enabled: true } });
  store.getState().updateMotionRegion(region.id, {
    focusEdit: { kind: 'spotlight', settings: { area: { x: 0.1 }, effect: 'blur', blur: 18 } },
  });
  const previous = store.getState();
  store.getState().updateMotionRegion(region.id, {
    focusEdit: { kind: 'spotlight', settings: { area: { width: 0.8 }, strength: 0.4 } },
  });
  const accepted = store.getState();
  expect(accepted.project!.motionRegions![0]!.spotlight).toMatchObject({
    effect: 'blur',
    blur: 18,
    strength: 0.4,
    area: { x: 0.1, width: 0.8 },
  });
  expect(isHydratableVideoProject(accepted.project)).toBe(true);
  const undone = undoVideoEditorProjectHistory(accepted.projectHistory, accepted.project!);
  if (undone?.status !== 'applied') throw new Error('Expected undo.');
  expect(undone?.project?.motionRegions![0]!.spotlight).toEqual(
    previous.project!.motionRegions![0]!.spotlight
  );
  const redone = redoVideoEditorProjectHistory(undone.history, undone.project);
  if (redone?.status !== 'applied') throw new Error('Expected redo.');
  expect(redone?.project?.motionRegions![0]!.spotlight).toEqual(
    accepted.project!.motionRegions![0]!.spotlight
  );
  expect(redone?.project?.version).toBe(22);
});

it('refuses invalid, repeated, removed, locked and stale spotlight commands without history', () => {
  const { store, region } = setup();
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'spotlight', enabled: true } });
  const accepted = store.getState();
  for (const blur of [NaN, Infinity, -1, 41])
    store
      .getState()
      .updateMotionRegion(region.id, { focusEdit: { kind: 'spotlight', settings: { blur } } });
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'spotlight', settings: {} } });
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'spotlight', enabled: true } });
  store
    .getState()
    .updateMotionRegion('missing', { focusEdit: { kind: 'spotlight', enabled: true } });
  expect(store.getState().project).toBe(accepted.project);
  expect(store.getState().projectHistory).toBe(accepted.projectHistory);
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'spotlight', enabled: false } });
  const cleared = store.getState();
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'spotlight', settings: { blur: 10 } } });
  expect(store.getState().project).toBe(cleared.project);
  expect(store.getState().projectHistory).toBe(cleared.projectHistory);
  store.getState().setProject({
    ...cleared.project!,
    utilityLanes: {
      actions: { visible: true, locked: false },
      camera: { visible: true, locked: true },
    },
  });
  const locked = store.getState();
  store
    .getState()
    .updateMotionRegion(region.id, { focusEdit: { kind: 'spotlight', enabled: true } });
  expect(store.getState().project).toBe(locked.project);
  expect(store.getState().projectHistory).toBe(locked.projectHistory);
});

it('retains spotlight source phases through split, rate and duplicate with independent current edits', async () => {
  const { getMotionAnimationTime } = await import('../../../features/video/project/motion/timing');
  const { store, region, clip } = setup();
  store.getState().updateMotionRegion(region.id, {
    focusEdit: {
      kind: 'spotlight',
      enabled: true,
      target: 'scene',
      settings: { effect: 'blur', blur: 18, reveal: 'contract', exitReveal: 'fade' },
    },
  });
  const before = store.getState().project!.motionRegions![0]!;
  const sourceClock = getMotionAnimationTime(before, 2.5);
  store.getState().splitClipAt(clip.id, 3);
  const split = store.getState().project!;
  const child = split.clips.find((item) => item.id !== clip.id)!;
  const childRegion = split.motionRegions!.find((item) => item.sourceBinding?.clipId === child.id)!;
  expect(childRegion.spotlight).toEqual(before.spotlight);
  expect(childRegion.spotlightTarget).toBe('scene');
  expect(getMotionAnimationTime(childRegion, 3.5 - childRegion.startTime)).toBe(sourceClock);
  store.getState().updateClipPlaybackRate(child.id, 2);
  const sped = store.getState().project!;
  const spedRegion = sped.motionRegions!.find((item) => item.id === childRegion.id)!;
  expect(getMotionAnimationTime(spedRegion, 0.25)).toBe(sourceClock);
  expect(spedRegion.spotlight).toEqual(before.spotlight);
  store.getState().duplicateClip(child.id);
  const duplicated = store.getState().project!;
  const copy = duplicated.clips.find((item) => item.id !== clip.id && item.id !== child.id)!;
  const copyRegion = duplicated.motionRegions!.find(
    (item) => item.sourceBinding?.clipId === copy.id
  )!;
  store
    .getState()
    .updateMotionRegion(copyRegion.id, { focusEdit: { kind: 'spotlight', settings: { blur: 9 } } });
  expect(
    store.getState().project!.motionRegions!.find((item) => item.id === childRegion.id)!.spotlight
      ?.blur
  ).toBe(18);
  expect(
    store.getState().project!.motionRegions!.find((item) => item.id === copyRegion.id)!.spotlight
      ?.blur
  ).toBe(9);
});

it('switches camera scope and detaches the source without changing the original focus point meaning', () => {
  const { store, region, clip } = setup();
  const base = store.getState().project!;
  const focused = {
    ...region,
    focusPoint: { x: 400, y: 250 },
    focusArea: { x: 300, y: 200, width: 400, height: 200 },
  };
  store.getState().setProject({
    ...base,
    clips: [
      {
        ...clip,
        transform: { ...clip.transform, x: 100, y: 50, width: 800, height: 450 },
        sourceCrop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      },
    ],
    motionRegions: [focused, base.motionRegions![1]!],
  });
  const before = store.getState();
  store.getState().updateMotionRegion(region.id, { cameraTarget: 'window' });
  const window = store.getState();
  const camera = window.project!.motionRegions![0]!;
  expect(camera.sourceBinding?.coordinateSpace).toBe('source-window');
  expect(camera.focusPoint).toEqual({ x: 512, y: 328 });
  expect(camera.focusArea).toMatchObject({ x: 384, y: 264, width: 512, height: 256 });
  expect(camera.sourceBinding?.animation).toEqual(region.sourceBinding!.animation);
  expect(window.project!.motionRegions![1]).toBe(before.project!.motionRegions![1]);
  expect(isHydratableVideoProject(JSON.parse(JSON.stringify(window.project)))).toBe(true);
  const undo = undoVideoEditorProjectHistory(window.projectHistory, window.project!);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.motionRegions![0]!.focusPoint).toEqual(focused.focusPoint);
  expect(undo.project.motionRegions![0]!.sourceBinding?.coordinateSpace).toBeUndefined();
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  if (redo?.status !== 'applied') throw new Error('Expected redo');
  expect(redo.project.motionRegions![0]!.focusPoint).toEqual(camera.focusPoint);
  store.getState().updateMotionRegion(region.id, { cameraTarget: 'window' });
  expect(store.getState().project).toBe(window.project);
  expect(store.getState().projectHistory).toBe(window.projectHistory);
  store.getState().updateMotionRegion(region.id, { sourceClipId: null });
  expect(store.getState().project!.motionRegions![0]!.focusPoint).toEqual(focused.focusPoint);
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(store.getState().project!.motionRegions![0]!.focusArea![key]).toBeCloseTo(
      focused.focusArea[key],
      9
    );
  expect(store.getState().project!.motionRegions![0]!.sourceBinding).toBeUndefined();
});

it('refuses camera scope changes without a concrete visible source and preserves history', () => {
  const { store, region } = setup();
  const project = store.getState().project!;
  store.getState().setProject({ ...project, clips: [] });
  const before = store.getState();
  store.getState().updateMotionRegion(region.id, { cameraTarget: 'window' });
  expect(store.getState().project).toBe(before.project);
  expect(store.getState().projectHistory).toBe(before.projectHistory);
});

it('remembers outgoing curves on the source without changing its own legacy curve or incoming connection', () => {
  const { store, clip } = setup();
  const project = store.getState().project!;
  const a = { ...createVideoProjectMotionRegion(project, 0), id: 'a', duration: 1 };
  const b = {
    ...createVideoProjectMotionRegion(project, 2),
    id: 'b',
    duration: 1,
    easing: VideoTemporalEasing.EASE_OUT,
    incomingConnection: { fromRegionId: a.id, easing: VideoTemporalEasing.EASE_IN_OUT },
  };
  const c = { ...createVideoProjectMotionRegion(project, 4), id: 'c', duration: 1 };
  store.setState({ project: { ...project, motionRegions: [a, b, c] } });
  store.getState().updateMotionRegion(c.id, {
    incomingConnection: { fromRegionId: b.id, easing: VideoTemporalEasing.LINEAR },
  });
  const linked = store.getState().project!;
  const source = linked.motionRegions!.find((region) => region.id === b.id)!;
  expect(source.phaseTransitions?.link).toBe('LINEAR');
  expect(source.easing).toBe('EASE_OUT');
  expect(source.incomingConnection).toEqual(b.incomingConnection);
  const { phaseTransitions: _preference, ...legacy } = source;
  for (const time of [2.02, 2.15, 2.5, 2.85, 2.98]) {
    const camera = (region: typeof source) =>
      resolveVideoCompositionFrame(
        { ...linked, motionRegions: [{ ...region, incomingConnection: null }] },
        time
      ).camera;
    expect(camera(source)).toEqual(camera(legacy));
  }
  store.getState().updateMotionRegion(c.id, { incomingConnection: null });
  const removed = store.getState().project!;
  expect(
    removed.motionRegions!.find((region) => region.id === c.id)?.incomingConnection
  ).toBeUndefined();
  expect(removed.motionRegions!.find((region) => region.id === b.id)?.phaseTransitions?.link).toBe(
    'LINEAR'
  );
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(removed)));
  expect(reopened.motionRegions!.find((region) => region.id === b.id)?.phaseTransitions?.link).toBe(
    'LINEAR'
  );
  expect(isHydratableVideoProject(reopened)).toBe(true);
  const history = undoVideoEditorProjectHistory(store.getState().projectHistory, removed);
  if (history?.status !== 'applied') throw new Error('Undo refused');
  expect(
    history.project.motionRegions!.find((region) => region.id === c.id)?.incomingConnection?.easing
  ).toBe('LINEAR');
  expect(removed.clips.find((item) => item.id === clip.id)).toEqual(
    project.clips.find((item) => item.id === clip.id)
  );
});

import { VideoTemporalEasing } from '../../../features/video/project/types';
import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';
import { hydrateVideoProject } from '../../../features/video/project/hydration';

it('remembers the legacy curve when an existing connection is removed', () => {
  const { store } = setup();
  const project = store.getState().project!;
  const source = { ...createVideoProjectMotionRegion(project, 0), id: 'source', duration: 1 };
  const target = {
    ...createVideoProjectMotionRegion(project, 3),
    id: 'target',
    duration: 1,
    incomingConnection: { fromRegionId: source.id, easing: VideoTemporalEasing.EASE_OUT },
  };
  store.setState({ project: { ...project, motionRegions: [source, target] } });
  store.getState().updateMotionRegion(target.id, { incomingConnection: null });
  expect(store.getState().project!.motionRegions![0]!.phaseTransitions?.link).toBe('EASE_OUT');
  expect(store.getState().project!.motionRegions![0]!.easing).toBe(source.easing);
});

it('shares source preference across split parts and replaces passive provenance only on explicit connection', () => {
  const { store, clip } = setup();
  const project = store.getState().project!;
  const source = bindMotionRegionToClip(
    { ...createVideoProjectMotionRegion(project, 1), id: 'source', duration: 6 },
    clip
  );
  source.sourceBinding = {
    ...source.sourceBinding!,
    coordinateSpace: 'source-window',
    animationGroupId: 'source-group',
    unresolvedLinkTo: 'deleted-gallery-target',
  };
  source.phaseTransitions = { link: VideoTemporalEasing.EASE_OUT };
  const target = bindMotionRegionToClip(
    { ...createVideoProjectMotionRegion(project, 7.25), id: 'target', duration: 0.5 },
    clip
  );
  target.sourceBinding = {
    ...target.sourceBinding!,
    coordinateSpace: 'source-window',
    animationGroupId: 'target-group',
  };
  store.getState().setProject({ ...project, version: 34, motionRegions: [source, target] });
  store.getState().splitClipAt(clip.id, 4);
  const split = store.getState().project!;
  const sources = split.motionRegions!.filter(
    (region) => region.sourceBinding?.animationGroupId === 'source-group'
  );
  expect(sources).toHaveLength(2);
  expect(
    sources.every((region) => region.sourceBinding?.unresolvedLinkTo === 'deleted-gallery-target')
  ).toBe(true);
  const copyStore = createVideoEditorProjectTestStore();
  copyStore.getState().setProject(split);
  const trailingSourceClipId = sources.toSorted((a, b) => a.startTime - b.startTime).at(-1)!
    .sourceBinding!.clipId;
  copyStore.getState().duplicateClip(trailingSourceClipId);
  const copiedState = copyStore.getState();
  if (copiedState.selection.kind !== 'clip') throw new Error('Copy did not select its clip');
  const copiedClipId = copiedState.selection.clipId;
  const copied = copiedState.project!.motionRegions!.find(
    (region) =>
      region.sourceBinding?.clipId === copiedClipId &&
      region.sourceBinding.unresolvedLinkTo === 'deleted-gallery-target'
  )!;
  expect(copied.phaseTransitions?.link).toBe('EASE_OUT');
  expect(copied.sourceBinding?.animationGroupId).not.toBe('source-group');
  const last = sources.toSorted((a, b) => a.startTime - b.startTime).at(-1)!;
  const destination = split.motionRegions!.find(
    (region) => region.sourceBinding?.animationGroupId === 'target-group' && region.duration > 0
  )!;
  store.getState().updateMotionRegion(destination.id, {
    incomingConnection: { fromRegionId: last.id, easing: VideoTemporalEasing.LINEAR },
  });
  const accepted = store.getState().project!;
  for (const part of accepted.motionRegions!.filter(
    (region) => region.sourceBinding?.animationGroupId === 'source-group'
  )) {
    expect(part.phaseTransitions?.link).toBe('LINEAR');
    expect(part.sourceBinding?.unresolvedLinkTo).toBeUndefined();
  }
  store.setState({
    project: {
      ...accepted,
      utilityLanes: { ...accepted.utilityLanes!, camera: { visible: true, locked: true } },
    },
  });
  const locked = store.getState();
  store.getState().updateMotionRegion(destination.id, { incomingConnection: null });
  expect(store.getState().project).toBe(locked.project);
  expect(store.getState().projectHistory).toBe(locked.projectHistory);
});

it.each([0, 30, 90, -135])(
  'retains all four area corners through scope changes, reopen and detach at %s degrees',
  async (rotation) => {
    const { motionWindowAreaPoints, motionWindowFocusToComposition } =
      await import('../../../features/video/composition/motion/source-window');
    const { store, region, clip } = setup();
    const base = store.getState().project!;
    const focused = {
      ...region,
      focusMode: 'MANUAL_AREA' as const,
      focusPoint: { x: 0, y: 0 },
      focusArea: {
        x: base.width * 0.25,
        y: base.height * 0.25,
        width: base.width * 0.4,
        height: base.height * 0.3,
      },
      sourceBinding: { ...region.sourceBinding!, coordinateSpace: 'source-window' as const },
    };
    store.getState().setProject({
      ...base,
      version: 34,
      clips: [
        {
          ...clip,
          transform: { ...clip.transform, x: 200, y: 100, width: 600, height: 300, rotation },
        },
      ],
      motionRegions: [focused],
    });
    const before = store.getState().project!;
    const expected = motionWindowAreaPoints(
      before,
      before.motionRegions![0]!,
      focused.focusArea,
      3
    );
    const expectedPoint = motionWindowFocusToComposition(
      before,
      before.motionRegions![0]!,
      focused.focusPoint,
      3
    );
    const assertCorners = () => {
      const project = store.getState().project!;
      const current = project.motionRegions![0]!;
      const actual = motionWindowAreaPoints(project, current, current.focusArea!, 3);
      const point = motionWindowFocusToComposition(project, current, current.focusPoint!, 3);
      expect(point.x).toBeCloseTo(expectedPoint.x, 6);
      expect(point.y).toBeCloseTo(expectedPoint.y, 6);
      for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
        expect(actual[corner].x, corner).toBeCloseTo(expected[corner].x, 6);
        expect(actual[corner].y, corner).toBeCloseTo(expected[corner].y, 6);
      }
      expect(isHydratableVideoProject(JSON.parse(JSON.stringify(project)))).toBe(true);
    };
    store.getState().updateMotionRegion(region.id, { cameraTarget: 'scene' });
    assertCorners();
    const saved = JSON.parse(JSON.stringify(store.getState().project));
    store.getState().setProject(saved);
    assertCorners();
    store.getState().updateMotionRegion(region.id, { cameraTarget: 'window' });
    assertCorners();
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(store.getState().project!.motionRegions![0]!.focusArea![key]).toBeCloseTo(
        focused.focusArea[key],
        6
      );
    store.getState().updateMotionRegion(region.id, { sourceClipId: null });
    assertCorners();
    expect(store.getState().project!.motionRegions![0]!.sourceBinding).toBeUndefined();
    const state = store.getState();
    const undo = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
    if (undo?.status !== 'applied') throw new Error('Expected undo');
    expect(undo.project.motionRegions![0]!.sourceBinding?.coordinateSpace).toBe('source-window');
    expect(undo.project.clips).toEqual(before.clips);
  }
);

it('refuses invalid converted area directions without changing accepted data or history', () => {
  const { store, region } = setup();
  const before = store.getState();
  for (const axes of [
    { x: { x: 1, y: 0 }, y: { x: 1, y: 0 } },
    { x: { x: NaN, y: 0 }, y: { x: 0, y: 1 } },
  ])
    store
      .getState()
      .updateMotionRegion(region.id, { focusArea: { x: 20, y: 30, width: 100, height: 80, axes } });
  expect(store.getState().project).toBe(before.project);
  expect(store.getState().projectHistory).toBe(before.projectHistory);
});

it.each([0, 30, 90, -135])(
  'targets the concrete source ACTION on a window rotated %s degrees',
  (rotation) => {
    const input = fixture();
    input.document.edits = [];
    const converted = planReviewProjectConversion(input);
    if (converted.status !== 'prepared') throw new Error(JSON.stringify(converted));
    const project = converted.project;
    const clip = project.clips.find((item) => item.type === 'VIDEO')!;
    if (clip.type !== 'VIDEO' || !clip.sourceInstanceId)
      throw new Error('Expected source instance');
    clip.transform = { ...clip.transform, x: 80, y: 45, width: 400, height: 225, rotation };
    clip.sourceCrop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
    project.actionEvents = [
      {
        id: 'captured-target',
        kind: 'CLICK',
        label: 'Click',
        data: {},
        point: { x: 0.25, y: 0.75 },
        anchor: {
          kind: 'recording-source',
          recordingId: 'recording',
          sourceInstanceId: clip.sourceInstanceId,
          sourceEventId: 'source-click',
          sourceTime: 1,
        },
        presentation: { enabled: false, point: { x: 0.35, y: 0.6 } },
      },
    ];
    const region = {
      ...createVideoProjectMotionRegion(project, 0, { enter: 'linear', exit: 'linear' }),
      duration: 2,
      scale: 2.5,
      focusMode: 'ACTION' as const,
      focusPoint: { x: project.width * 0.5, y: project.height * 0.5 },
      targetAction: { eventId: 'captured-target', clipId: clip.id },
      zoomInDuration: 0.5,
      zoomOutDuration: 0.5,
      sourceBinding: {
        clipId: clip.id,
        coordinateSpace: 'source-window' as const,
        sourceStart: 0,
        sourceEnd: 2,
        animation: { start: 0, end: 2, duration: 2 },
      },
    };
    project.motionRegions = [region];
    const manual = structuredClone(project);
    manual.motionRegions = [
      {
        ...region,
        focusMode: 'MANUAL',
        focusPoint: { x: project.width * 0.35, y: project.height * 0.6 },
      },
    ];
    const before = structuredClone(project);
    for (const currentTime of [0.125, 0.375, 1, 1.625, 1.875]) {
      const actual = resolveVideoCompositionCamera({
        project,
        currentTime,
        actions: [],
        cursorSample: null,
      });
      const expected = resolveVideoCompositionCamera({
        project: manual,
        currentTime,
        actions: [],
        cursorSample: null,
      });
      expect(actual.viewportX).toBeCloseTo(expected.viewportX, 7);
      expect(actual.viewportY).toBeCloseTo(expected.viewportY, 7);
      expect(actual.focusPoint.x).toBeCloseTo(expected.focusPoint.x, 7);
      expect(actual.focusPoint.y).toBeCloseTo(expected.focusPoint.y, 7);
    }
    expect(project).toEqual(before);
    const missing = { ...project, actionEvents: [] };
    const fallback = { ...manual, motionRegions: [{ ...region, focusMode: 'MANUAL' as const }] };
    const resolve = (candidate: typeof project) =>
      resolveVideoCompositionCamera({
        project: candidate,
        currentTime: 1,
        actions: [],
        cursorSample: null,
      });
    expect(resolve(missing)).toEqual(resolve(fallback));

    const store = createVideoEditorProjectTestStore();
    store.getState().setProject(project);
    store.getState().splitClipAt(clip.id, 0.5);
    const split = store.getState().project!;
    const tail = split.clips.find(
      (item) =>
        item.type === 'VIDEO' &&
        item.sourceInstanceId === clip.sourceInstanceId &&
        item.sourceStart === 0.5
    )!;
    expect(tail).toBeDefined();
    const tailRegion = split.motionRegions!.find((item) => item.sourceBinding?.clipId === tail.id)!;
    expect(tailRegion.targetAction).toEqual({ eventId: 'captured-target', clipId: tail.id });
    store.getState().updateClipPlaybackRate(tail.id, 2);
    const sped = store.getState().project!;
    const camera = (candidate: typeof project, time: number) =>
      resolveVideoCompositionCamera({
        project: candidate,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
    const originalFrame = camera(project, 1);
    const editedFrame = camera(sped, tail.startTime + 0.25);
    expect(editedFrame.focusPoint.x).toBeCloseTo(originalFrame.focusPoint.x, 7);
    expect(editedFrame.focusPoint.y).toBeCloseTo(originalFrame.focusPoint.y, 7);
    expect(editedFrame.viewportX).toBeCloseTo(originalFrame.viewportX, 7);
    expect(editedFrame.viewportY).toBeCloseTo(originalFrame.viewportY, 7);
    store.getState().duplicateClip(tail.id);
    const duplicated = store.getState().project!;
    const copy = duplicated.clips.find(
      (item) => !sped.clips.some((prior) => prior.id === item.id) && item.type === 'VIDEO'
    )!;
    const copyRegion = duplicated.motionRegions!.find(
      (item) => item.sourceBinding?.clipId === copy.id
    )!;
    expect(copyRegion.targetAction?.clipId).toBe(copy.id);
    expect(copyRegion.targetAction?.eventId).not.toBe('captured-target');
    expect(camera(duplicated, copy.startTime + 0.25).focusPoint).toEqual(editedFrame.focusPoint);
    expect(isExportReadyVideoProject(duplicated)).toBe(true);
    store.getState().setProject(JSON.parse(JSON.stringify(duplicated)));
    expect(camera(store.getState().project!, copy.startTime + 0.25).focusPoint).toEqual(
      editedFrame.focusPoint
    );
    const accepted = store.getState().project!;
    store.getState().trimClipEnd(tail.id, tail.startTime + 0.1);
    const trimmed = store.getState().project!;
    const frozen = trimmed.motionRegions!.find((item) => item.id === tailRegion.id)!;
    expect(frozen.targetAction).toBeNull();
    expect(frozen.focusMode).toBe('MANUAL');
    expect(frozen.focusPoint!.x).toBeCloseTo(project.width * 0.35, 7);
    expect(frozen.focusPoint!.y).toBeCloseTo(project.height * 0.6, 7);
    expect(trimmed.motionRegions!.find((item) => item.id === copyRegion.id)).toEqual(
      accepted.motionRegions!.find((item) => item.id === copyRegion.id)
    );
    expect(trimmed.actionEvents.find((event) => event.id === 'captured-target')).toEqual(
      project.actionEvents[0]
    );
    expect(isExportReadyVideoProject(trimmed)).toBe(true);
    const undone = undoVideoEditorProjectHistory(store.getState().projectHistory, trimmed);
    expect(undone?.status).toBe('applied');
    if (undone?.status === 'applied')
      expect(undone.project.motionRegions).toEqual(accepted.motionRegions);
    expect(project).toEqual(before);
  }
);
