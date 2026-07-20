import type {
  EditorArrowSettings,
  EditorBrushSettings,
  EditorFrameSettings,
  EditorShapeSettings,
  EditorTextSettings,
} from './types';
import type { EditorLineSettings } from './line-types';
import type { EditorGradientColorStop } from './gradient';
import type { EditorStepSettings } from './step-types';
import type { BlurSettings } from '../../highlighter/contracts';

export type EditorPresetFamily =
  | 'pencil'
  | 'highlighter'
  | 'ellipse'
  | 'blur'
  | 'arrow'
  | 'line'
  | 'text'
  | 'step'
  | 'sceneBackground';

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
  shapeStroke: string[];
  shapeFill: string[];
  textColor: string[];
  textBackground: string[];
  sceneBackground: string[];
}

export interface EditorPresetSettingsMap {
  pencil: EditorBrushSettings;
  highlighter: EditorBrushSettings;
  ellipse: EditorShapeSettings;
  blur: BlurSettings;
  arrow: EditorArrowSettings;
  line: EditorLineSettings;
  text: EditorTextSettings;
  step: EditorStepSettings;
  sceneBackground: EditorSceneBackgroundSettings;
}

export interface EditorPresetStorageState {
  pencil: EditorPresetCollection<EditorBrushSettings>;
  highlighter: EditorPresetCollection<EditorBrushSettings>;
  ellipse: EditorPresetCollection<EditorShapeSettings>;
  blur: EditorPresetCollection<BlurSettings>;
  arrow: EditorPresetCollection<EditorArrowSettings>;
  line: EditorPresetCollection<EditorLineSettings>;
  text: EditorPresetCollection<EditorTextSettings>;
  step: EditorPresetCollection<EditorStepSettings>;
  sceneBackground: EditorPresetCollection<EditorSceneBackgroundSettings>;
  palette: EditorPaletteSettings;
}
