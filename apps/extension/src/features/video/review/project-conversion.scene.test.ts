import { createQuickEditWatermark } from '../project/scene/watermark';
import { updateQuickEditBackground } from './advanced/background';
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

it.each(['image', 'remembered-image'] as const)(
  'refuses unsupported %s scene data without mutating the source',
  (variant) => {
    const input = styledFixture();
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

it('keeps a basic Gallery window header dormant through independent conversion and reopen', () => {
  const input = fixture();
  input.ui.mode = 'basic';
  const header = {
    kind: 'browser' as const,
    style: 'macos' as const,
    theme: 'dark' as const,
    title: 'Сохранённое окно',
    url: 'https://example.test/retained',
    faviconEnabled: false,
  };
  input.document.advancedContent.windowHeader = header;
  input.document.advancedContent.zoom.regions = [
    {
      id: 'retained-basic-focus',
      start: 0,
      end: 2,
      sourceAnchor: { start: 0, end: 2 },
      transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'linear', duration: 0.2 },
      exit: { type: 'linear', duration: 0.2 },
    },
  ];
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const restored = hydrateVideoProject(JSON.parse(JSON.stringify(result.project)));
  expect(restored.version).toBe(36);
  expect(restored.utilityLanes?.camera?.visible).toBe(false);
  expect(restored.motionRegions?.length).toBeGreaterThan(0);
  expect(isExportReadyVideoProject(restored)).toBe(true);
  for (const clip of restored.clips) {
    if (clip.type !== 'VIDEO') continue;
    expect(clip).not.toHaveProperty('windowHeader');
    expect(clip).toMatchObject({ rememberedWindowHeader: header });
    expect(clip.transform).toMatchObject({
      x: 0,
      y: 0,
      width: input.source.width,
      height: input.source.height,
    });
  }
  expect(input).toEqual(before);
});

it('retains a basic-mode canvas and crop without changing the visible source', () => {
  const input = styledFixture();
  input.ui.mode = 'basic';
  input.document.advancedContent.background = { enabled: false };
  delete input.document.advancedContent.windowHeader;
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const project = hydrateVideoProject(JSON.parse(JSON.stringify(result.project)));
  expect(project).toMatchObject({
    version: 36,
    width: input.source.width,
    height: input.source.height,
    rememberedCanvas: { width: 320, height: 360 },
  });
  const crop = fitQuickEditSourceCrop(
    input.source,
    input.document.advancedContent.canvas!,
    input.document.advancedContent.canvas!.crop
  );
  for (const clip of project.clips) {
    if (clip.type !== 'VIDEO') continue;
    expect(clip).not.toHaveProperty('sourceCrop');
    expect(clip).toMatchObject({
      rememberedSourceCrop: crop,
      transform: { x: 0, y: 0, width: input.source.width, height: input.source.height },
    });
  }
  expect(isExportReadyVideoProject(project)).toBe(true);
  expect(isExportReadyVideoProject({ ...project, version: 34 })).toBe(false);
  expect(
    isExportReadyVideoProject({ ...project, rememberedCanvas: { width: -1, height: 360 } })
  ).toBe(false);
  expect(input).toEqual(before);
});

it('transfers basic scene appearance without enabling paint, watermark or window styling', () => {
  const input = styledFixture();
  input.ui.mode = 'basic';
  const watermark = { ...createQuickEditWatermark('Retained mark'), mode: 'text' as const };
  input.document.advancedContent.watermark = watermark;
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project).toMatchObject({
    version: 36,
    width: input.source.width,
    height: input.source.height,
    sceneBackground: { kind: 'solid', color: '#123456ff', blur: 3, enabled: false },
    watermark,
    watermarkEnabled: false,
  });
  for (const clip of result.project.clips) {
    if (clip.type !== 'VIDEO') continue;
    expect(clip).toMatchObject({
      rememberedWindowLayout: {
        padding: 17.25,
        windowCornerRadius: 18,
        shadowIntensity: 35.5,
        shadowColor: '#090a0bcc',
        shadowMode: 'BACKDROP',
      },
      transform: { x: 0, y: 0, width: input.source.width, height: input.source.height },
    });
    expect(clip).not.toHaveProperty('windowCornerRadius');
    expect(clip.shadowIntensity ?? 0).toBe(0);
  }
  expect(isExportReadyVideoProject(result.project)).toBe(true);
  expect(hydrateVideoProject(JSON.parse(JSON.stringify(result.project)))).toMatchObject({
    watermark,
    watermarkEnabled: false,
  });
  expect(isExportReadyVideoProject({ ...result.project, version: 35 })).toBe(false);
  expect(input).toEqual(before);
});

it('retains an explicitly disabled background layout and paint without suppressing unrelated advanced settings', () => {
  const input = styledFixture();
  input.document.advancedContent.background = updateQuickEditBackground(
    input.document.advancedContent.background,
    { enabled: false }
  );
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.sceneBackground).toMatchObject({
    enabled: false,
    kind: 'solid',
    color: '#123456ff',
    blur: 3,
  });
  for (const clip of result.project.clips) {
    if (clip.type !== 'VIDEO') continue;
    expect(clip).toMatchObject({
      rememberedWindowLayout: { padding: 17.25, windowCornerRadius: 18 },
      windowHeader: input.document.advancedContent.windowHeader,
    });
    expect(clip).not.toHaveProperty('windowCornerRadius');
  }
});

it('keeps a distinct passive layout without replacing the active layout blur or clip style', () => {
  const input = styledFixture();
  input.document.advancedContent.background.rememberedLayout = {
    padding: 7,
    cornerRadius: 8,
    blur: 9,
  };
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.sceneBackground).toMatchObject({ blur: 3, rememberedBlur: 9 });
  for (const clip of result.project.clips) {
    if (clip.type !== 'VIDEO') continue;
    expect(clip).toMatchObject({
      windowCornerRadius: 18,
      rememberedWindowLayout: { padding: 7, windowCornerRadius: 8 },
    });
  }
});
