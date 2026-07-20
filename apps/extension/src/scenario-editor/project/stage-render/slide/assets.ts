import type {
  ScenarioElementFrame,
  ScenarioImageElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioSlideRenderAsset, ScenarioSlideRenderAssetMap } from './types';

function readAsset(
  assets: ScenarioSlideRenderAssetMap | undefined,
  assetId: string
): ScenarioSlideRenderAsset | null {
  if (!assetId || !assets) {
    return null;
  }

  if (assets instanceof Map) {
    const assetMap = assets as ReadonlyMap<string, ScenarioSlideRenderAsset>;
    return assetMap.get(assetId) ?? null;
  }

  const assetRecord = assets as Readonly<Record<string, ScenarioSlideRenderAsset>>;
  return assetRecord[assetId] ?? null;
}

function getBaseContentSize(
  frame: ScenarioElementFrame,
  image: ScenarioImageElement,
  asset: ScenarioSlideRenderAsset | null
): Pick<ScenarioElementFrame, 'height' | 'width'> {
  const naturalWidth = asset?.width && asset.width > 0 ? asset.width : frame.width;
  const naturalHeight = asset?.height && asset.height > 0 ? asset.height : frame.height;
  const containScale = Math.min(frame.width / naturalWidth, frame.height / naturalHeight);
  const coverScale = Math.max(frame.width / naturalWidth, frame.height / naturalHeight);

  if (image.fit === 'fill') {
    return { height: frame.height, width: frame.width };
  }
  if (image.fit === 'cover') {
    return { height: naturalHeight * coverScale, width: naturalWidth * coverScale };
  }
  if (image.fit === 'original') {
    return { height: naturalHeight, width: naturalWidth };
  }

  return { height: naturalHeight * containScale, width: naturalWidth * containScale };
}

export function resolveSlideImageAsset(
  image: ScenarioImageElement,
  assets: ScenarioSlideRenderAssetMap | undefined
): ScenarioSlideRenderAsset | null {
  return readAsset(assets, image.assetRef.assetId);
}

export function computeImageContentBox(
  frame: ScenarioElementFrame,
  image: ScenarioImageElement,
  asset: ScenarioSlideRenderAsset | null
): ScenarioElementFrame {
  const baseSize = getBaseContentSize(frame, image, asset);
  const scale = image.contentTransform.scale || 1;
  const width = baseSize.width * scale;
  const height = baseSize.height * scale;

  return {
    height,
    width,
    x: frame.x + frame.width / 2 - width / 2 + image.contentTransform.x,
    y: frame.y + frame.height / 2 - height / 2 + image.contentTransform.y,
  };
}
