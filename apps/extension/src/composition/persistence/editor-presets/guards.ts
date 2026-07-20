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

  if (parsed.pencil.collection) {
    value.pencil = parsed.pencil.collection;
  }
  if (parsed.highlighter.collection) {
    value.highlighter = parsed.highlighter.collection;
  }
  if (parsed.ellipse.collection) {
    value.ellipse = parsed.ellipse.collection;
  }
  if (parsed.blur.collection) {
    value.blur = parsed.blur.collection;
  }
  if (parsed.arrow.collection) {
    value.arrow = parsed.arrow.collection;
  }
  if (parsed.line.collection) {
    value.line = parsed.line.collection;
  }
  if (parsed.text.collection) {
    value.text = parsed.text.collection;
  }
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
    invalidFieldCount:
      parsed.pencil.invalidFieldCount +
      parsed.highlighter.invalidFieldCount +
      parsed.ellipse.invalidFieldCount +
      parsed.blur.invalidFieldCount +
      parsed.arrow.invalidFieldCount +
      parsed.line.invalidFieldCount +
      parsed.text.invalidFieldCount +
      parsed.step.invalidFieldCount +
      parsed.sceneBackground.invalidFieldCount,
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
    pencil: normalizePresetCollection(value.pencil, defaults.pencil),
    highlighter: normalizePresetCollection(value.highlighter, defaults.highlighter),
    ellipse: normalizePresetCollection(value.ellipse, defaults.ellipse),
    blur: normalizePresetCollection(value.blur, defaults.blur),
    arrow: normalizePresetCollection(value.arrow, defaults.arrow),
    line: normalizePresetCollection(value.line, defaults.line),
    text: normalizePresetCollection(value.text, defaults.text),
    step: normalizePresetCollection(value.step, defaults.step),
    sceneBackground: normalizePresetCollection(value.sceneBackground, defaults.sceneBackground),
    palette: value.palette
      ? cloneEditorPaletteSettings(value.palette)
      : cloneEditorPaletteSettings(defaults.palette),
  };
}
