import { expect, it } from 'vitest';
import { resolveVideoCompositionCamera } from '../../composition/motion';
import { createProject, createVideoClip } from '../timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion, normalizeVideoProjectMotionRegion } from './index';
import {
  parseMotionSourceBinding,
  projectMotionSourceBinding,
  reconcileMotionSourceBindings,
  bindMotionRegionToUniqueVideo,
} from './source-binding';

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
