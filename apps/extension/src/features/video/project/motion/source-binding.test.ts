import { createQuickEditBorder } from '../scene/focus-appearance';
import { expect, it } from 'vitest';
import { resolveVideoCompositionCamera } from '../../composition/motion';
import { createProject, createVideoClip } from '../timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion, normalizeVideoProjectMotionRegion } from './index';
import { isExportReadyVideoProject, isHydratableVideoProject } from '../validation/root';
import {
  parseMotionSourceBinding,
  projectMotionSourcePhases,
  projectMotionSourceBinding,
  reconcileMotionSourceBindings,
  bindMotionRegionToUniqueVideo,
  bindMotionRegionToClip,
} from './source-binding';

it.each([0.5, 2, 3.2])(
  'keeps fractional-frame framing valid for saving and export at %sx',
  (rate) => {
    const clip = createVideoClip();
    const project = createProject([clip]);
    const region = bindMotionRegionToClip(
      { ...createVideoProjectMotionRegion(project, 13 / 30), duration: 1.6 },
      clip
    );
    project.motionRegions = [region];
    expect(isExportReadyVideoProject(project)).toBe(true);
    const changed = reconcileMotionSourceBindings(project, {
      ...project,
      clips: [{ ...clip, playbackRate: rate, duration: clip.duration / rate }],
    });
    expect(isHydratableVideoProject(changed)).toBe(true);
    expect(isExportReadyVideoProject(changed)).toBe(true);
    expect(changed.motionRegions?.[0]?.animation).toEqual({ start: 0, end: 1.6, duration: 1.6 });
    const reopened = JSON.parse(JSON.stringify(changed));
    expect(isExportReadyVideoProject(reopened)).toBe(true);
  }
);

it('retains fractional authored endpoints through partial trims and untrim', () => {
  const clip = createVideoClip();
  const project = createProject([clip]);
  const start = 13 / 30;
  const region = bindMotionRegionToClip(
    { ...createVideoProjectMotionRegion(project, start), duration: 1.6 },
    clip
  );
  for (const [sourceStart, sourceEnd] of [
    [start, start + 0.8],
    [start + 0.8, start + 1.6],
    [start + 0.4, start + 1.2],
  ]) {
    const trimmed = {
      ...project,
      clips: [{ ...clip, sourceStart: sourceStart!, sourceDuration: sourceEnd! - sourceStart! }],
    };
    const projected = projectMotionSourceBinding(trimmed, region);
    expect(isExportReadyVideoProject({ ...trimmed, motionRegions: [projected] })).toBe(true);
    expect(projected.animation!.start).toBeCloseTo(sourceStart! - start);
    expect(projected.animation!.end).toBeCloseTo(sourceEnd! - start);
    expect(projectMotionSourceBinding(project, projected).animation).toEqual({
      start: 0,
      end: 1.6,
      duration: 1.6,
    });
  }
});

function fixture() {
  const clip = createVideoClip({
    id: 'source',
    sourceStart: 10,
    sourceDuration: 8,
    startTime: 2,
    duration: 8,
    playbackRate: 1,
  });
  const project = createProject([clip]);
  const region = {
    ...createVideoProjectMotionRegion(project, 4),
    duration: 4,
    sourceBinding: {
      clipId: clip.id,
      sourceStart: 12,
      sourceEnd: 16,
      animation: { start: 0, end: 4, duration: 4 },
    },
  };
  return { clip, project, region };
}

it('projects move and rate through the bound instance while preserving the authored clock', () => {
  const { clip, project, region } = fixture();
  project.clips = [{ ...clip, startTime: 20, playbackRate: 2, duration: 4 }];
  const result = projectMotionSourceBinding(project, region);
  expect(result).toMatchObject({
    startTime: 21,
    duration: 2,
    animation: { start: 0, end: 4, duration: 4 },
  });
  expect(result.sourceBinding).toEqual(region.sourceBinding);
});

