import { resolveProjectCameraConflicts } from '../composition/motion/project-follow';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../project/factories/creation';
import { VideoMotionFocusMode } from '../project/types';
import { normalizeVideoProjectCursorSkin } from '../project/cursor';
import { hydrateVideoProject } from '../project/hydration';
import { isExportReadyVideoProject, isHydratableVideoProject } from '../project/validation/root';
import {
  resolveVideoCompositionCamera,
  mapCompositionPointThroughCamera,
} from '../composition/motion';
import { getFittedMediaWindowFrame } from '../composition/draw/fitted-media';
import {
  computeQuickEditSceneLayout,
  computeQuickEditWindowTransform,
  evaluateQuickEditCameraAtTime,
  resolveReviewCameraConflicts,
} from './advanced/scene';
import { deriveReviewCursorFocusPath } from './advanced/cursor-focus-path';
import { projectReviewFocus } from './focus-edits';
import { buildReviewTimeMap } from './timeline';
import { planReviewProjectConversion } from './project-conversion';
import { fixture } from './project-conversion.test-support';

function motionFixture(anchored = true, follow = false) {
  const input = fixture();
  input.ui.tracks.zoom = true;
  input.document.edits.push({
    id: 'speed',
    kind: 'speed',
    start: 1,
    end: 3,
    requestedStart: 1,
    requestedEnd: 3,
    rate: 2,
    audio: 'speed',
  });
  input.document.advancedContent.canvas = {
    width: 320,
    height: 360,
    crop: { x: 0.1, y: 0.1, width: 0.7, height: 0.8 },
  };
  input.document.advancedContent.background = {
    enabled: true,
    type: 'solid',
    color: '#123456ff',
    zoomBehavior: 'window',
    layout: {
      padding: 17.25,
      cornerRadius: 18,
      blur: 0,
      shadow: { intensity: 0, color: '#090a0bcc' },
    },
  };
  input.document.advancedContent.zoom = {
    enabled: true,
    regions: [
      {
        id: 'focus',
        start: 0,
        end: 7,
        ...(anchored ? { sourceAnchor: { start: 0, end: 7 } } : {}),
        transform: { scale: 2.5, centerX: 0.4, centerY: 0.65 },
        followCursor: follow,
        enter: { type: 'linear', duration: 5 },
        exit: { type: 'ease-in-out', duration: 5 },
        perspective: { enabled: false, rotateX: 18, rotateY: 23, rotateZ: 0, strength: 0.7 },
        depthOfField: {
          enabled: false,
          mode: 'depth',
          x: 0.3,
          y: 0.4,
          width: 0.2,
          softness: 0.5,
          strength: 0.8,
        },
        motionBlur: {
          enter: { enabled: false, strength: 0.7 },
          exit: { enabled: false, strength: 0.8 },
        },
      },
    ],
  };
  if (follow)
    input.seed = createVideoProjectFromRecording({
      ...input.source,
      recordingId: 'recording',
      filename: 'Follow.webm',
      hasAudio: false,
      cursorTrack: {
        captureMode: 'embedded-fallback',
        skin: normalizeVideoProjectCursorSkin(undefined),
        samples: [0, 2, 4, 8].map((time, index) => ({
          id: `point-${index}`,
          time,
          x: [0.3, 0.35, 0.65, 0.7][index]! * 640,
          y: 0.53 * 360,
          visible: true,
          observation: 'observed',
          captureSegment: 0,
          recordingPoint: { x: [0.3, 0.35, 0.65, 0.7][index]!, y: 0.53 },
        })),
      },
    });
  return input;
}

