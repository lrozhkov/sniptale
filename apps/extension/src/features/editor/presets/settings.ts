import type { EditorPresetFamily, EditorPresetSettingsMap } from '../document/presets';
import type { EditorShapeSettings } from '../document/types';

const COMPARABLE_TRANSPARENT_FILL_COLOR = 'transparent';

function normalizeComparableFillColor(settings: EditorShapeSettings): string {
  return settings.fillOpacity === 0 ? COMPARABLE_TRANSPARENT_FILL_COLOR : settings.fillColor;
}

function sanitizeEditorShapeSettingsUnsupportedFields(
  settings: EditorShapeSettings
): EditorShapeSettings {
  return {
    ...settings,
    customCss: '',
    fillColor: normalizeComparableFillColor(settings),
    inheritCustomCss: false,
    opacity: settings.strokeOpacity,
  };
}

function sanitizeEllipseSettings(settings: EditorShapeSettings): EditorShapeSettings {
  return {
    ...sanitizeEditorShapeSettingsUnsupportedFields(settings),
    radius: 0,
  };
}

export function sanitizeEditorShapeComparableSettings(
  settings: EditorShapeSettings
): EditorShapeSettings {
  return {
    ...sanitizeEditorShapeSettingsUnsupportedFields(settings),
    borderPresetId: null,
  };
}

function cloneEditorPresetSettings<TKey extends EditorPresetFamily>(
  settings: EditorPresetSettingsMap[TKey]
): EditorPresetSettingsMap[TKey] {
  return structuredClone(settings);
}

export function sanitizeEditorComparableSettings<TKey extends EditorPresetFamily>(
  family: TKey,
  settings: EditorPresetSettingsMap[TKey]
): EditorPresetSettingsMap[TKey] {
  if (family === 'ellipse') {
    const sanitized = sanitizeEditorShapeComparableSettings(
      sanitizeEllipseSettings(settings as EditorShapeSettings)
    );
    return sanitized as EditorPresetSettingsMap[TKey];
  }

  return sanitizeEditorPresetSettings(family, settings);
}

export function sanitizeEditorPresetSettings<TKey extends EditorPresetFamily>(
  family: TKey,
  settings: EditorPresetSettingsMap[TKey]
): EditorPresetSettingsMap[TKey] {
  if (family === 'ellipse') {
    const sanitized = sanitizeEllipseSettings(settings as EditorShapeSettings);
    return sanitized as EditorPresetSettingsMap[TKey];
  }

  return cloneEditorPresetSettings(settings);
}
