// policyStateIds: [] - canvas binary field names are an immutable persisted-data validation
// allowlist; per-document sets are operation-local indexes and grant no authority.
import {
  isBoolean,
  isNumber,
  isRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';
import type {
  PersistedEditorAssetPointer,
  PersistedEditorDocumentAsset,
  PersistedEditorDocumentV3,
} from './contracts';
import {
  isEditorRichShapeDocumentObjectArray,
  normalizeEditorDocumentRichShapes,
} from '../../../features/editor/document/rich-shape';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { MAX_EDITOR_BACKGROUND_BLUR_AMOUNT } from '../../../features/editor/document/constants';

const CANVAS_BINARY_FIELDS = new Set([
  'src',
  'sniptaleBackgroundImageData',
  'sniptaleBlurSourceData',
]);
const ASSET_URL_PREFIX = 'sniptale-asset:';

function parsePointer(value: unknown): PersistedEditorAssetPointer | null {
  return isRecord(value) && isString(value['assetId']) && value['assetId'].length > 0
    ? { assetId: value['assetId'] }
    : null;
}

function parseOptionalStringArray(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) && value.every(isString) ? [...value] : null;
}

function parseGradientColorStops(
  value: unknown
): PersistedEditorDocumentV3['frame']['backgroundGradientColorStops'] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const stops = [];
  for (const stop of value) {
    if (
      !isRecord(stop) ||
      !isString(stop['color']) ||
      !isNumber(stop['offset']) ||
      (stop['opacity'] !== undefined && !isNumber(stop['opacity']))
    ) {
      return null;
    }
    stops.push({
      color: stop['color'],
      offset: stop['offset'],
      ...(stop['opacity'] === undefined ? {} : { opacity: stop['opacity'] }),
    });
  }
  return stops;
}

function parseEditorImageSettings(
  value: unknown
): NonNullable<PersistedEditorDocumentV3['frame']['sourceImage']> | null | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !(value['borderPresetId'] === null || isString(value['borderPresetId'])) ||
    !isNumber(value['opacity']) ||
    !isNumber(value['radius']) ||
    !isNumber(value['shadow']) ||
    !isString(value['strokeColor']) ||
    !isNumber(value['strokeOpacity']) ||
    !(
      value['strokeStyle'] === 'solid' ||
      value['strokeStyle'] === 'dashed' ||
      value['strokeStyle'] === 'dotted' ||
      value['strokeStyle'] === 'dash' ||
      value['strokeStyle'] === 'dot' ||
      value['strokeStyle'] === 'dash-dot' ||
      value['strokeStyle'] === 'long-dash'
    ) ||
    !isNumber(value['strokeWidth']) ||
    (value['shadowAngle'] !== undefined && !isNumber(value['shadowAngle'])) ||
    (value['shadowBlur'] !== undefined && !isNumber(value['shadowBlur'])) ||
    (value['shadowColor'] !== undefined && !isString(value['shadowColor'])) ||
    (value['shadowDistance'] !== undefined && !isNumber(value['shadowDistance']))
  ) {
    return null;
  }
  return {
    borderPresetId: value['borderPresetId'],
    opacity: value['opacity'],
    radius: value['radius'],
    shadow: value['shadow'],
    ...(value['shadowAngle'] === undefined ? {} : { shadowAngle: value['shadowAngle'] }),
    ...(value['shadowBlur'] === undefined ? {} : { shadowBlur: value['shadowBlur'] }),
    ...(value['shadowColor'] === undefined ? {} : { shadowColor: value['shadowColor'] }),
    ...(value['shadowDistance'] === undefined ? {} : { shadowDistance: value['shadowDistance'] }),
    strokeColor: value['strokeColor'],
    strokeOpacity: value['strokeOpacity'],
    strokeStyle: value['strokeStyle'],
    strokeWidth: value['strokeWidth'],
  };
}