it('retains trimmed-out authoring and restores it after extending the original clip', () => {
  const { clip, project, region } = fixture();
  project.clips = [{ ...clip, sourceStart: 14, sourceDuration: 1, startTime: 6, duration: 1 }];
  const trimmed = normalizeVideoProjectMotionRegion(project, region);
  expect(trimmed).toMatchObject({
    startTime: 6,
    duration: 1,
    animation: { start: 2, end: 3, duration: 4 },
  });
  project.clips = [{ ...clip, sourceStart: 17, sourceDuration: 1, duration: 1 }];
  const hidden = normalizeVideoProjectMotionRegion(project, trimmed);
  expect(hidden.duration).toBe(0);
  expect(hidden.sourceBinding).toEqual(region.sourceBinding);
  project.clips = [clip];
  expect(normalizeVideoProjectMotionRegion(project, hidden)).toMatchObject({
    startTime: 4,
    duration: 4,
    animation: { start: 0, end: 4, duration: 4 },
  });
});

it('does not transfer a missing clip binding to another instance of the same asset', () => {
  const { clip, project, region } = fixture();
  project.clips = [{ ...clip, id: 'duplicate' }];
  const projected = projectMotionSourceBinding(project, region);
  expect(projected.duration).toBe(0);
  expect(projected.sourceBinding?.clipId).toBe('source');
});

it('rejects malformed source intervals at the receiving boundary', () => {
  const { region } = fixture();
  expect(parseMotionSourceBinding(region.sourceBinding)).toEqual(region.sourceBinding);
  for (const value of [
    null,
    {},
    { ...region.sourceBinding, clipId: '' },
    { ...region.sourceBinding, sourceStart: -1 },
    { ...region.sourceBinding, sourceEnd: 12 },
    { ...region.sourceBinding, sourceEnd: Infinity },
    { ...region.sourceBinding, animation: { start: 0, end: 5, duration: 4 } },
  ]) {
    expect(parseMotionSourceBinding(value)).toBeNull();
  }
});

it('splits only onto the explicit child, preserves the clock and redirects an outgoing connection', () => {
  const { clip, project, region } = fixture();
  const nextState = {
    ...region,
    id: 'later',
    startTime: 20,
    sourceBinding: undefined,
    incomingConnection: { fromRegionId: region.id, easing: region.easing },
  };
  const { sourceBinding: _, ...unbound } = nextState;
  project.motionRegions = [region, unbound];
  const next = {
    ...project,
    clips: [
      { ...clip, sourceDuration: 4, duration: 4 },
      { ...clip, id: 'child', sourceStart: 14, sourceDuration: 4, startTime: 6, duration: 4 },
      { ...clip, id: 'unrelated', startTime: 30 },
    ],
  };
  const result = reconcileMotionSourceBindings(project, next, new Map([[clip.id, 'child']]));
  expect(result.motionRegions).toHaveLength(3);
  expect(result.motionRegions?.[0]).toMatchObject({
    id: region.id,
    startTime: 4,
    duration: 2,
    animation: { start: 0, end: 2, duration: 4 },
  });
  const child = result.motionRegions![1]!;
  expect(child).toMatchObject({
    startTime: 6,
    duration: 2,
    sourceBinding: { clipId: 'child' },
    animation: { start: 2, end: 4, duration: 4 },
    incomingConnection: null,
  });
  expect(result.motionRegions?.[2]?.incomingConnection?.fromRegionId).toBe(child.id);
});

it('restores retained states across successive clip edits and removes them with their source', () => {
  const { clip, project, region } = fixture();
  project.motionRegions = [region];
  const trimmed = reconcileMotionSourceBindings(project, {
    ...project,
    clips: [{ ...clip, sourceStart: 17, sourceDuration: 1, duration: 1 }],
  });
  expect(trimmed.motionRegions?.[0]?.duration).toBe(0);
  const restored = reconcileMotionSourceBindings(trimmed, { ...trimmed, clips: [clip] });
  expect(restored.motionRegions?.[0]).toMatchObject({ startTime: 4, duration: 4 });
  expect(restored.motionRegions?.[0]?.sourceBinding).toEqual(region.sourceBinding);
  expect(reconcileMotionSourceBindings(restored, { ...restored, clips: [] }).motionRegions).toEqual(
    []
  );
});

