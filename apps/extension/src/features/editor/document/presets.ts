import type { EditorFrameSettings } from './types';
import type { EditorGradientColorStop } from './gradient';
import type { EditorStepSettings } from './step-types';

export type EditorPresetFamily = 'step' | 'sceneBackground';

export interface EditorPreset<TSettings> {
  id: string;
  name: string;
  order: number;
  enabled: boolean;
  isSystemDefault?: boolean;
  settings: TSettings;
}

export interface EditorPresetCollection<TSettings> {
  defaultPresetId: string;
  presets: EditorPreset<TSettings>[];
}

export interface EditorSceneBackgroundSettings {
  paddingTop: EditorFrameSettings['paddingTop'];
  paddingRight: EditorFrameSettings['paddingRight'];
  paddingBottom: EditorFrameSettings['paddingBottom'];
  paddingLeft: EditorFrameSettings['paddingLeft'];
  backgroundMode: EditorFrameSettings['backgroundMode'];
  backgroundColor: string;
  backgroundGradientFrom: string;
  backgroundGradientTo: string;
  backgroundGradientStops?: string[] | undefined;
  backgroundGradientColorStops?: EditorGradientColorStop[] | undefined;
  backgroundGradientAngle: number;
  backgroundImageData: EditorFrameSettings['backgroundImageData'];
  backgroundImageFit: EditorFrameSettings['backgroundImageFit'];
  sourceImage?: EditorFrameSettings['sourceImage'];
  layoutMode: EditorFrameSettings['layoutMode'];
}

export interface EditorPaletteSettings {
  sceneBackground: string[];
}

export interface EditorPresetSettingsMap {
  step: EditorStepSettings;
  sceneBackground: EditorSceneBackgroundSettings;
}

export interface EditorPresetStorageState {
  step: EditorPresetCollection<EditorStepSettings>;
  sceneBackground: EditorPresetCollection<EditorSceneBackgroundSettings>;
  palette: EditorPaletteSettings;
}
