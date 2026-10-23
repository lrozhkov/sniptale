// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { fixture } from './project-conversion.test-support';
import { planReviewProjectConversion } from './project-conversion';
import { projectReviewFocus } from './focus-edits';
import { buildReviewTimeMap } from './timeline';
import { createQuickEditBorder, createQuickEditSpotlight } from '../project/scene/focus-appearance';
import { hydrateVideoProject } from '../project/hydration';
import { isExportReadyVideoProject } from '../project/validation/root';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSourceWindowTransform,
} from './advanced/scene';
import { evaluateQuickEditBordersAtTime } from './advanced/border';
import { evaluateQuickEditSpotlightsAtTime } from './advanced/focus';
import { resolveVideoCompositionFrame } from '../composition/timeline/frame';
import { sampleSceneBorder } from '../composition/scene-border';
import { resolveCompositionSceneSpotlights } from '../composition/draw/project-spotlight';
import { windowHeaderImageKey } from '../composition/draw/window-header';
import { getFittedMediaOriginalWindowFrame } from '../composition/draw/fitted-media';

it.each(
  [true, false].flatMap((anchor) =>
    (['border', 'spotlight'] as const).map((kind) => [anchor, kind] as const)
  )
)(
  'retains %s source anchor and %s geometry through crop, header, cuts, rates and reopen',
  (anchor, kind) => {
    const { input, border, spotlight } = appearanceFixture(anchor, kind);
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    const project = hydrateVideoProject(JSON.parse(JSON.stringify(result.project)));
    expect(isExportReadyVideoProject(project)).toBe(true);
    for (const region of project.motionRegions!) {
      expect(region[kind]).toEqual(kind === 'border' ? border : spotlight);
      expect(region.sourceBinding?.coordinateSpace).toBe('source-window');
    }
    const images: Record<string, HTMLImageElement> = {};
    for (const clip of project.clips)
      if (clip.type === 'VIDEO' && clip.windowHeader) {
        const image = document.createElement('img');
        Object.defineProperties(image, {
          complete: { value: true },
          naturalWidth: { value: 640 },
          naturalHeight: { value: 40 },
        });
        images[windowHeaderImageKey(clip.id, clip.windowHeader)] = image;
      }
    const scene = {
      source: input.source,
      output: { width: project.width, height: project.height },
      canvas: input.document.advancedContent.canvas!,
      windowHeader: input.document.advancedContent.windowHeader!,
      background: input.document.advancedContent.background,
    };
    const layout = computeQuickEditSceneLayout({
      ...scene,
      camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
    });
    const original = computeQuickEditSourceWindowTransform(layout);
    const regions = projectReviewFocus(
      input.document.advancedContent.zoom.regions,
      buildReviewTimeMap(8, input.document.edits)
    );
    for (const time of [0, 0.125, 0.5, 1, 1.75, 2, 2.125, 3.5, 4.75, 5, 5.75]) {
      const frame = resolveVideoCompositionFrame(project, time);
      expect(frame.camera.scale).toBe(1);
      if (kind === 'border') {
        const layer = frame.visualLayers.find((item) => item.kind === 'video')!;
        if (layer.kind !== 'video') throw new Error('Expected video');
        const metadata = project.assets.find((asset) => asset.id === layer.clip.assetId)!.metadata;
        const window = getFittedMediaOriginalWindowFrame({
          frame: layer.clip.transform,
          fitMode: layer.clip.fitMode,
          sourceWidth: metadata.width,
          sourceHeight: metadata.height,
          ...(layer.clip.sourceCrop ? { sourceCrop: layer.clip.sourceCrop } : {}),
          ...(layer.clip.windowHeader ? { windowHeader: layer.clip.windowHeader } : {}),
        });
        expect(window.x).toBeCloseTo(original.x, 7);
        expect(window.y).toBeCloseTo(original.y, 7);
        const actual = (layer.borders ?? []).flatMap((state) => {
          expect(state.coordinateSpace).toBe('source-window');
          return sampleSceneBorder({ ...state, window, scale: 1 });
        });
        const expected = evaluateQuickEditBordersAtTime({
          regions,
          time,
          output: scene.output,
          video: original,
          scale: 1,
        });
        expect(actual).toHaveLength(expected.length);
        for (const [index, sample] of actual.entries()) {
          const reference = expected[index]!;
          const numbers = (path: string) =>
            path
              .split(/[^0-9eE.+-]+/)
              .filter(Boolean)
              .map(Number);
          expect(numbers(sample.path)).toHaveLength(numbers(reference.path).length);
          numbers(sample.path).forEach((value, position) =>
            expect(value).toBeCloseTo(numbers(reference.path)[position]!, 7)
          );
          for (const key of ['perimeter', 'width', 'start', 'end', 'opacity'] as const)
            expect(sample[key], `${key} at ${time}`).toBeCloseTo(reference[key], 7);
          expect(sample.dashOffset ?? 0).toBeCloseTo(reference.dashOffset ?? 0, 7);
        }
      } else {
        const actual = resolveCompositionSceneSpotlights({
          project,
          frame,
          images,
          viewport: { x: 0, y: 0, ...scene.output },
          composition: { x: 0, y: 0, scale: 1 },
          transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        });
        const expected = evaluateQuickEditSpotlightsAtTime({
          regions,
          time,
          output: scene.output,
          video: original,
          scale: 1,
        });
        expect(actual).toHaveLength(expected.length);
        for (const [index, sample] of actual.entries()) {
          const reference = expected[index]!;
          for (const key of ['x', 'y', 'width', 'height'] as const)
            expect(sample.opening[key], `${key} at ${time}`).toBeCloseTo(reference.opening[key], 7);
          for (const key of ['radius', 'dim', 'blur'] as const)
            expect(sample[key], `${key} at ${time}`).toBeCloseTo(reference[key], 7);
          expect(sample.presence).toBeCloseTo(reference.presence!, 7);
          expect(sample.openingClipProgress).toBeCloseTo(reference.openingClipProgress!, 7);
        }
      }
    }
    expect(input).toEqual(before);
  }
);