it('binds an unambiguous visible video but leaves multiple instances explicit', () => {
  const { clip, project, region } = fixture();
  const { sourceBinding: _, ...unbound } = region;
  expect(bindMotionRegionToUniqueVideo(project, unbound).sourceBinding?.clipId).toBe(clip.id);
  project.clips.push({ ...clip, id: 'duplicate' });
  expect(bindMotionRegionToUniqueVideo(project, unbound).sourceBinding).toBeUndefined();
});

it('updates the source interval when the authored state is moved, then follows later clip movement', () => {
  const { clip, project, region } = fixture();
  project.motionRegions = [region];
  const edited = reconcileMotionSourceBindings(project, {
    ...project,
    motionRegions: [{ ...region, startTime: 5 }],
  });
  expect(edited.motionRegions?.[0]?.sourceBinding).toMatchObject({
    sourceStart: 13,
    sourceEnd: 17,
  });
  const moved = reconcileMotionSourceBindings(edited, {
    ...edited,
    clips: [{ ...clip, startTime: 20 }],
  });
  expect(moved.motionRegions?.[0]).toMatchObject({ startTime: 23, duration: 4 });
});

it('preserves a long zoom-in when a source cut falls inside its animation', () => {
  const { clip, project, region } = fixture();
  region.zoomInDuration = 3;
  region.zoomOutDuration = 1;
  project.motionRegions = [region];
  const split = reconcileMotionSourceBindings(
    project,
    {
      ...project,
      clips: [
        { ...clip, sourceDuration: 4, duration: 4 },
        { ...clip, id: 'child', sourceStart: 14, sourceDuration: 4, startTime: 6, duration: 4 },
      ],
    },
    new Map([[clip.id, 'child']])
  );
  for (const currentTime of [4.2, 5.9, 6, 6.1, 7.2]) {
    const params = { currentTime, actions: [], cursorSample: null };
    expect(resolveVideoCompositionCamera({ ...params, project: split }).scale).toBeCloseTo(
      resolveVideoCompositionCamera({ ...params, project }).scale,
      8
    );
  }
});

it('preserves external connections when either split part becomes fully trimmed out', () => {
  const { clip, project, region } = fixture();
  const previous = {
    ...createVideoProjectMotionRegion(project, 0),
    id: 'previous',
    duration: 1,
    scale: 1.5,
  };
  const following = {
    ...createVideoProjectMotionRegion(project, 10),
    id: 'following',
    startTime: 10,
    duration: 2,
    scale: 3,
    incomingConnection: { fromRegionId: region.id, easing: region.easing },
  };
  region.scale = 2;
  region.zoomInDuration = 3;
  region.zoomOutDuration = 2;
  region.incomingConnection = { fromRegionId: previous.id, easing: region.easing };
  project.motionRegions = [previous, region, following];
  const leadingClip = { ...clip, sourceDuration: 4, duration: 4 };
  const trailingClip = {
    ...clip,
    id: 'child',
    sourceStart: 14,
    sourceDuration: 4,
    startTime: 6,
    duration: 4,
  };
  const split = reconcileMotionSourceBindings(
    project,
    { ...project, clips: [leadingClip, trailingClip] },
    new Map([[clip.id, trailingClip.id]])
  );
  const headHidden = reconcileMotionSourceBindings(split, {
    ...split,
    clips: [{ ...leadingClip, sourceDuration: 1, duration: 1 }, trailingClip],
  });
  const camera = (state: typeof project, currentTime: number) =>
    resolveVideoCompositionCamera({ project: state, currentTime, actions: [], cursorSample: null });
  expect(camera(headHidden, 6.1).scale).toBeCloseTo(2, 8);
  expect(camera(headHidden, 4).scale).toBeGreaterThan(1.5);
  const tailHidden = reconcileMotionSourceBindings(split, {
    ...split,
    clips: [
      leadingClip,
      { ...trailingClip, sourceStart: 17, sourceDuration: 1, startTime: 9, duration: 1 },
    ],
  });
  expect(camera(tailHidden, 5.9).scale).toBeCloseTo(2, 8);
  expect(camera(tailHidden, 8).scale).toBeCloseTo(2.5, 8);
  const restored = reconcileMotionSourceBindings(tailHidden, {
    ...tailHidden,
    clips: [leadingClip, trailingClip],
  });
  for (const time of [2, 4.1, 5.9, 6.1, 7.9, 9]) {
    expect(camera(restored, time).scale).toBeCloseTo(camera(project, time).scale, 8);
  }
});

