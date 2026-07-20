import type { EditorSceneBackgroundSettings } from '../../../features/editor/document/presets';
import { normalizeEditorFrameGradientStops } from '../../../features/editor/document/frame-gradient';
import { normalizeEditorImageSettings } from '../../../features/editor/document/constants';
import { isNumber, isRecord, isString } from '../infrastructure/guards/primitives';
import { DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS } from './scene-defaults';

function hasValidScenePadding(value: Record<string, unknown>) {
  return (
    (value['paddingTop'] === undefined || isNumber(value['paddingTop'])) &&
    (value['paddingRight'] === undefined || isNumber(value['paddingRight'])) &&
    (value['paddingBottom'] === undefined || isNumber(value['paddingBottom'])) &&
    (value['paddingLeft'] === undefined || isNumber(value['paddingLeft']))
  );
}

function hasValidSceneBackgroundMode(value: Record<string, unknown>) {
  return (
    value['backgroundMode'] === 'color' ||
    value['backgroundMode'] === 'gradient' ||
    value['backgroundMode'] === 'image'
  );
}

function hasValidSceneBackgroundImage(value: Record<string, unknown>) {
  return (
    (value['backgroundImageData'] === undefined ||
      value['backgroundImageData'] === null ||
      isString(value['backgroundImageData'])) &&
    (value['backgroundImageFit'] === undefined ||
      value['backgroundImageFit'] === 'cover' ||
      value['backgroundImageFit'] === 'contain' ||
      value['backgroundImageFit'] === 'stretch' ||
      value['backgroundImageFit'] === 'tile' ||
      value['backgroundImageFit'] === 'fit-width' ||
      value['backgroundImageFit'] === 'fit-height')
  );
}

function hasValidSceneGradientStops(value: Record<string, unknown>) {
  const stops = value['backgroundGradientStops'];

  return stops === undefined || (Array.isArray(stops) && stops.every(isString));
}

function hasValidSceneLayoutMode(value: Record<string, unknown>) {
  return (
    value['layoutMode'] === undefined ||
    value['layoutMode'] === 'expand-canvas' ||
    value['layoutMode'] === 'fit-image'
  );
}

function resolveScenePadding(value: Record<string, unknown>) {
  const paddingTop = value['paddingTop'];
  const paddingRight = value['paddingRight'];
  const paddingBottom = value['paddingBottom'];
  const paddingLeft = value['paddingLeft'];

  return {
    paddingTop:
      typeof paddingTop === 'number'
        ? paddingTop
        : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.paddingTop,
    paddingRight:
      typeof paddingRight === 'number'
        ? paddingRight
        : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.paddingRight,
    paddingBottom:
      typeof paddingBottom === 'number'
        ? paddingBottom
        : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.paddingBottom,
    paddingLeft:
      typeof paddingLeft === 'number'
        ? paddingLeft
        : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.paddingLeft,
  };
}

function resolveSceneBackgroundVisuals(value: Record<string, unknown>) {
  const layoutMode = value['layoutMode'];

  return {
    ...resolveSceneColorAndGradient(value),
    ...resolveSceneBackgroundImage(value),
    layoutMode:
      layoutMode === 'fit-image' || layoutMode === 'expand-canvas'
        ? layoutMode
        : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.layoutMode,
  };
}

function resolveSceneColorAndGradient(value: Record<string, unknown>) {
  const backgroundGradientFrom = value['backgroundGradientFrom'];
  const backgroundGradientTo = value['backgroundGradientTo'];
  const fallbackGradientFrom =
    typeof backgroundGradientFrom === 'string'
      ? backgroundGradientFrom
      : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.backgroundGradientFrom;
  const fallbackGradientTo =
    typeof backgroundGradientTo === 'string'
      ? backgroundGradientTo
      : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.backgroundGradientTo;
  const normalizedGradientStops = normalizeEditorFrameGradientStops({
    backgroundGradientFrom: fallbackGradientFrom,
    backgroundGradientTo: fallbackGradientTo,
    backgroundGradientStops: Array.isArray(value['backgroundGradientStops'])
      ? value['backgroundGradientStops']
      : undefined,
  });

  return {
    backgroundMode: resolveSceneBackgroundMode(value['backgroundMode']),
    backgroundColor:
      typeof value['backgroundColor'] === 'string'
        ? value['backgroundColor']
        : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.backgroundColor,
    backgroundGradientFrom: normalizedGradientStops[0] ?? fallbackGradientFrom,
    backgroundGradientTo: normalizedGradientStops.at(-1) ?? fallbackGradientTo,
    backgroundGradientStops: normalizedGradientStops,
    backgroundGradientAngle:
      typeof value['backgroundGradientAngle'] === 'number'
        ? value['backgroundGradientAngle']
        : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.backgroundGradientAngle,
  };
}

function resolveSceneBackgroundMode(value: unknown) {
  return value === 'color' || value === 'gradient' || value === 'image'
    ? value
    : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.backgroundMode;
}

function resolveSceneBackgroundImage(value: Record<string, unknown>) {
  const backgroundImageData = value['backgroundImageData'];
  return {
    backgroundImageData:
      typeof backgroundImageData === 'string' || backgroundImageData === null
        ? backgroundImageData
        : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.backgroundImageData,
    backgroundImageFit: resolveSceneBackgroundImageFit(value['backgroundImageFit']),
  };
}

function resolveSceneBackgroundImageFit(value: unknown) {
  return value === 'cover' ||
    value === 'contain' ||
    value === 'stretch' ||
    value === 'tile' ||
    value === 'fit-width' ||
    value === 'fit-height'
    ? value
    : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.backgroundImageFit;
}

function buildSceneBackgroundSettings(
  value: Record<string, unknown>
): EditorSceneBackgroundSettings {
  return {
    ...resolveScenePadding(value),
    ...resolveSceneBackgroundVisuals(value),
    sourceImage: normalizeEditorImageSettings(
      isRecord(value['sourceImage'])
        ? value['sourceImage']
        : DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.sourceImage
    ),
  };
}

export function parseSceneBackgroundSettings(value: unknown): EditorSceneBackgroundSettings | null {
  if (
    !isRecord(value) ||
    !hasValidScenePadding(value) ||
    !hasValidSceneBackgroundMode(value) ||
    !isString(value['backgroundColor']) ||
    !isString(value['backgroundGradientFrom']) ||
    !isString(value['backgroundGradientTo']) ||
    !hasValidSceneGradientStops(value) ||
    !isNumber(value['backgroundGradientAngle']) ||
    !hasValidSceneBackgroundImage(value) ||
    !hasValidSceneLayoutMode(value)
  ) {
    return null;
  }

  return buildSceneBackgroundSettings(value);
}
