import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
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
import { regionMotionBlurAmount } from '../../../features/video/composition/motion/blur';
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
      motionBlurAmount: 0,
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

it('merges phase edits with current settings and preserves independent regions', () => {
  const { store, region } = setup();
  const before = store.getState().project!;
  store
    .getState()
    .updateMotionRegion(region.id, { motionBlurPhase: { phase: 'enter', enabled: true } });
  store
    .getState()
    .updateMotionRegion(region.id, { motionBlurPhase: { phase: 'exit', strength: 0.731 } });
  store
    .getState()
    .updateMotionRegion(region.id, { motionBlurPhase: { phase: 'enter', strength: 0.913 } });
  store
    .getState()
    .updateMotionRegion(region.id, { motionBlurPhase: { phase: 'enter', enabled: false } });
  const after = store.getState().project!;
  expect(after.version).toBe(17);
  expect(after.motionRegions?.[0]?.motionBlur).toEqual({
    enter: { enabled: false, strength: 0.913 },
    exit: { enabled: false, strength: 0.731 },
    link: { enabled: false, strength: 0.5 },
  });
  expect(after.motionRegions?.[1]).toEqual(before.motionRegions?.[1]);
  expect(after.clips).toEqual(before.clips);
  expect(after.assets).toEqual(before.assets);
  expect(after.motionRegions?.[0]?.sourceBinding).toEqual(before.motionRegions?.[0]?.sourceBinding);
  expect(isHydratableVideoProject(after)).toBe(true);
  store.getState().setProject(JSON.parse(JSON.stringify(after)));
  expect(store.getState().project?.motionRegions).toEqual(after.motionRegions);
});

it('refuses invalid, repeated, missing and locked phase edits without history', () => {
  const { store, region } = setup();
  store
    .getState()
    .updateMotionRegion(region.id, { motionBlurPhase: { phase: 'enter', enabled: true } });
  const accepted = store.getState();
  for (const strength of [-1, 1.1, NaN, Infinity])
    store
      .getState()
      .updateMotionRegion(region.id, { motionBlurPhase: { phase: 'enter', strength } });
  store
    .getState()
    .updateMotionRegion(region.id, { motionBlurPhase: { phase: 'enter', enabled: true } });
  store.getState().updateMotionRegion(region.id, { motionBlurPhase: { phase: 'enter' } });
  store
    .getState()
    .updateMotionRegion('missing', { motionBlurPhase: { phase: 'enter', enabled: true } });
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
    .updateMotionRegion(region.id, { motionBlurPhase: { phase: 'link', enabled: true } });
  expect(store.getState().project).toBe(locked.project);
  expect(store.getState().projectHistory).toBe(locked.projectHistory);
});

it('restores authored phases through undo redo and source split rate duplicate', () => {
  const { store, region, clip } = setup();
  const original = store.getState().project!;
  store
    .getState()
    .updateMotionRegion(region.id, { motionBlurPhase: { phase: 'enter', strength: 0.8 } });
  store
    .getState()
    .updateMotionRegion(region.id, { motionBlurPhase: { phase: 'enter', enabled: true } });
  const accepted = store.getState();
  const undo = undoVideoEditorProjectHistory(accepted.projectHistory, accepted.project!);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.motionRegions?.[0]?.motionBlur?.enter).toEqual({
    enabled: false,
    strength: 0.8,
  });
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
  expect(spedRegion.motionBlur).toEqual(childRegion.motionBlur);
  expect(
    regionMotionBlurAmount(spedRegion, spedRegion.startTime + spedRegion.duration * 0.1, {
      connectedIn: false,
      connectedOut: false,
    })
  ).toBe(0.8);
  store.getState().duplicateClip(child.id);
  const duplicated = store.getState().project!;
  const copy = duplicated.clips.find((item) => !sped.clips.some((prior) => prior.id === item.id))!;
  const copyRegion = duplicated.motionRegions!.find(
    (item) => item.sourceBinding?.clipId === copy.id
  )!;
  expect(copyRegion.motionBlur).toEqual(spedRegion.motionBlur);
  store
    .getState()
    .updateMotionRegion(copyRegion.id, { motionBlurPhase: { phase: 'enter', strength: 0.2 } });
  expect(
    store.getState().project!.motionRegions!.find((item) => item.id === spedRegion.id)?.motionBlur
  ).toEqual(spedRegion.motionBlur);
  expect(original.clips).toEqual(before.clips);
});

it.each(['ALLOW_OVERLAP', 'RIPPLE_PUSH'] as const)(
  'duplicates bound framing and internal links under %s',
  (mode) => {
    const a = createVideoClip({ id: 'a', groupId: 'group', linkMode: 'LINKED' });
    const b = createVideoClip({ id: 'b', startTime: 8, groupId: 'group', linkMode: 'LINKED' });
    const project = createProject([a, b]);
    project.timelinePlacementMode = mode;
    const outside = { ...createVideoProjectMotionRegion(project, 0), id: 'outside', duration: 0.5 };
    const first = {
      ...bindMotionRegionToClip(
        { ...createVideoProjectMotionRegion(project, 1), id: 'first', duration: 1 },
        a
      ),
      incomingConnection: { fromRegionId: outside.id, easing: 'LINEAR' as const },
      motionBlur: { enter: { enabled: false, strength: 0.731 } },
    };
    const second = {
      ...bindMotionRegionToClip(
        { ...createVideoProjectMotionRegion(project, 9), id: 'second', duration: 1 },
        b
      ),
      incomingConnection: { fromRegionId: first.id, easing: 'LINEAR' as const },
    };
    const store = createVideoEditorProjectTestStore();
    store
      .getState()
      .setProject(
        applyVideoProjectMutationPatch(project, { motionRegions: [outside, first, second] })
      );
    const before = store.getState().project!;
    store.getState().duplicateClip(a.id);
    const after = store.getState().project!,
      copies = after.motionRegions!.filter(
        (item) => !before.motionRegions!.some((old) => old.id === item.id)
      );
    expect(copies).toHaveLength(2);
    const firstCopy = copies.find((item) => item.motionBlur?.enter?.strength === 0.731)!;
    const secondCopy = copies.find((item) => item.id !== firstCopy.id)!;
    expect(firstCopy.incomingConnection).toBeNull();
    expect(secondCopy.incomingConnection?.fromRegionId).toBe(firstCopy.id);
    expect(firstCopy.sourceBinding?.clipId).not.toBe(a.id);
    expect(secondCopy.sourceBinding?.clipId).not.toBe(b.id);
    const originals = after.motionRegions!.filter((item) =>
      before.motionRegions!.some((old) => old.id === item.id)
    );
    const authored = (items: typeof originals) =>
      items.map(({ startTime: _time, ...rest }) => rest);
    expect(authored(originals)).toEqual(authored(before.motionRegions!));
    for (const item of originals)
      if (item.sourceBinding) {
        const source = after.clips.find((clip) => clip.id === item.sourceBinding!.clipId)!;
        if (source.type !== 'VIDEO') throw new Error('Expected video');
        expect(item.startTime).toBe(source.startTime + 1);
      }
    expect(isHydratableVideoProject(after)).toBe(true);
  }
);
