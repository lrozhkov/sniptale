import { expect, it } from 'vitest';
import { createGradientPaint } from '@sniptale/foundation/paint';
import {
  getFittedMediaContentFrame,
  getFittedMediaWindowFrame,
} from '../composition/draw/fitted-media';
import { hydrateVideoProject } from '../project/hydration';
import { isExportReadyVideoProject } from '../project/validation/root';
import { computeQuickEditSceneLayout, computeQuickEditSceneSize } from './advanced/scene';
import { fitQuickEditSourceCrop } from './advanced/canvas';
import { planReviewProjectConversion } from './project-conversion';
import { fixture } from './project-conversion.test-support';

function styledFixture() {
  const input = fixture();
  input.document.advancedContent.canvas = {
    width: 320,
    height: 360,
    crop: { x: 0.1, y: 0.1, width: 0.7, height: 0.8 },
  };
  input.document.advancedContent.windowHeader = {
    kind: 'browser',
    style: 'windows',
    theme: 'light',
    title: 'Authored title',
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
      cornerRadius: 18,
      blur: 3,
      shadow: { intensity: 35.5, color: '#090a0bcc' },
    },
  };
  return input;
}

it('keeps the Gallery decorated scene through cuts speed and Native reopen', () => {
  const input = styledFixture();
  input.document.edits.push({
    id: 'speed',
    kind: 'speed',
    start: 4,
    end: 6,
    requestedStart: 4,
    requestedEnd: 6,
    rate: 2,
    audio: 'speed',
  });
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const content = input.document.advancedContent;
  const scene = {
    source: input.source,
    canvas: content.canvas,
    windowHeader: content.windowHeader,
    background: content.background,
  };
  const output = computeQuickEditSceneSize(scene);
  const gallery = computeQuickEditSceneLayout({
    ...scene,
    output,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  });
  expect(result.project.width).toBe(output.width);
  expect(result.project.height).toBe(output.height);
  expect(result.project.sceneBackground).toEqual({ kind: 'solid', color: '#123456ff', blur: 3 });
  for (const clip of result.project.clips) {
    if (clip.type !== 'VIDEO') continue;
    expect(clip.sourceCrop).toEqual(
      fitQuickEditSourceCrop(input.source, content.canvas!, content.canvas!.crop)
    );
    expect(clip.windowHeader).toEqual(content.windowHeader);
    expect(clip.windowCornerRadius).toBe(18);
    expect(clip.shadowIntensity).toBe(35.5);
    expect(clip.shadowColor).toBe('#090a0bcc');
    const mapping = {
      sourceWidth: input.source.width,
      sourceHeight: input.source.height,
      frame: clip.transform,
      ...(clip.sourceCrop ? { sourceCrop: clip.sourceCrop } : {}),
      ...(clip.windowHeader ? { windowHeader: clip.windowHeader } : {}),
      fitMode: clip.fitMode,
    };
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(getFittedMediaWindowFrame(mapping)[key]).toBeCloseTo(gallery.windowRect[key], 7);
      expect(getFittedMediaContentFrame(mapping)[key]).toBeCloseTo(gallery.videoRect[key], 7);
    }
  }
  expect(isExportReadyVideoProject(result.project)).toBe(true);
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(result.project)));
  expect(reopened.clips.map((clip) => ({ ...clip, timelineLaneId: undefined }))).toEqual(
    result.project.clips.map((clip) => ({ ...clip, timelineLaneId: undefined }))
  );
  expect(reopened.sceneBackground).toEqual(result.project.sceneBackground);
  expect(input).toEqual(before);
});

it('retains gradient paint and remembered solid paint in existing scene variants', () => {
  const input = styledFixture();
  let stop = 0;
  const gradient = createGradientPaint('#123456ff', () => `stop-${stop++}`, 'linear');
  if (gradient.kind !== 'gradient') throw new Error('Expected gradient');
  input.document.advancedContent.background = {
    enabled: true,
    type: 'gradient',
    gradient: gradient.gradient,
    rememberedPaint: { kind: 'solid', color: '#abcdef22' },
    layout: { padding: 20, cornerRadius: 15 },
  };
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.sceneBackground).toEqual({
    kind: 'gradient',
    gradient: gradient.gradient,
    remembered: { solid: { kind: 'solid', color: '#abcdef22' } },
  });
});

it.each(['basic', 'disabled-layout', 'image', 'remembered-image'] as const)(
  'refuses unsupported %s scene data without mutating the source',
  (variant) => {
    const input = styledFixture();
    if (variant === 'basic') input.ui.mode = 'basic';
    if (variant === 'disabled-layout')
      input.document.advancedContent.background = {
        enabled: false,
        rememberedLayout: { padding: 17, cornerRadius: 18 },
      };
    if (variant === 'image')
      input.document.advancedContent.background = {
        enabled: true,
        type: 'image',
        assetId: 'project-asset:image',
        imageFit: 'cover',
        layout: { padding: 10, cornerRadius: 2 },
      };
    if (variant === 'remembered-image')
      input.document.advancedContent.background.rememberedImage = {
        assetId: 'project-asset:image',
        imageFit: 'contain',
      };
    const before = structuredClone(input);
    const result = planReviewProjectConversion(input);
    expect(result.status).toBe('blocked');
    expect(input).toEqual(before);
  }
);

it.each([false, true])(
  'accepts empty zoom enabled=%s without inventing a Native motion region',
  (enabled) => {
    const input = styledFixture();
    input.document.advancedContent.zoom = { enabled, regions: [] };
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.project.motionRegions ?? []).toEqual([]);
  }
);