it('redirects a deleted split endpoint only to its surviving authored group', () => {
  const { clip, project, region } = fixture();
  const following = {
    ...createVideoProjectMotionRegion(project, 9),
    id: 'following',
    startTime: 9,
    duration: 1,
    incomingConnection: { fromRegionId: region.id, easing: region.easing },
  };
  project.motionRegions = [region, following];
  const leading = { ...clip, sourceDuration: 4, duration: 4 };
  const trailing = {
    ...clip,
    id: 'child',
    sourceStart: 14,
    sourceDuration: 4,
    startTime: 6,
    duration: 4,
  };
  const duplicate = { ...clip, id: 'same-asset', startTime: 20 };
  const split = reconcileMotionSourceBindings(
    project,
    { ...project, clips: [leading, trailing, duplicate] },
    new Map([[clip.id, trailing.id]])
  );
  const child = split.motionRegions!.find((item) => item.sourceBinding?.clipId === trailing.id)!;
  expect(
    split.motionRegions!.find((item) => item.id === following.id)!.incomingConnection?.fromRegionId
  ).toBe(child.id);
  const deletedTail = reconcileMotionSourceBindings(split, {
    ...split,
    clips: [leading, duplicate],
  });
  expect(
    deletedTail.motionRegions!.find((item) => item.id === following.id)!.incomingConnection
      ?.fromRegionId
  ).toBe(region.id);
  expect(deletedTail.motionRegions!.some((item) => item.id === child.id)).toBe(false);
  const deletedSource = reconcileMotionSourceBindings(deletedTail, {
    ...deletedTail,
    clips: [duplicate],
  });
  expect(deletedSource.motionRegions).toHaveLength(1);
  expect(deletedSource.motionRegions![0]!.incomingConnection).toBeNull();
});

it('retains window border authoring and its source phase through trim, untrim and clip movement', () => {
  const clip = createVideoClip();
  const project = createProject([clip]);
  project.version = 21;
  const region = bindMotionRegionToClip(
    {
      ...createVideoProjectMotionRegion(project, 1),
      duration: 4,
      border: { ...createQuickEditBorder(), style: 'dotted', loop: true, motion: 'ripple' },
      borderTarget: 'window',
    },
    clip
  );
  project.motionRegions = [region];
  const trimmed = {
    ...project,
    clips: [
      { ...clip, sourceStart: 2, sourceDuration: 2, startTime: 8, duration: 1, playbackRate: 2 },
    ],
  };
  const projected = projectMotionSourceBinding(trimmed, region);
  expect(projected.animation).toEqual({ start: 1, end: 3, duration: 4 });
  expect(projected.border).toEqual(region.border);
  expect(projected.borderTarget).toBe('window');
  expect(projected.startTime).toBe(8);
  expect(projected.duration).toBe(1);
  const restored = projectMotionSourceBinding(project, projected);
  expect(restored.animation).toEqual({ start: 0, end: 4, duration: 4 });
  expect(restored.sourceBinding).toEqual(region.sourceBinding);
  expect(restored.border).toEqual(region.border);
  expect(isHydratableVideoProject({ ...project, motionRegions: [restored] })).toBe(true);
});

