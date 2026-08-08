import type {
  StepBadgePreset,
  StepBadgeTemplateSettings,
  StepBadgeVisualStyle,
  SystemStepBadgePresetKey,
} from '@sniptale/runtime-contracts/highlighter/step-badge';

type SystemStepBadgePreset = StepBadgePreset & {
  basedOnRevision: number;
  customized: boolean;
  enabled: boolean;
  origin: 'system';
  systemPresetKey: SystemStepBadgePresetKey;
};

export const SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION = 1;

export const DEFAULT_STEP_BADGE_VISUAL_STYLE: StepBadgeVisualStyle = {
  sizeSource: 'frame-border',
  diameter: 29.16,
  backgroundColorSource: 'frame-border',
  backgroundColor: '#f97316',
  textColorSource: 'custom',
  textColor: '#ffffff',
  outlineColorSource: 'surface',
  outlineColor: '#ffffff',
  outlineWidth: 2,
  customCss: '',
};

export const DEFAULT_STEP_BADGE_TEMPLATE: StepBadgeTemplateSettings = {
  anchor: 'top-left',
  offsetDirections: [],
  type: 'number',
  alphabet: 'cyrillic',
  value: '',
  auto: true,
  style: DEFAULT_STEP_BADGE_VISUAL_STYLE,
};

function createSystemPreset(
  key: SystemStepBadgePresetKey,
  order: number,
  patch: Omit<Partial<StepBadgeTemplateSettings>, 'style'> & {
    style?: Partial<StepBadgeVisualStyle>;
  }
): SystemStepBadgePreset {
  return {
    id: key,
    name: key,
    enabled: true,
    order,
    origin: 'system',
    systemPresetKey: key,
    basedOnRevision: SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION,
    customized: false,
    settings: {
      ...DEFAULT_STEP_BADGE_TEMPLATE,
      ...patch,
      offsetDirections: [
        ...(patch.offsetDirections ?? DEFAULT_STEP_BADGE_TEMPLATE.offsetDirections),
      ],
      style: { ...DEFAULT_STEP_BADGE_VISUAL_STYLE, ...patch.style },
    },
  };
}

const canonicalCatalog: readonly SystemStepBadgePreset[] = [
  createSystemPreset('system-classic', 0, {}),
  createSystemPreset('system-outline', 1, {
    style: {
      backgroundColorSource: 'custom',
      backgroundColor: '#ffffff',
      textColorSource: 'frame-border',
      outlineColorSource: 'frame-border',
    },
  }),
  createSystemPreset('system-compact', 2, {
    style: { sizeSource: 'custom', diameter: 24 },
  }),
  createSystemPreset('system-large', 3, {
    style: { sizeSource: 'custom', diameter: 40 },
  }),
  createSystemPreset('system-letters', 4, {
    type: 'letter',
    alphabet: 'cyrillic',
  }),
];

export function cloneStepBadgeTemplate(
  settings: StepBadgeTemplateSettings
): StepBadgeTemplateSettings {
  return {
    ...settings,
    offsetDirections: [...settings.offsetDirections],
    style: { ...settings.style },
  };
}

export function cloneStepBadgePreset(preset: StepBadgePreset): StepBadgePreset {
  return { ...preset, settings: cloneStepBadgeTemplate(preset.settings) };
}

export function createSystemStepBadgePresetCatalog(): StepBadgePreset[] {
  return canonicalCatalog.map(cloneStepBadgePreset);
}

export function getCanonicalSystemStepBadgePreset(
  key: SystemStepBadgePresetKey
): SystemStepBadgePreset {
  return cloneStepBadgePreset(
    canonicalCatalog.find((preset) => preset.systemPresetKey === key)!
  ) as SystemStepBadgePreset;
}

export function createStepBadgeSettingsFromTemplate(
  settings: StepBadgeTemplateSettings,
  sourcePresetId?: string
) {
  return {
    ...cloneStepBadgeTemplate(settings),
    enabled: true,
    ...(sourcePresetId ? { sourcePresetId } : {}),
  };
}

export function createStepBadgeTemplateFromSettings(
  settings: import('@sniptale/runtime-contracts/highlighter/step-badge').StepBadgeSettings,
  linkedDiameter?: number
): StepBadgeTemplateSettings {
  return {
    anchor: settings.anchor ?? settings.corner ?? 'top-left',
    offsetDirections: [...(settings.offsetDirections ?? [])],
    type: settings.type,
    alphabet: settings.alphabet ?? 'cyrillic',
    value: settings.value,
    auto: settings.auto !== false,
    style: settings.style
      ? { ...settings.style }
      : {
          ...DEFAULT_STEP_BADGE_VISUAL_STYLE,
          ...(linkedDiameter === undefined ? {} : { diameter: linkedDiameter }),
        },
  };
}
