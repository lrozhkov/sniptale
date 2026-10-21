import { expect, it } from 'vitest';
import {
  createQuickEditWatermark,
  getVideoProjectWatermarkAsset,
} from '../project/scene/watermark';
import type { VideoProjectAsset } from '../project/types/model';
import { hydrateVideoProject } from '../project/hydration';
import { isExportReadyVideoProject } from '../project/validation/root';
import { planReviewProjectConversion } from './project-conversion';
import { planReviewProjectScene } from './project-scene';
import { fixture } from './project-conversion.test-support';

function image(reference: string, id: string, width = 80, height = 40) {
  const asset: VideoProjectAsset = {
    id,
    name: `${id}.png`,
    type: 'IMAGE',
    createdAt: 1,
    source: { kind: 'project-asset', projectAssetId: reference.slice('project-asset:'.length) },
    metadata: {
      width,
      height,
      duration: null,
      mimeType: 'image/png',
      size: 100,
      hasAudio: false,
      audioPeaks: null,
    },
  };
  return { reviewAssetId: reference, asset };
}

function imagesFixture() {
  const input = fixture();
  input.document.advancedContent.background = {
    enabled: true,
    type: 'image',
    assetId: 'project-asset:background-bytes',
    imageFit: 'contain',
    zoomBehavior: 'window',
    layout: {
      padding: 20,
      cornerRadius: 12,
      blur: 4,
      shadow: { intensity: 30, color: '#00000080' },
    },
  };
  const watermark = createQuickEditWatermark('Authored logo');
  input.document.advancedContent.watermark = {
    ...watermark,
    mode: 'image',
    layout: 'tiled',
    image: { assetId: 'project-asset:logo-bytes', width: 40, height: 20, size: 0.24, opacity: 0.7 },
    placement: { anchor: 'top-left', margin: 0.04, position: { x: 0.3, y: 0.7 } },
    tile: { spacing: 0.15, rotation: -25 },
  };
  return {
    ...input,
    imageAssets: [
      image('project-asset:background-bytes', 'native-background'),
      image('project-asset:logo-bytes', 'native-logo', 40, 20),
    ],
  };
}

function scene(input: ReturnType<typeof imagesFixture>) {
  return planReviewProjectScene({
    content: input.document.advancedContent,
    ui: input.ui,
    source: input.source,
    imageAssets: input.imageAssets,
  });
}

it('converts active image background and tiled watermark into independent declared Native materials', () => {
  const input = imagesFixture();
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.sceneBackground).toEqual({
    kind: 'image',
    assetId: 'native-background',
    imageFit: 'contain',
    blur: 4,
  });
  expect(result.project.watermark).toEqual({
    ...input.document.advancedContent.watermark,
    image: {
      ...input.document.advancedContent.watermark!.image,
      assetId: 'project-asset:native-logo',
    },
  });
  expect(getVideoProjectWatermarkAsset(result.project)).toEqual(input.imageAssets[1]!.asset);
  expect(result.project.assets.slice(input.seed.assets.length)).toEqual(
    input.imageAssets.map((entry) => entry.asset)
  );
  expect(isExportReadyVideoProject(result.project)).toBe(true);
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(result.project)));
  expect(reopened.watermark).toEqual(result.project.watermark);
  expect(reopened.sceneBackground).toEqual(result.project.sceneBackground);
  expect(reopened.assets).toEqual(result.project.assets);
  expect(input).toEqual(before);
});

it.each(['text', 'none'] as const)(
  'retains inactive image resources while watermark %s stays selected',
  (mode) => {
    const input = imagesFixture();
    input.document.advancedContent.background = {
      enabled: false,
      rememberedImage: { assetId: 'project-asset:background-bytes', imageFit: 'cover' },
      rememberedPaint: { kind: 'solid', color: '#123456aa' },
    };
    input.document.advancedContent.watermark!.mode = mode;
    input.document.advancedContent.watermark!.text = {
      ...input.document.advancedContent.watermark!.text,
      value: 'Keep authored text',
      font: 'serif',
      weight: 'bold',
      strike: true,
      italic: true,
    };
    const result = planReviewProjectConversion(input);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(result.project.sceneBackground).toEqual({
      kind: 'solid',
      color: '#00000000',
      remembered: {
        solid: { kind: 'solid', color: '#123456aa' },
        image: { kind: 'image', assetId: 'native-background', imageFit: 'cover' },
      },
    });
    expect(result.project.watermark).toEqual({
      ...input.document.advancedContent.watermark,
      image: {
        ...input.document.advancedContent.watermark!.image,
        assetId: 'project-asset:native-logo',
      },
    });
    expect(getVideoProjectWatermarkAsset(result.project)).toEqual(input.imageAssets[1]!.asset);
    expect(isExportReadyVideoProject(result.project)).toBe(true);
  }
);

