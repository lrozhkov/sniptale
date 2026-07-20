import type {
  EditorPaletteSettings,
  EditorPreset,
  EditorPresetCollection,
  EditorPresetFamily,
  EditorPresetSettingsMap,
} from '../../../features/editor/document/presets';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';
import { cloneEditorPreset } from './defaults';
import {
  parseArrowSettings,
  parseBlurSettings,
  parseBrushSettings,
  parseLineSettings,
  parseSceneBackgroundSettings,
  parseShapeSettings,
  parseStepSettings,
  parseTextSettings,
} from './setting-parsers';

type ParsedCollection<TKey extends EditorPresetFamily> = {
  collection?: EditorPresetCollection<EditorPresetSettingsMap[TKey]>;
  invalidFieldCount: number;
};

function cloneColorList(colors: readonly string[]): string[] {
  return [...colors];
}

function parsePreset<TSettings>(
  value: unknown,
  parseSettings: (settings: unknown) => TSettings | null
): EditorPreset<TSettings> | null {
  if (
    !isRecord(value) ||
    !isString(value['id']) ||
    !isString(value['name']) ||
    !isNumber(value['order']) ||
    (value['enabled'] !== undefined && !isBoolean(value['enabled'])) ||
    (value['isSystemDefault'] !== undefined && !isBoolean(value['isSystemDefault']))
  ) {
    return null;
  }

  const settings = parseSettings(value['settings']);
  if (!settings) {
    return null;
  }

  return cloneEditorPreset({
    id: value['id'],
    name: value['name'],
    order: value['order'],
    enabled: value['enabled'] ?? true,
    settings,
    ...(value['isSystemDefault'] === undefined
      ? {}
      : { isSystemDefault: value['isSystemDefault'] }),
  });
}

function parsePresetCollection<TKey extends EditorPresetFamily>(
  value: unknown,
  parseSettings: (settings: unknown) => EditorPresetSettingsMap[TKey] | null
): ParsedCollection<TKey> {
  if (value === undefined) {
    return { invalidFieldCount: 0 };
  }

  if (!isRecord(value) || !Array.isArray(value['presets'])) {
    return { invalidFieldCount: 1 };
  }

  const presets = value['presets']
    .map((preset) => parsePreset(preset, parseSettings))
    .filter((preset): preset is EditorPreset<EditorPresetSettingsMap[TKey]> => preset !== null);
  const defaultPresetId = isString(value['defaultPresetId']) ? value['defaultPresetId'] : undefined;
  const invalidFieldCount =
    value['presets'].length - presets.length + (defaultPresetId === undefined ? 1 : 0);

  if (defaultPresetId === undefined) {
    return { invalidFieldCount };
  }

  return {
    collection: {
      defaultPresetId,
      presets,
    },
    invalidFieldCount,
  };
}

function parsePaletteList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const colors = value.filter(isString);
  return colors.length === value.length ? cloneColorList(colors) : null;
}

function parsePaletteSettings(value: unknown): EditorPaletteSettings | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const shapeStroke = parsePaletteList(value['shapeStroke']);
  const shapeFill = parsePaletteList(value['shapeFill']);
  const textColor = parsePaletteList(value['textColor']);
  const textBackground = parsePaletteList(value['textBackground']);
  const sceneBackground = parsePaletteList(value['sceneBackground']);

  if (!shapeStroke || !shapeFill || !textColor || !textBackground || !sceneBackground) {
    return undefined;
  }

  return {
    shapeStroke,
    shapeFill,
    textColor,
    textBackground,
    sceneBackground,
  };
}

export function parseRootCollections(value: Record<string, unknown>) {
  return {
    pencil: parsePresetCollection<'pencil'>(value['pencil'], (settings) =>
      parseBrushSettings(settings, 'subtle')
    ),
    highlighter: parsePresetCollection<'highlighter'>(value['highlighter'], (settings) =>
      parseBrushSettings(settings, 'off')
    ),
    ellipse: parsePresetCollection<'ellipse'>(value['ellipse'], parseShapeSettings),
    blur: parsePresetCollection<'blur'>(value['blur'], parseBlurSettings),
    arrow: parsePresetCollection<'arrow'>(value['arrow'], parseArrowSettings),
    line: parsePresetCollection<'line'>(value['line'], parseLineSettings),
    text: parsePresetCollection<'text'>(value['text'], parseTextSettings),
    step: parsePresetCollection<'step'>(value['step'], parseStepSettings),
    sceneBackground: parsePresetCollection<'sceneBackground'>(
      value['sceneBackground'],
      parseSceneBackgroundSettings
    ),
    palette: parsePaletteSettings(value['palette']),
  };
}
