import type {
  EditorPresetCollection,
  EditorPresetStorageState,
} from '../../../features/editor/document/presets';
import { isRecord } from '../infrastructure/guards/primitives';
import { resolveEditorPresetDefaultId } from './collections';
import {
  cloneEditorPreset,
  cloneEditorPresetCollection,
  cloneEditorPaletteSettings,
  createDefaultEditorPresetStorageState,
} from './defaults';
import { parseRootCollections } from './parsers';

type ParsedRoot = {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  value: Partial<EditorPresetStorageState>;
};

function buildParsedEditorPresetState(
  parsed: ReturnType<typeof parseRootCollections>
): Partial<EditorPresetStorageState> {
  const value: Partial<EditorPresetStorageState> = {};

  if (parsed.step.collection) {
    value.step = parsed.step.collection;
  }
  if (parsed.sceneBackground.collection) {
    value.sceneBackground = parsed.sceneBackground.collection;
  }
  if (parsed.palette) {
    value.palette = cloneEditorPaletteSettings(parsed.palette);
  }

  return value;
}

export function parseStoredEditorPresetState(value: unknown): ParsedRoot {
  if (value === undefined) {
    return { hasInvalidRoot: false, invalidFieldCount: 0, value: {} };
  }

  if (!isRecord(value)) {
    return { hasInvalidRoot: true, invalidFieldCount: 0, value: {} };
  }

  const parsed = parseRootCollections(value);

  return {
    hasInvalidRoot: false,
    invalidFieldCount: parsed.step.invalidFieldCount + parsed.sceneBackground.invalidFieldCount,
    value: buildParsedEditorPresetState(parsed),
  };
}

function normalizePresetCollection<TSettings>(
  collection: EditorPresetCollection<TSettings> | undefined,
  fallback: EditorPresetCollection<TSettings>
): EditorPresetCollection<TSettings> {
  const [fallbackSystemPreset] = cloneEditorPresetCollection(fallback).presets;
  if (!fallbackSystemPreset) {
    return {
      defaultPresetId: collection?.defaultPresetId ?? fallback.defaultPresetId,
      presets: [],
    };
  }

  const presets =
    collection && collection.presets.length > 0
      ? collection.presets.map(cloneEditorPreset)
      : cloneEditorPresetCollection(fallback).presets;
  const normalizedPresets = presets.some((preset) => preset.isSystemDefault)
    ? presets.map((preset) =>
        preset.isSystemDefault ? cloneEditorPreset(fallbackSystemPreset) : preset
      )
    : [cloneEditorPreset(fallbackSystemPreset), ...presets];

  return {
    defaultPresetId: resolveEditorPresetDefaultId(normalizedPresets, collection?.defaultPresetId),
    presets: normalizedPresets,
  };
}

export function resolveStoredEditorPresetState(
  value: Partial<EditorPresetStorageState>
): EditorPresetStorageState {
  const defaults = createDefaultEditorPresetStorageState();

  return {
    step: normalizePresetCollection(value.step, defaults.step),
    sceneBackground: normalizePresetCollection(value.sceneBackground, defaults.sceneBackground),
    palette: value.palette
      ? cloneEditorPaletteSettings(value.palette)
      : cloneEditorPaletteSettings(defaults.palette),
  };
}