it('carries a following optical lens from Gallery into a reopened Native project', () => {
  const input = motionFixture(true, true);
  const authored = input.document.advancedContent.zoom.regions[0]!;
  authored.spotlight = {
    ...createQuickEditSpotlight(),
    effect: 'magnify',
    magnification: 2.5,
    lensOptics: 'optical',
    lensEdgeWidth: 4,
    lensShape: 'circle',
  };
  const before = structuredClone(input);
  const plan = planReviewProjectConversion(input);
  if (plan.status !== 'prepared') throw new Error(JSON.stringify(plan));
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(plan.project)));
  expect(isExportReadyVideoProject(reopened)).toBe(true);
  expect(
    reopened.motionRegions?.some(
      (region) =>
        region.spotlight?.effect === 'magnify' &&
        region.spotlight.lensOptics === 'optical' &&
        region.spotlight.lensEdgeWidth === 4 &&
        region.spotlight.lensShape === 'circle' &&
        region.focusMode === VideoMotionFocusMode.CURSOR
    )
  ).toBe(true);
  const frame = resolveVideoCompositionFrame(reopened, 2);
  expect(frame.sceneSpotlights?.some((state) => state.spotlight.effect === 'magnify')).toBe(true);
  expect(frame.sceneSpotlights?.some((state) => state.lensFocus !== undefined)).toBe(true);
  expect(input).toEqual(before);
});

it.each([
  ...[true, false].flatMap((anchor) =>
    [false, true].map((follow) => [anchor, follow, false] as const)
  ),
  [true, true, true] as const,
])(
  'converts and reopens Gallery framing with sourceAnchor=%s follow=%s cropExcursion=%s',
  (anchor, follow, cropExcursion) => {
    const input = motionFixture(anchor, follow);
    if (cropExcursion)
      input.seed.cursorTrack!.samples = input.seed.cursorTrack!.samples.map((sample, index) => {
        const x = [0.02, 0.95, 0.3, 0.9][index]!;
        return { ...sample, x: x * 640, recordingPoint: { x, y: 0.53 } };
      });
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.project.version).toBe(34);
    expect(isExportReadyVideoProject(result.project)).toBe(true);
    const project = hydrateVideoProject(JSON.parse(JSON.stringify(result.project)));
    const raw = input.document.advancedContent.zoom.regions[0]!;
    for (const region of project.motionRegions!) {
      expect(region.zoomInDuration).toBe(5);
      expect(region.zoomOutDuration).toBe(5);
      expect(region.perspective).toEqual(raw.perspective);
      expect(region.depthOfField).toEqual(raw.depthOfField);
      expect(region.motionBlur).toEqual(raw.motionBlur);
    }
    const scene = {
      source: input.source,
      output: { width: project.width, height: project.height },
      ...(input.document.advancedContent.canvas
        ? { canvas: input.document.advancedContent.canvas }
        : {}),
      background: input.document.advancedContent.background,
    };
    const map = buildReviewTimeMap(8, input.document.edits);
    const facts = { cursorTrack: input.seed.cursorTrack, actionEvents: [], signals: [] };
    const path = { ...deriveReviewCursorFocusPath(facts, input.source), mode: 'follow' as const };
    const gallery = projectReviewFocus([raw], map).map((region) =>
      follow
        ? {
            ...region,
            cursorFocus: {
              scene,
              path,
              observed: deriveReviewCursorFocusPath(facts, input.source, true),
              timeMap: map,
            },
          }
        : region
    );
    for (const time of [0.125, 1.25, 1.75, 2.5, 5.75]) {
      const expected = computeQuickEditWindowTransform(
        computeQuickEditSceneLayout({
          ...scene,
          camera: evaluateQuickEditCameraAtTime(gallery, time, scene),
        })
      );
      const clip = project.clips.find(
        (item) =>
          item.type === 'VIDEO' && item.startTime <= time && item.startTime + item.duration > time
      )!;
      if (clip.type !== 'VIDEO') throw new Error('Expected video');
      const window = getFittedMediaWindowFrame({
        frame: clip.transform,
        fitMode: clip.fitMode,
        sourceWidth: input.source.width,
        sourceHeight: input.source.height,
        ...(clip.sourceCrop ? { sourceCrop: clip.sourceCrop } : {}),
      });
      const actual = resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
      const point = mapCompositionPointThroughCamera(window, actual)!;
      expect(point.x, `left at ${time}`).toBeCloseTo(expected.x, 6);
      expect(point.y, `top at ${time}`).toBeCloseTo(expected.y, 6);
      expect(actual.scale).toBeCloseTo(expected.width / window.width, 8);
    }
    expect(input).toEqual(before);
  }
);