it('preserves Gallery phase policy on resize, persistence and raw phase editing', async () => {
  const { applyVideoProjectMutationPatch } = await import('../mutation');
  const { editMotionTransitionPhase } = await import('./timing');
  const { clip, project, region } = fixture();
  const bound = {
    ...region,
    sourceBinding: {
      ...region.sourceBinding,
      phaseProjection: 'retained-result' as const,
      coordinateSpace: 'source-window' as const,
      animationGroupId: 'authored',
    },
    phaseTransitions: { enter: 'linear' as const, exit: 'linear' as const },
    zoomInDuration: 2,
    zoomOutDuration: 2,
  };
  const saved = applyVideoProjectMutationPatch(project, { motionRegions: [bound] });
  expect(saved.version).toBe(34);
  expect(isHydratableVideoProject(saved)).toBe(true);
  expect(isExportReadyVideoProject(JSON.parse(JSON.stringify(saved)))).toBe(true);
  for (let version = 2; version < 34; version++)
    expect(isHydratableVideoProject({ ...saved, version })).toBe(false);
  expect(isHydratableVideoProject({ ...saved, version: 35 })).toBe(false);
  expect(parseMotionSourceBinding({ ...bound.sourceBinding, phaseProjection: 'other' })).toBeNull();
  expect(parseMotionSourceBinding({ ...bound.sourceBinding, phaseProjection: null })).toBeNull();
  expect(parseMotionSourceBinding(bound.sourceBinding)).toEqual(bound.sourceBinding);
  expect(parseMotionSourceBinding({ ...bound.sourceBinding, coordinateSpace: 'other' })).toBeNull();
  expect(parseMotionSourceBinding({ ...bound.sourceBinding, coordinateSpace: null })).toBeNull();
  const { phaseProjection: _projection, ...windowOnly } = bound.sourceBinding;
  const windowSaved = applyVideoProjectMutationPatch(project, {
    motionRegions: [{ ...bound, sourceBinding: windowOnly }],
  });
  expect(windowSaved.version).toBe(34);
  expect(isHydratableVideoProject(windowSaved)).toBe(true);
  expect(isHydratableVideoProject({ ...windowSaved, version: 33 })).toBe(false);
  const fast = reconcileMotionSourceBindings(saved, {
    ...saved,
    clips: [{ ...clip, playbackRate: 2, duration: 4 }],
  });
  const raw = fast.motionRegions![0]!;
  expect(raw.sourceBinding).toEqual(bound.sourceBinding);
  expect(projectMotionSourcePhases(fast).motionRegions![0]!.zoomInDuration).toBe(1);
  expect(raw.zoomInDuration).toBe(2);
  const edited = editMotionTransitionPhase(raw, { phase: 'enter', duration: 1.5 });
  expect(edited?.zoomInDuration).toBe(1.5);
  expect(edited?.sourceBinding).toEqual(bound.sourceBinding);
  const fastClip = fast.clips[0]!;
  if (fastClip.type !== 'VIDEO') throw new Error('Expected video');
  const resized = bindMotionRegionToClip({ ...raw, duration: 1 }, fastClip);
  expect(resized.sourceBinding).toMatchObject({
    phaseProjection: 'retained-result',
    animationGroupId: 'authored',
    animation: { start: 0, end: 2, duration: 2 },
  });
  expect(
    projectMotionSourcePhases(saved).motionRegions![0]!.sourceBinding?.phaseProjection
  ).toBeUndefined();
  expect(saved.motionRegions![0]!.sourceBinding?.phaseProjection).toBe('retained-result');
});

it.each(['gap', 'overlap', 'reorder', 'independent'] as const)(
  'does not merge Gallery phases across an unrelated %s segment',
  (kind) => {
    const { clip, project, region } = fixture();
    const first = {
      ...clip,
      sourceStart: 12,
      sourceDuration: 2,
      startTime: 0,
      duration: 2,
      sourceInstanceId: 'original',
    };
    const second = {
      ...first,
      id: 'second',
      sourceStart: kind === 'reorder' ? 10 : 14,
      startTime: kind === 'gap' ? 3 : kind === 'overlap' ? 1 : 2,
      sourceInstanceId: kind === 'independent' ? 'other' : 'original',
    };
    const bound = {
      ...region,
      startTime: 0,
      duration: 2,
      zoomInDuration: 4,
      zoomOutDuration: 0,
      phaseTransitions: { enter: 'linear' as const, exit: 'none' as const },
      sourceBinding: {
        ...region.sourceBinding,
        clipId: first.id,
        animationGroupId: 'focus',
        phaseProjection: 'retained-result' as const,
      },
    };
    const next = {
      ...project,
      clips: [first, second],
      motionRegions: [
        bound,
        {
          ...bound,
          id: 'second-focus',
          sourceBinding: { ...bound.sourceBinding, clipId: second.id },
        },
      ],
    };
    const effective = projectMotionSourcePhases(next).motionRegions![0]!;
    expect(effective.animation).toEqual({ start: 0, end: 2, duration: 2 });
    expect(effective.zoomInDuration).toBe(2);
    expect(bound.zoomInDuration).toBe(4);
  }
);