function parseFrame(value: unknown): PersistedEditorDocumentV3['frame'] | null {
  if (!isRecord(value)) return null;
  const backgroundImage =
    value['backgroundImage'] === null ? null : parsePointer(value['backgroundImage']);
  const gradientStops = parseOptionalStringArray(value['backgroundGradientStops']);
  const gradientColorStops = parseGradientColorStops(value['backgroundGradientColorStops']);
  const sourceImage = parseEditorImageSettings(value['sourceImage']);
  const backgroundBlurAmount =
    value['backgroundBlurAmount'] === undefined
      ? DEFAULT_EDITOR_FRAME_SETTINGS.backgroundBlurAmount
      : isNumber(value['backgroundBlurAmount']) &&
          value['backgroundBlurAmount'] >= 0 &&
          value['backgroundBlurAmount'] <= MAX_EDITOR_BACKGROUND_BLUR_AMOUNT
        ? value['backgroundBlurAmount']
        : null;
  if (
    (backgroundImage === null && value['backgroundImage'] !== null) ||
    gradientStops === null ||
    gradientColorStops === null ||
    sourceImage === null ||
    !isBoolean(value['browserMode']) ||
    !isNumber(value['paddingTop']) ||
    !isNumber(value['paddingRight']) ||
    !isNumber(value['paddingBottom']) ||
    !isNumber(value['paddingLeft']) ||
    !(
      value['backgroundMode'] === 'color' ||
      value['backgroundMode'] === 'gradient' ||
      value['backgroundMode'] === 'image'
    ) ||
    backgroundBlurAmount === null ||
    !isString(value['backgroundColor']) ||
    !isString(value['backgroundGradientFrom']) ||
    !isString(value['backgroundGradientTo']) ||
    !isNumber(value['backgroundGradientAngle']) ||
    !(
      value['backgroundImageFit'] === 'cover' ||
      value['backgroundImageFit'] === 'contain' ||
      value['backgroundImageFit'] === 'stretch' ||
      value['backgroundImageFit'] === 'tile' ||
      value['backgroundImageFit'] === 'fit-width' ||
      value['backgroundImageFit'] === 'fit-height'
    ) ||
    !(value['layoutMode'] === 'expand-canvas' || value['layoutMode'] === 'fit-image') ||
    !isString(value['browserTitle']) ||
    !isString(value['browserUrl'])
  ) {
    return null;
  }
  return {
    browserMode: value['browserMode'],
    paddingTop: value['paddingTop'],
    paddingRight: value['paddingRight'],
    paddingBottom: value['paddingBottom'],
    paddingLeft: value['paddingLeft'],
    backgroundMode: value['backgroundMode'],
    backgroundBlurAmount,
    backgroundColor: value['backgroundColor'],
    backgroundGradientFrom: value['backgroundGradientFrom'],
    backgroundGradientTo: value['backgroundGradientTo'],
    ...(gradientStops === undefined ? {} : { backgroundGradientStops: gradientStops }),
    ...(gradientColorStops === undefined
      ? {}
      : { backgroundGradientColorStops: gradientColorStops }),
    backgroundGradientAngle: value['backgroundGradientAngle'],
    backgroundImage,
    backgroundImageFit: value['backgroundImageFit'],
    ...(sourceImage === undefined ? {} : { sourceImage }),
    layoutMode: value['layoutMode'],
    browserTitle: value['browserTitle'],
    browserUrl: value['browserUrl'],
  };
}

function parseBrowserFrame(
  value: unknown
): PersistedEditorDocumentV3['browserFrame'] | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const favicon = value['favicon'] === null ? null : parsePointer(value['favicon']);
  if (
    (favicon === null && value['favicon'] !== null) ||
    !isString(value['title']) ||
    !isString(value['url']) ||
    !(value['canvasMode'] === 'resize' || value['canvasMode'] === 'keep-size') ||
    !(value['contentMode'] === 'push-down' || value['contentMode'] === 'fit-content') ||
    (value['enabled'] !== undefined && !isBoolean(value['enabled'])) ||
    (value['appearance'] !== undefined &&
      value['appearance'] !== 'header' &&
      value['appearance'] !== 'window')
  ) {
    return null;
  }
  return {
    ...(value['enabled'] === undefined ? {} : { enabled: value['enabled'] }),
    ...(value['appearance'] === undefined ? {} : { appearance: value['appearance'] }),
    title: value['title'],
    url: value['url'],
    favicon,
    canvasMode: value['canvasMode'],
    contentMode: value['contentMode'],
  };
}