it.each(['basic', 'advanced'] as const)(
  'retains disabled authoring without activating zoom in %s',
  (mode) => {
    const input = motionFixture();
    input.ui.mode = mode;
    if (mode === 'basic') {
      delete input.document.advancedContent.canvas;
      input.document.advancedContent.background = { enabled: false, zoomBehavior: 'window' };
    }
    input.document.advancedContent.zoom.enabled = false;
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.project.utilityLanes?.camera.visible).toBe(false);
    expect(result.project.motionRegions!.length).toBeGreaterThan(0);
    expect(
      resolveVideoCompositionCamera({
        project: result.project,
        currentTime: 1,
        actions: [],
        cursorSample: null,
      }).scale
    ).toBe(1);
  }
);

it('keeps a fully cut source interval editable instead of dropping it', () => {
  const input = motionFixture();
  const raw = input.document.advancedContent.zoom.regions[0]!;
  raw.sourceAnchor = { start: 3.2, end: 3.8 };
  raw.start = 3.2;
  raw.end = 3.8;
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.motionRegions).toHaveLength(1);
  expect(result.project.motionRegions![0]).toMatchObject({
    duration: 0,
    sourceBinding: { sourceStart: 3.2, sourceEnd: 3.8 },
  });
  expect(
    isExportReadyVideoProject(hydrateVideoProject(JSON.parse(JSON.stringify(result.project))))
  ).toBe(true);
});

it.each(
  [true, false].flatMap((anchor) => [false, true].map((follow) => [anchor, follow] as const))
)(
  'converts linked windows across cuts and rates with sourceAnchor=%s follow=%s',
  (anchor, follow) => {
    const input = motionFixture(anchor, follow);
    const first = input.document.advancedContent.zoom.regions[0]!;
    first.start = 0;
    first.end = 1;
    if (anchor) first.sourceAnchor = { start: 0, end: 1 };
    first.enter = { type: 'linear', duration: 0.25 };
    first.exit = { type: 'ease-in-out', duration: 0.25 };
    first.linkTo = 'next';
    first.linkEasing = 'ease-in-out';
    const second = {
      ...first,
      id: 'next',
      start: anchor ? 5 : 3.5,
      end: anchor ? 7 : 5.5,
      transform: { scale: 1.5, centerX: 0.65, centerY: 0.4 },
      ...(anchor ? { sourceAnchor: { start: 5, end: 7 } } : {}),
    };
    delete second.linkTo;
    delete second.linkEasing;
    input.document.advancedContent.zoom.regions.push(second);
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    const project = hydrateVideoProject(JSON.parse(JSON.stringify(result.project)));
    expect(isExportReadyVideoProject(project)).toBe(true);
    const raw = input.document.advancedContent.zoom.regions;
    const scene = {
      source: input.source,
      output: { width: project.width, height: project.height },
      canvas: input.document.advancedContent.canvas!,
      background: input.document.advancedContent.background,
    };
    const map = buildReviewTimeMap(8, input.document.edits);
    const facts = { cursorTrack: input.seed.cursorTrack, actionEvents: [], signals: [] };
    const path = { ...deriveReviewCursorFocusPath(facts, input.source), mode: 'follow' as const };
    const gallery = projectReviewFocus(raw, map).map((region) =>
      follow
        ? {
            ...region,
            cursorFocus: {
              scene,
              path,
              observed: deriveReviewCursorFocusPath(facts, input.source, true),
              timeMap: map,
            },
          }
        : region
    );
    for (const time of [0.125, 0.875, 1, 1.25, 1.75, 2, 2.5, 2.999, 3.25, 3.5, 4.25, 4.75]) {
      const clip = project.clips.find(
        (item) =>
          item.type === 'VIDEO' && item.startTime <= time && item.startTime + item.duration > time
      )!;
      if (clip.type !== 'VIDEO') throw new Error('Expected video');
      const window = getFittedMediaWindowFrame({
        frame: clip.transform,
        fitMode: clip.fitMode,
        sourceWidth: input.source.width,
        sourceHeight: input.source.height,
        ...(clip.sourceCrop ? { sourceCrop: clip.sourceCrop } : {}),
      });
      const actual = resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
      const expected = computeQuickEditWindowTransform(
        computeQuickEditSceneLayout({
          ...scene,
          camera: evaluateQuickEditCameraAtTime(gallery, time, scene),
        })
      );
      const point = mapCompositionPointThroughCamera(window, actual)!;
      expect(point.x, `left at ${time}`).toBeCloseTo(expected.x, 6);
      expect(point.y, `top at ${time}`).toBeCloseTo(expected.y, 6);
      expect(actual.scale).toBeCloseTo(expected.width / window.width, 8);
    }
    if (follow) {
      const gap = {
        start: gallery.find((region) => region.id === 'focus')!.end,
        end: gallery.find((region) => region.id === 'next')!.start,
      };
      const expected = resolveReviewCameraConflicts(gallery, scene, gap)
        .filter(
          (conflict) => conflict.interval.start === gap.start && conflict.interval.end === gap.end
        )
        .map((conflict) => conflict.reason)
        .sort();
      const actual = resolveProjectCameraConflicts(project, undefined, gap)
        .filter(
          (conflict) => conflict.interval.start === gap.start && conflict.interval.end === gap.end
        )
        .map((conflict) => conflict.reason)
        .sort();
      expect(actual).toEqual(expected);
    }
    expect(
      project.motionRegions!.some((region) => region.incomingConnection?.easing === 'EASE_IN_OUT')
    ).toBe(true);
    expect(input).toEqual(before);
  }
);