it.each([false, true])(
  'preserves explicit dormant=%s through clip edits and source rebinding',
  (dormant) => {
    const clip = createVideoClip();
    const project = createProject([clip]);
    const active = bindMotionRegionToClip(
      { ...createVideoProjectMotionRegion(project, 0), duration: 2 },
      clip
    );
    const region = { ...active, sourceBinding: { ...active.sourceBinding!, dormant } };
    project.motionRegions = [projectMotionSourceBinding(project, region)];
    for (const playbackRate of [0.5, 2]) {
      const edited = reconcileMotionSourceBindings(project, {
        ...project,
        clips: [{ ...clip, playbackRate, duration: clip.duration / playbackRate }],
      });
      const accepted = edited.motionRegions![0]!;
      expect(accepted.sourceBinding?.dormant).toBe(dormant);
      expect(accepted.duration === 0).toBe(dormant);
      const target = edited.clips[0]!;
      if (target.type !== 'VIDEO') throw new Error('Missing bound video');
      const rebound = projectMotionSourceBinding(edited, bindMotionRegionToClip(accepted, target));
      expect(rebound.sourceBinding?.dormant).toBe(dormant);
      expect(parseMotionSourceBinding(rebound.sourceBinding)).toEqual(rebound.sourceBinding);
      if (dormant) expect(rebound.sourceBinding).toEqual(region.sourceBinding);
    }
  }
);

it('refuses malformed dormant bindings and does not admit active dormant intervals', () => {
  const clip = createVideoClip();
  const project = createProject([clip]);
  const region = bindMotionRegionToClip(
    { ...createVideoProjectMotionRegion(project, 0), duration: 2 },
    clip
  );
  const binding = { ...region.sourceBinding!, dormant: true };
  expect(parseMotionSourceBinding(binding)).toEqual(binding);
  for (const dormant of ['true', 0, null])
    expect(parseMotionSourceBinding({ ...binding, dormant })).toBeNull();
  expect(
    isHydratableVideoProject({
      ...project,
      version: 34,
      motionRegions: [{ ...region, sourceBinding: binding }],
    })
  ).toBe(false);
  const hidden = projectMotionSourceBinding(project, { ...region, sourceBinding: binding });
  expect(isExportReadyVideoProject({ ...project, version: 34, motionRegions: [hidden] })).toBe(
    true
  );
  expect(isHydratableVideoProject({ ...project, version: 33, motionRegions: [hidden] })).toBe(
    false
  );
});

it('retains a passive missing target through rebinding and rejects malformed target identities', () => {
  const { project, clip, region } = fixture();
  const binding = { ...region.sourceBinding!, unresolvedLinkTo: 'missing-target' };
  expect(parseMotionSourceBinding(binding)).toEqual(binding);
  for (const unresolvedLinkTo of ['', null, 4])
    expect(parseMotionSourceBinding({ ...binding, unresolvedLinkTo })).toBeNull();
  const rebound = bindMotionRegionToClip({ ...region, sourceBinding: binding }, clip);
  expect(rebound.sourceBinding?.unresolvedLinkTo).toBe('missing-target');
  expect(isHydratableVideoProject({ ...project, version: 34, motionRegions: [rebound] })).toBe(
    true
  );
  expect(isHydratableVideoProject({ ...project, version: 33, motionRegions: [rebound] })).toBe(
    false
  );
});