function appearanceFixture(anchor: boolean, kind: 'border' | 'spotlight') {
  const input = fixture();
  input.ui.tracks.zoom = true;
  input.document.edits.push({
    id: 'rate',
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
  input.document.advancedContent.windowHeader = {
    kind: 'browser',
    style: 'windows',
    theme: 'light',
    title: 'Source window',
    url: 'https://example.com',
    faviconEnabled: false,
  };
  input.document.advancedContent.background = {
    enabled: true,
    type: 'solid',
    color: '#123456ff',
    zoomBehavior: 'window',
    layout: {
      padding: 17.25,
      cornerRadius: 12,
      blur: 0,
      shadow: { intensity: 0, color: '#000000ff' },
    },
  };
  const area = { x: 0.15, y: 0.1, width: 0.7, height: 0.6 };
  const border = {
    ...createQuickEditBorder(),
    area,
    width: 7,
    style: 'dashed' as const,
    loop: true,
    motion: 'clockwise' as const,
    reveal: 'draw' as const,
    exitReveal: 'erase' as const,
    period: 1.25,
  };
  const spotlight = {
    ...createQuickEditSpotlight(),
    area,
    effect: 'blur' as const,
    blur: 18,
    reveal: 'contract' as const,
    exitReveal: 'fade' as const,
  };
  input.document.advancedContent.zoom = {
    enabled: true,
    regions: [
      {
        id: 'appearance',
        start: 0,
        end: 5,
        ...(anchor ? { sourceAnchor: { start: 0, end: 7 } } : {}),
        transform: { scale: 1.8, centerX: 0.35, centerY: 0.6 },
        enter: { type: 'linear', duration: 0.75 },
        exit: { type: 'ease-in-out', duration: 0.75 },
        ...(kind === 'border' ? { border } : { spotlight }),
      },
    ],
  };
  return { input, border, spotlight };
}

it.each(['linear', 'ease-in-out'] as const)(
  'preserves linked spotlight morphs across clip and rate boundaries with %s',
  (easing) => {
    const { input, spotlight } = appearanceFixture(true, 'spotlight');
    input.document.edits.push({
      id: 'gap-rate',
      kind: 'speed',
      start: 5,
      end: 6,
      requestedStart: 5,
      requestedEnd: 6,
      rate: 2,
      audio: 'speed',
    });
    const source = input.document.advancedContent.zoom.regions[0]!;
    source.start = 4;
    source.end = 5;
    source.sourceAnchor = { start: 4, end: 5 };
    source.linkTo = 'to';
    source.linkEasing = easing;
    source.enter.duration = 0.25;
    source.exit.duration = 0.25;
    const target = {
      ...source,
      id: 'to',
      start: 6,
      end: 7,
      sourceAnchor: { start: 6, end: 7 },
      spotlight: {
        ...spotlight,
        effect: 'dim' as const,
        strength: 0.7,
        area: { x: 0.5, y: 0.4, width: 0.3, height: 0.3 },
      },
    };
    delete target.linkTo;
    delete target.linkEasing;
    input.document.advancedContent.zoom.regions.push(target);
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    const project = hydrateVideoProject(JSON.parse(JSON.stringify(result.project)));
    const images: Record<string, HTMLImageElement> = {};
    for (const clip of project.clips)
      if (clip.type === 'VIDEO' && clip.windowHeader) {
        const image = document.createElement('img');
        Object.defineProperties(image, {
          complete: { value: true },
          naturalWidth: { value: 640 },
          naturalHeight: { value: 40 },
        });
        images[windowHeaderImageKey(clip.id, clip.windowHeader)] = image;
      }
    const output = { width: project.width, height: project.height };
    const layout = computeQuickEditSceneLayout({
      source: input.source,
      output,
      canvas: input.document.advancedContent.canvas!,
      windowHeader: input.document.advancedContent.windowHeader!,
      background: input.document.advancedContent.background,
      camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
    });
    const original = computeQuickEditSourceWindowTransform(layout);
    const regions = projectReviewFocus(
      input.document.advancedContent.zoom.regions,
      buildReviewTimeMap(8, input.document.edits)
    );
    for (const time of [2.125, 2.875, 3, 3.125, 3.25, 3.499, 3.5, 3.625, 4.375]) {
      const frame = resolveVideoCompositionFrame(project, time);
      const actual = resolveCompositionSceneSpotlights({
        project,
        frame,
        images,
        viewport: { x: 0, y: 0, ...output },
        composition: { x: 0, y: 0, scale: 1 },
        transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      });
      const expected = evaluateQuickEditSpotlightsAtTime({
        regions,
        time,
        output,
        video: original,
        scale: 1,
      });
      expect(actual, `at ${time}`).toHaveLength(1);
      expect(expected).toHaveLength(1);
      for (const key of ['x', 'y', 'width', 'height'] as const)
        expect(actual[0]!.opening[key], `${key} at ${time}`).toBeCloseTo(
          expected[0]!.opening[key],
          7
        );
      for (const key of ['radius', 'dim', 'blur'] as const)
        expect(actual[0]![key], `${key} at ${time}`).toBeCloseTo(expected[0]![key], 7);
      expect(actual[0]!.presence).toBeCloseTo(expected[0]!.presence!, 7);
      expect(actual[0]!.openingClipProgress).toBeCloseTo(expected[0]!.openingClipProgress!, 7);
    }
    expect(input).toEqual(before);
  }
);