it.each(
  [true, false].flatMap((anchored) =>
    (['camera', 'border', 'spotlight', 'lens'] as const).map((kind) => [anchored, kind] as const)
  )
)(
  'retains dormant sourceAnchor=%s %s without activating it after conversion and reopen',
  (anchored, kind) => {
    const input = motionFixture(anchored);
    const raw = input.document.advancedContent.zoom.regions[0]!;
    raw.dormant = true;
    if (kind === 'border') raw.border = createQuickEditBorder();
    if (kind === 'spotlight') raw.spotlight = createQuickEditSpotlight();
    if (kind === 'lens')
      raw.spotlight = {
        ...createQuickEditSpotlight(),
        effect: 'magnify',
        magnification: 2.5,
        lensOptics: 'optical',
      };
    const before = structuredClone(input);
    const plan = planReviewProjectConversion(input);
    if (plan.status !== 'prepared') throw new Error(JSON.stringify(plan));
    const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(plan.project)));
    expect(isExportReadyVideoProject(reopened)).toBe(true);
    expect(reopened.motionRegions!.length).toBeGreaterThan(0);
    for (const region of reopened.motionRegions!) {
      expect(region.duration).toBe(0);
      expect(region.sourceBinding?.dormant).toBe(true);
      if (anchored) expect(region.sourceBinding).toMatchObject({ sourceStart: 0, sourceEnd: 7 });
      else {
        const binding = region.sourceBinding!;
        const clip = reopened.clips.find((clip) => clip.id === binding.clipId)!;
        if (clip.type !== 'VIDEO') throw new Error('Missing legacy target');
        expect(binding.animation.duration).toBe(raw.end - raw.start);
        expect(
          clip.startTime +
            (binding.sourceStart - clip.sourceStart) / (clip.playbackRate ?? 1) -
            binding.animation.start
        ).toBeCloseTo(raw.start, 7);
      }
      expect(region.phaseTransitions).toEqual({ enter: raw.enter.type, exit: raw.exit.type });
      if (kind === 'border') expect(region.border).toEqual(raw.border);
      if (kind === 'spotlight' || kind === 'lens') expect(region.spotlight).toEqual(raw.spotlight);
    }
    for (const time of [0, 0.5, 2, 4]) {
      const frame = resolveVideoCompositionFrame(reopened, time);
      expect(frame.camera.scale).toBe(1);
      expect(frame.sceneSpotlights ?? []).toEqual([]);
      expect(
        frame.visualLayers.some(
          (layer) => layer.kind === 'video' && (layer.borders?.length || layer.spotlights?.length)
        )
      ).toBe(false);
    }
    expect(input).toEqual(before);
  }
);

