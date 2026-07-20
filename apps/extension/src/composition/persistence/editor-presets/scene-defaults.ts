import type { EditorSceneBackgroundSettings } from '../../../features/editor/document/presets';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../../features/editor/document/constants';

export const DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS: EditorSceneBackgroundSettings = {
  paddingTop: 128,
  paddingRight: 128,
  paddingBottom: 128,
  paddingLeft: 128,
  layoutMode: 'expand-canvas',
  backgroundMode: 'gradient',
  backgroundColor: 'transparent',
  backgroundGradientFrom: '#7c2d12',
  backgroundGradientTo: '#f59e0b',
  backgroundGradientStops: ['#7c2d12', '#f59e0b'],
  backgroundGradientAngle: 145,
  backgroundImageData: null,
  backgroundImageFit: 'cover',
  sourceImage: DEFAULT_EDITOR_IMAGE_SETTINGS,
};

export function createDefaultSceneBackgroundSettings(): EditorSceneBackgroundSettings {
  return structuredClone(DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS);
}
