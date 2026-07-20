import type { EffectV1Asset, EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

import { isImageBitmap } from '../../../contracts/effect-runtime/bitmap-lifetime';
import { hasExactKeys, isRecord } from '../../../contracts/effect-runtime/identity';
import type { EffectRuntimeWorkerAsset } from '../../../contracts/effect-runtime/types';
import { assertEffectDecodedRaster } from '../resource-policy';
import { parseSerializedSvgVector } from '../svg/vector-payload';

const IMAGE_ASSET_KEYS = [
  'bitmap',
  'cacheKey',
  'height',
  'id',
  'kind',
  'mimeType',
  'width',
] as const;
const SVG_ASSET_KEYS = [
  'cacheKey',
  'height',
  'id',
  'kind',
  'mimeType',
  'svgVector',
  'width',
] as const;

export function parseWorkerAssets(
  value: unknown,
  document: EffectV1Document
): Record<string, EffectRuntimeWorkerAsset> | null {
  if (!isRecord(value)) return null;
  const expected = document.assets.filter((asset) => asset.kind !== 'audio');
  if (
    !hasExactKeys(
      value,
      expected.map(({ id }) => id)
    )
  )
    return null;
  const assets: Record<string, EffectRuntimeWorkerAsset> = {};
  for (const declaration of expected) {
    const asset = parseAsset(value[declaration.id], declaration);
    if (!asset) return null;
    assets[declaration.id] = asset;
  }
  return assets;
}

function parseAsset(value: unknown, declaration: EffectV1Asset): EffectRuntimeWorkerAsset | null {
  if (
    !isRecord(value) ||
    value['id'] !== declaration.id ||
    typeof declaration.sha256 !== 'string' ||
    value['cacheKey'] !== declaration.sha256 ||
    value['mimeType'] !== declaration.mimeType ||
    value['kind'] !== declaration.kind
  ) {
    return null;
  }
  const cacheKey = declaration.sha256;
  if (declaration.kind === 'image') return parseImageAsset(value, declaration, cacheKey);
  return declaration.kind === 'svg' ? parseSvgAsset(value, declaration, cacheKey) : null;
}

function parseImageAsset(
  value: Record<string, unknown>,
  declaration: EffectV1Asset,
  cacheKey: string
): EffectRuntimeWorkerAsset | null {
  if (
    !hasExactKeys(value, IMAGE_ASSET_KEYS) ||
    !isImageBitmap(value['bitmap']) ||
    value['width'] !== value['bitmap'].width ||
    value['height'] !== value['bitmap'].height
  ) {
    return null;
  }
  try {
    assertEffectDecodedRaster(value['width'], value['height']);
  } catch {
    return null;
  }
  return {
    bitmap: value['bitmap'],
    cacheKey,
    height: value['bitmap'].height,
    id: declaration.id,
    kind: 'image',
    mimeType: declaration.mimeType,
    width: value['bitmap'].width,
  };
}

function parseSvgAsset(
  value: Record<string, unknown>,
  declaration: EffectV1Asset,
  cacheKey: string
): EffectRuntimeWorkerAsset | null {
  if (!hasExactKeys(value, SVG_ASSET_KEYS) || value['mimeType'] !== 'image/svg+xml') return null;
  const vector = parseSerializedSvgVector(value['svgVector']);
  if (!vector || value['width'] !== vector.width || value['height'] !== vector.height) return null;
  return {
    cacheKey,
    height: vector.height,
    id: declaration.id,
    kind: 'svg',
    mimeType: 'image/svg+xml',
    svgVector: vector,
    width: vector.width,
  };
}
