import type { EditorFrameSettings } from '../../../features/editor/document/types';
import type { EditorPresetStorageState } from '../../../features/editor/document/presets';
import {
  normalizeEditorFrameSettings,
  normalizeEditorImageSettings,
} from '../../../features/editor/document/constants';

export function resolveDefaultSceneBackgroundSettings(
  collection: EditorPresetStorageState['sceneBackground']
) {
  return (
    collection.presets.find((preset) => preset.id === collection.defaultPresetId)?.settings ??
    collection.presets.find((preset) => preset.isSystemDefault)?.settings ??
    collection.presets[0]?.settings ??
    null
  );
}

type ComparableSceneBackgroundSettings = Omit<Partial<EditorFrameSettings>, 'sourceImage'> & {
  sourceImage?: EditorFrameSettings['sourceImage'] | undefined;
};

function pickComparableSceneBackgroundSettings(frame: ComparableSceneBackgroundSettings) {
  const { sourceImage, ...frameSettings } = frame;
  const normalizedFrame = normalizeEditorFrameSettings(
    sourceImage === undefined ? frameSettings : { ...frameSettings, sourceImage }
  );
  return {
    paddingTop: normalizedFrame.paddingTop,
    paddingRight: normalizedFrame.paddingRight,
    paddingBottom: normalizedFrame.paddingBottom,
    paddingLeft: normalizedFrame.paddingLeft,
    backgroundMode: normalizedFrame.backgroundMode,
    backgroundColor: normalizedFrame.backgroundColor,
    backgroundGradientFrom: normalizedFrame.backgroundGradientFrom,
    backgroundGradientTo: normalizedFrame.backgroundGradientTo,
    backgroundGradientStops: normalizedFrame.backgroundGradientStops,
    backgroundGradientColorStops: normalizedFrame.backgroundGradientColorStops,
    backgroundGradientAngle: normalizedFrame.backgroundGradientAngle,
    backgroundImageData: normalizedFrame.backgroundImageData,
    backgroundImageFit: normalizedFrame.backgroundImageFit,
    sourceImage: normalizeEditorImageSettings(normalizedFrame.sourceImage),
    layoutMode: normalizedFrame.layoutMode,
  };
}

export function mergeSceneBackgroundDraft(
  frame: EditorFrameSettings,
  settings: EditorPresetStorageState['sceneBackground']['presets'][number]['settings'] | null
): EditorFrameSettings {
  return settings
    ? normalizeEditorFrameSettings({
        ...frame,
        ...settings,
        sourceImage: normalizeEditorImageSettings(settings.sourceImage ?? frame.sourceImage),
      })
    : frame;
}

export function createSceneBackgroundSettingsSignature(
  settings: EditorPresetStorageState['sceneBackground']['presets'][number]['settings'] | null
) {
  return settings ? JSON.stringify(pickComparableSceneBackgroundSettings(settings)) : null;
}

export function createFrameDraftSceneSignature(frame: EditorFrameSettings) {
  return JSON.stringify(pickComparableSceneBackgroundSettings(frame));
}

export function syncAuthoritativeFrameMetadata(
  draft: EditorFrameSettings,
  frame: EditorFrameSettings
): EditorFrameSettings {
  return {
    ...draft,
    browserMode: frame.browserMode,
    browserTitle: frame.browserTitle,
    browserUrl: frame.browserUrl,
  };
}