function parseAssets(value: unknown): PersistedEditorDocumentAsset[] | null {
  if (!Array.isArray(value)) return null;
  const assets: PersistedEditorDocumentAsset[] = [];
  const seenRoles = new Set<string>();
  for (const raw of value) {
    const pointer = parsePointer(raw);
    if (
      !pointer ||
      !isRecord(raw) ||
      !isString(raw['role']) ||
      raw['role'].length === 0 ||
      seenRoles.has(raw['role'])
    ) {
      return null;
    }
    seenRoles.add(raw['role']);
    assets.push({ assetId: pointer.assetId, role: raw['role'] });
  }
  return assets;
}

function containsEmbeddedBinary(value: unknown): boolean {
  if (typeof value === 'string') return value.startsWith('data:') || value.startsWith('blob:');
  if (Array.isArray(value)) return value.some(containsEmbeddedBinary);
  return isRecord(value) && Object.values(value).some(containsEmbeddedBinary);
}

function hasValidCanvasAssetUrls(value: unknown, declaredIds: ReadonlySet<string>): boolean {
  if (Array.isArray(value))
    return value.every((child) => hasValidCanvasAssetUrls(child, declaredIds));
  if (!isRecord(value)) return true;
  for (const [key, child] of Object.entries(value)) {
    if (CANVAS_BINARY_FIELDS.has(key) && typeof child === 'string') {
      if (
        !child.startsWith(ASSET_URL_PREFIX) ||
        !declaredIds.has(child.slice(ASSET_URL_PREFIX.length))
      ) {
        return false;
      }
    }
    if (!hasValidCanvasAssetUrls(child, declaredIds)) return false;
  }
  return true;
}

export function parsePersistedEditorDocument(value: unknown): PersistedEditorDocumentV3 | null {
  if (!isRecord(value) || value['version'] !== 3) return null;
  const sourceImage = parsePointer(value['sourceImage']);
  const frame = parseFrame(value['frame']);
  const browserFrame = parseBrowserFrame(value['browserFrame']);
  const assets = parseAssets(value['assets']);
  if (!sourceImage || !frame || browserFrame === null || !assets) return null;
  const declaredIds = new Set(assets.map((asset) => asset.assetId));
  if (!declaredIds.has(sourceImage.assetId)) return null;
  if (frame.backgroundImage && !declaredIds.has(frame.backgroundImage.assetId)) return null;
  if (browserFrame?.favicon && !declaredIds.has(browserFrame.favicon.assetId)) return null;
  if (!isString(value['canvasJson'])) return null;
  let canvas: unknown;
  try {
    canvas = JSON.parse(value['canvasJson']);
    if (containsEmbeddedBinary(canvas) || !hasValidCanvasAssetUrls(canvas, declaredIds))
      return null;
  } catch {
    return null;
  }
  if (containsEmbeddedBinary(value)) return null;
  if (
    !(value['sourceName'] === null || isString(value['sourceName'])) ||
    !isNumber(value['sourceWidth']) ||
    !isNumber(value['sourceHeight']) ||
    !isNumber(value['canvasWidth']) ||
    !isNumber(value['canvasHeight']) ||
    !isNumber(value['sourceLeft']) ||
    !isNumber(value['sourceTop']) ||
    !isNumber(value['sourceDisplayWidth']) ||
    !isNumber(value['sourceDisplayHeight'])
  ) {
    return null;
  }
  const richShapes =
    value['richShapes'] === undefined
      ? undefined
      : isEditorRichShapeDocumentObjectArray(value['richShapes'])
        ? normalizeEditorDocumentRichShapes(value['richShapes'])
        : null;
  if (richShapes === null) return null;

  return {
    version: 3,
    sourceImage: { assetId: sourceImage.assetId },
    sourceName: value['sourceName'],
    sourceWidth: value['sourceWidth'],
    sourceHeight: value['sourceHeight'],
    canvasWidth: value['canvasWidth'],
    canvasHeight: value['canvasHeight'],
    sourceLeft: value['sourceLeft'],
    sourceTop: value['sourceTop'],
    sourceDisplayWidth: value['sourceDisplayWidth'],
    sourceDisplayHeight: value['sourceDisplayHeight'],
    frame,
    ...(browserFrame === undefined ? {} : { browserFrame }),
    canvasJson: value['canvasJson'],
    ...(richShapes === undefined ? {} : { richShapes }),
    assets,
  };
}