it('retains legacy result-only focus beyond the visible result without publishing active motion', () => {
  const input = motionFixture(false);
  const raw = input.document.advancedContent.zoom.regions[0]!;
  raw.start = 20;
  raw.end = 21;
  const before = structuredClone(input);
  const plan = planReviewProjectConversion(input);
  if (plan.status !== 'prepared') throw new Error(JSON.stringify(plan));
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(plan.project)));
  const region = reopened.motionRegions![0]!;
  expect(isExportReadyVideoProject(reopened)).toBe(true);
  expect(region.duration).toBe(0);
  expect(region.sourceBinding!.animation).toEqual({ start: 0, end: 1, duration: 1 });
  expect(region.zoomInDuration).toBe(raw.enter.duration);
  expect(region.zoomOutDuration).toBe(raw.exit.duration);
  const clip = reopened.clips.find((clip) => clip.id === region.sourceBinding!.clipId)!;
  if (clip.type !== 'VIDEO') throw new Error('Missing bound video');
  expect(
    clip.startTime +
      (region.sourceBinding!.sourceStart - clip.sourceStart) / (clip.playbackRate ?? 1)
  ).toBe(raw.start);
  expect(input).toEqual(before);
});

import { createQuickEditBorder, createQuickEditSpotlight } from '../project/scene/focus-appearance';
import { resolveVideoCompositionFrame } from '../composition/timeline/frame';

it.each(['source', 'target'] as const)(
  'preserves a link with dormant %s without activating its gap',
  (inactive) => {
    const input = motionFixture();
    const source = input.document.advancedContent.zoom.regions[0]!;
    source.start = 0;
    source.end = 1;
    source.sourceAnchor = { start: 0, end: 1 };
    source.enter = { type: 'linear', duration: 0.1 };
    source.exit = { type: 'linear', duration: 0.1 };
    source.linkTo = 'target';
    source.linkEasing = 'linear';
    source.dormant = inactive === 'source';
    const target = {
      ...structuredClone(source),
      id: 'target',
      start: 5,
      end: 7,
      sourceAnchor: { start: 5, end: 7 },
      dormant: inactive === 'target',
    };
    delete target.linkTo;
    delete target.linkEasing;
    input.document.advancedContent.zoom.regions.push(target);
    const before = structuredClone(input);
    const plan = planReviewProjectConversion(input);
    if (plan.status !== 'prepared') throw new Error(JSON.stringify(plan));
    const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(plan.project)));
    const destination = reopened.motionRegions!.find((region) =>
      region.id.includes(':motion:target:')
    )!;
    const retainedSource = reopened.motionRegions!.find(
      (region) => region.id === destination.incomingConnection?.fromRegionId
    )!;
    expect(destination.incomingConnection?.easing).toBe('LINEAR');
    expect(retainedSource).toBeDefined();
    expect((inactive === 'source' ? retainedSource : destination).sourceBinding?.dormant).toBe(
      true
    );
    expect((inactive === 'source' ? retainedSource : destination).duration).toBe(0);
    expect(resolveMotionConnectionSource(reopened, destination)).toBeNull();
    expect(resolveVideoCompositionFrame(reopened, 1.2).camera.scale).toBe(1);
    expect(input).toEqual(before);
  }
);

import { resolveMotionConnectionSource } from '../project/motion';

it.each(['linear', 'ease-in-out'] as const)(
  'retains unlinked Gallery %s preference without creating a connection',
  (linkEasing) => {
    const input = motionFixture();
    input.document.advancedContent.zoom.regions[0]!.linkEasing = linkEasing;
    const before = structuredClone(input);
    const plan = planReviewProjectConversion(input);
    if (plan.status !== 'prepared') throw new Error(JSON.stringify(plan));
    const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(plan.project)));
    for (const region of reopened.motionRegions!) {
      expect(region.phaseTransitions?.link).toBe(
        linkEasing === 'linear' ? 'LINEAR' : 'EASE_IN_OUT'
      );
      expect(region.incomingConnection).toBeUndefined();
      expect(region.phaseTransitions?.enter).toBe('linear');
      expect(region.phaseTransitions?.exit).toBe('ease-in-out');
    }
    expect(input).toEqual(before);
  }
);