it('retains an inactive image watermark in basic mode without activating it', () => {
  const input = imagesFixture();
  input.ui.mode = 'basic';
  input.document.advancedContent.background = { enabled: false };
  input.document.advancedContent.watermark!.mode = 'none';
  input.imageAssets.splice(0, 1);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.watermark?.mode).toBe('none');
  expect(getVideoProjectWatermarkAsset(result.project)?.id).toBe('native-logo');
});

it('declares a shared background and watermark resource only once', () => {
  const input = imagesFixture();
  input.document.advancedContent.background = {
    enabled: true,
    type: 'image',
    assetId: 'project-asset:logo-bytes',
    imageFit: 'cover',
    layout: { padding: 10, cornerRadius: 2 },
  };
  input.imageAssets.splice(0, 1);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.assets.slice(input.seed.assets.length)).toEqual([
    input.imageAssets[0]!.asset,
  ]);
  expect(result.project.sceneBackground).toMatchObject({
    kind: 'image',
    assetId: 'native-logo',
  });
  expect(getVideoProjectWatermarkAsset(result.project)?.id).toBe('native-logo');
});

it.each([
  'missing',
  'wrong-type',
  'duplicate-ref',
  'duplicate-id',
  'extra',
  'wrong-source',
  'dimensions',
  'watermark-dimensions',
] as const)('refuses %s image resources without changing source data', (variant) => {
  const input = imagesFixture();
  if (variant === 'missing') input.imageAssets.pop();
  if (variant === 'wrong-type') input.imageAssets[0]!.asset.type = 'VIDEO';
  if (variant === 'duplicate-ref') input.imageAssets.push(structuredClone(input.imageAssets[0]!));
  if (variant === 'duplicate-id') input.imageAssets[0]!.asset.id = input.imageAssets[1]!.asset.id;
  if (variant === 'extra') input.imageAssets.push(image('project-asset:unused', 'unused'));
  if (variant === 'wrong-source')
    input.imageAssets[0]!.asset.source = {
      kind: 'project-asset',
      projectAssetId: 'different-bytes',
    };
  if (variant === 'dimensions') input.imageAssets[0]!.asset.metadata.width = 0;
  if (variant === 'watermark-dimensions') input.imageAssets[1]!.asset.metadata.height = 21;
  const before = structuredClone(input);
  expect(scene(input)).toEqual({ status: 'blocked', fields: ['scene-assets'] });
  expect(planReviewProjectConversion(input).status).toBe('blocked');
  expect(input).toEqual(before);
});

it.each(['text', 'image'] as const)(
  'refuses suppressed authored %s watermark rather than enabling it',
  (mode) => {
    const input = imagesFixture();
    input.ui.mode = 'basic';
    input.document.advancedContent.background = { enabled: false };
    input.document.advancedContent.watermark!.mode = mode;
    input.imageAssets.splice(0, 1);
    const before = structuredClone(input);
    expect(scene(input)).toEqual({ status: 'blocked', fields: ['watermark'] });
    expect(input).toEqual(before);
  }
);

it('refuses a scene material identity that already belongs to the seed', () => {
  const input = imagesFixture();
  input.imageAssets[0]!.asset.id = input.seed.assets[0]!.id;
  const before = structuredClone(input);
  expect(planReviewProjectConversion(input).status).toBe('blocked');
  expect(input).toEqual(before);
});

it('maps text watermark settings without acquiring image materials', () => {
  const input = fixture();
  input.document.advancedContent.watermark = {
    ...createQuickEditWatermark('Text only'),
    mode: 'text',
  };
  const before = structuredClone(input);
  const result = planReviewProjectConversion(input);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  expect(result.project.watermark).toEqual(input.document.advancedContent.watermark);
  expect(result.project.assets).toEqual(input.seed.assets);
  expect(input).toEqual(before);
});
