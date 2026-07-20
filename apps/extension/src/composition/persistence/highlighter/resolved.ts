import type {
  BlurSettings,
  BorderPreset,
  EffectMode,
  FocusSettings,
  HighlighterSettings,
} from '../../../features/highlighter/contracts';
import {
  createDefaultHighlighterSettings,
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_BORDER_PRESET,
  DEFAULT_FOCUS_SETTINGS,
  DEFAULT_HIGHLIGHTER_SETTINGS,
} from '../../../features/highlighter/style/defaults';

export function warnAboutInvalidStoredSettings(args: {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  logger: {
    debug: (message: string) => void;
    warn: (message: string, payload?: Record<string, number>) => void;
  };
  migratedLegacyBlurFormat: boolean;
}): void {
  if (args.hasInvalidRoot) {
    args.logger.warn('Ignoring invalid highlighter settings payload root from storage');
  }

  if (args.invalidFieldCount > 0) {
    args.logger.warn('Dropped invalid highlighter settings fields from storage', {
      invalidFieldCount: args.invalidFieldCount,
    });
  }

  if (args.migratedLegacyBlurFormat) {
    args.logger.debug('Migrated legacy blur settings field from format to blurType');
  }
}

export function resolveDefaultBorderPresetId(
  borderPresets: BorderPreset[],
  defaultBorderPresetId: string | undefined
): string {
  if (
    defaultBorderPresetId &&
    borderPresets.some((preset) => preset.id === defaultBorderPresetId && preset.enabled !== false)
  ) {
    return defaultBorderPresetId;
  }

  return borderPresets.find((preset) => preset.enabled !== false)?.id ?? DEFAULT_BORDER_PRESET.id;
}

function cloneBorderPreset(preset: BorderPreset): BorderPreset {
  return {
    ...preset,
    padding: { ...preset.padding },
    ...(preset.isSystemDefault && preset.enabled === false ? { enabled: true } : {}),
  };
}

function normalizeLoadedBorderPresets(
  borderPresets: BorderPreset[] | undefined,
  fallback: BorderPreset[]
): BorderPreset[] {
  const presets = borderPresets && borderPresets.length > 0 ? borderPresets : fallback;
  return presets.map(cloneBorderPreset);
}

export function reorderBorderPresets(
  borderPresets: BorderPreset[],
  orderedIds: string[]
): BorderPreset[] {
  const presetMap = new Map(borderPresets.map((preset) => [preset.id, preset]));
  const reorderedPresets: BorderPreset[] = [];

  orderedIds.forEach((id, index) => {
    const preset = presetMap.get(id);
    if (preset) {
      reorderedPresets.push({ ...preset, order: index });
    }
  });

  borderPresets.forEach((preset) => {
    if (!orderedIds.includes(preset.id)) {
      reorderedPresets.push({ ...preset, order: reorderedPresets.length });
    }
  });

  return reorderedPresets;
}

export function resolveLoadedHighlighterSettings(
  borderPresets: BorderPreset[] | undefined,
  defaultBorderPresetId: string | undefined,
  value: {
    defaultBlurSettings?: Partial<BlurSettings> | undefined;
    defaultEffectMode?: EffectMode | undefined;
    defaultFocusSettings?: Partial<FocusSettings> | undefined;
  }
): HighlighterSettings {
  const defaultSettings = createDefaultHighlighterSettings();
  const normalizedBorderPresets = normalizeLoadedBorderPresets(
    borderPresets,
    defaultSettings.borderPresets
  );

  return {
    borderPresets: normalizedBorderPresets,
    defaultBorderPresetId: resolveDefaultBorderPresetId(
      normalizedBorderPresets,
      defaultBorderPresetId
    ),
    defaultEffectMode: value.defaultEffectMode ?? DEFAULT_HIGHLIGHTER_SETTINGS.defaultEffectMode,
    defaultBlurSettings: {
      ...DEFAULT_BLUR_SETTINGS,
      ...value.defaultBlurSettings,
    },
    defaultFocusSettings: {
      ...DEFAULT_FOCUS_SETTINGS,
      ...value.defaultFocusSettings,
    },
  };
}