it('retains an absent Gallery target as passive provenance through reopen', () => {
  const input = motionFixture();
  const raw = input.document.advancedContent.zoom.regions[0]!;
  raw.linkTo = 'deleted-target';
  raw.linkEasing = 'linear';
  const before = structuredClone(input);
  const plan = planReviewProjectConversion(input);
  if (plan.status !== 'prepared') throw new Error(JSON.stringify(plan));
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(plan.project)));
  for (const region of reopened.motionRegions!) {
    expect(region.sourceBinding?.unresolvedLinkTo).toBe('deleted-target');
    expect(region.phaseTransitions?.link).toBe('LINEAR');
    expect(region.incomingConnection).toBeUndefined();
    expect(resolveMotionConnectionSource(reopened, region)).toBeNull();
  }
  expect(input).toEqual(before);
});

it('keeps a touching Gallery edge passive without suppressing the next camera entrance', () => {
  const input = motionFixture();
  const first = input.document.advancedContent.zoom.regions[0]!;
  first.start = 0;
  first.end = 1;
  first.sourceAnchor = { start: 0, end: 1 };
  first.linkTo = 'touching';
  first.linkEasing = 'linear';
  const next = {
    ...structuredClone(first),
    id: 'touching',
    start: 1,
    end: 2,
    sourceAnchor: { start: 1, end: 2 },
  };
  delete next.linkTo;
  delete next.linkEasing;
  input.document.advancedContent.zoom.regions.push(next);
  const before = structuredClone(input);
  const plan = planReviewProjectConversion(input);
  if (plan.status !== 'prepared') throw new Error(JSON.stringify(plan));
  const source = plan.project.motionRegions!.find((region) =>
    region.id.includes(':motion:focus:')
  )!;
  expect(source.sourceBinding?.unresolvedLinkTo).toBe('touching');
  expect(source.phaseTransitions?.link).toBe('LINEAR');
  expect(plan.project.motionRegions!.some((region) => region.incomingConnection)).toBe(false);
  expect(resolveVideoCompositionFrame(plan.project, 1).camera.scale).toBe(1);
  expect(input).toEqual(before);
});

it.each(
  (['window', 'content', 'fixed', 'follow-video'] as const).flatMap((zoomBehavior) =>
    (['basic', 'advanced'] as const).map((mode) => ({ zoomBehavior, mode }))
  )
)('transfers authored background camera mode $zoomBehavior in $mode', ({ zoomBehavior, mode }) => {
  const input = motionFixture();
  input.ui.mode = mode;
  input.document.advancedContent.background = {
    ...input.document.advancedContent.background,
    zoomBehavior,
  };
  const before = structuredClone(input);
  const converted = planReviewProjectConversion(input);
  expect(converted.status).toBe('prepared');
  if (converted.status !== 'prepared') throw new Error(JSON.stringify(converted));
  expect(converted.project.motionRegions?.length).toBeGreaterThan(0);
  const saved = JSON.parse(JSON.stringify(converted.project));
  expect(isExportReadyVideoProject(saved)).toBe(true);
  expect(hydrateVideoProject(saved).motionRegions).toMatchObject(converted.project.motionRegions!);
  expect(input).toEqual(before);
});

it.each([
  { origin: 'bottom-left' as const },
  { reveal: 'draw-both' as const },
  { exitReveal: 'erase-both' as const },
])('transfers extended border %j through schema 48 and reopen', (settings) => {
  const input = motionFixture();
  const source = input.document.advancedContent.zoom.regions[0]!;
  source.border = { ...createQuickEditBorder(), ...settings };
  const before = structuredClone(input);
  const plan = planReviewProjectConversion(input);
  if (plan.status !== 'prepared') throw new Error(JSON.stringify(plan));
  expect(plan.project.version).toBe(48);
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(plan.project)));
  expect(isExportReadyVideoProject(reopened)).toBe(true);
  expect(reopened.motionRegions![0]!.border).toEqual(source.border);
  expect(isHydratableVideoProject({ ...reopened, version: 47 })).toBe(false);
  expect(input).toEqual(before);
});
