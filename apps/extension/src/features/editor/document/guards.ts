import type { EditorDocument } from './types';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import {
  isNullable,
  isNumber,
  isRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';
import { isEditorRichShapeDocumentObjectArray } from './rich-shape';
import { MAX_EDITOR_BACKGROUND_BLUR_AMOUNT } from './constants';

const isNullableString = isNullable(isString);
const BACKGROUND_IMAGE_FITS = new Set([
  'cover',
  'contain',
  'stretch',
  'tile',
  'fit-width',
  'fit-height',
]);
function isOptionalBackgroundBlurAmount(value: unknown): boolean {
  return (
    value === undefined ||
    (isNumber(value) && value >= 0 && value <= MAX_EDITOR_BACKGROUND_BLUR_AMOUNT)
  );
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isString));
}

function isOptionalGradientColorStopArray(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (stop) =>
          isRecord(stop) &&
          isString(stop['color']) &&
          isNumber(stop['offset']) &&
          (stop['opacity'] === undefined || isNumber(stop['opacity']))
      ))
  );
}

function isOptionalEditorImageSettings(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      (value['borderPresetId'] === null || isString(value['borderPresetId'])) &&
      isNumber(value['opacity']) &&
      isNumber(value['radius']) &&
      isNumber(value['shadow']) &&
      isString(value['strokeColor']) &&
      isNumber(value['strokeOpacity']) &&
      (value['strokeStyle'] === 'solid' ||
        value['strokeStyle'] === 'dashed' ||
        value['strokeStyle'] === 'dotted' ||
        value['strokeStyle'] === 'dash' ||
        value['strokeStyle'] === 'dot' ||
        value['strokeStyle'] === 'dash-dot' ||
        value['strokeStyle'] === 'long-dash') &&
      isNumber(value['strokeWidth']) &&
      (value['shadowAngle'] === undefined || isNumber(value['shadowAngle'])) &&
      (value['shadowBlur'] === undefined || isNumber(value['shadowBlur'])) &&
      (value['shadowColor'] === undefined || isString(value['shadowColor'])) &&
      (value['shadowDistance'] === undefined || isNumber(value['shadowDistance'])))
  );
}

function isEditorFrameSettings(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['browserMode'] === 'boolean' &&
    isNumber(value['paddingTop']) &&
    isNumber(value['paddingRight']) &&
    isNumber(value['paddingBottom']) &&
    isNumber(value['paddingLeft']) &&
    (value['backgroundMode'] === 'color' ||
      value['backgroundMode'] === 'gradient' ||
      value['backgroundMode'] === 'image') &&
    isOptionalBackgroundBlurAmount(value['backgroundBlurAmount']) &&
    isString(value['backgroundColor']) &&
    isString(value['backgroundGradientFrom']) &&
    isString(value['backgroundGradientTo']) &&
    isOptionalStringArray(value['backgroundGradientStops']) &&
    isOptionalGradientColorStopArray(value['backgroundGradientColorStops']) &&
    isNumber(value['backgroundGradientAngle']) &&
    isNullableString(value['backgroundImageData']) &&
    isString(value['backgroundImageFit']) &&
    BACKGROUND_IMAGE_FITS.has(value['backgroundImageFit']) &&
    isOptionalEditorImageSettings(value['sourceImage']) &&
    (value['layoutMode'] === 'expand-canvas' || value['layoutMode'] === 'fit-image') &&
    isString(value['browserTitle']) &&
    isString(value['browserUrl'])
  );
}

function isBrowserFrameState(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['enabled'] === undefined || typeof value['enabled'] === 'boolean') &&
    (value['appearance'] === undefined ||
      value['appearance'] === 'header' ||
      value['appearance'] === 'window') &&
    isString(value['title']) &&
    isString(value['url']) &&
    (value['faviconDataUrl'] === undefined || isNullableString(value['faviconDataUrl'])) &&
    (value['canvasMode'] === 'resize' || value['canvasMode'] === 'keep-size') &&
    (value['contentMode'] === 'push-down' || value['contentMode'] === 'fit-content')
  );
}

export function isEditorDocument(value: unknown): value is EditorDocument {
  return (
    isRecord(value) &&
    value['version'] === 2 &&
    isImageDataUrl(value['sourceImageData']) &&
    isNullableString(value['sourceName']) &&
    isNumber(value['sourceWidth']) &&
    isNumber(value['sourceHeight']) &&
    isNumber(value['canvasWidth']) &&
    isNumber(value['canvasHeight']) &&
    isNumber(value['sourceLeft']) &&
    isNumber(value['sourceTop']) &&
    isNumber(value['sourceDisplayWidth']) &&
    isNumber(value['sourceDisplayHeight']) &&
    isEditorFrameSettings(value['frame']) &&
    (value['browserFrame'] === undefined || isBrowserFrameState(value['browserFrame'])) &&
    isString(value['canvasJson']) &&
    (value['richShapes'] === undefined || isEditorRichShapeDocumentObjectArray(value['richShapes']))
  );
}
