import type {
  StepBadgePreset,
  StepBadgeTemplateSettings,
  StepBadgeVisualStyle,
  SystemStepBadgePresetKey,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS } from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';

type SystemStepBadgePreset = StepBadgePreset & {
  basedOnRevision: number;
  customized: boolean;
  enabled: boolean;
  origin: 'system';
  systemPresetKey: SystemStepBadgePresetKey;
};

export const SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION = 6;

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
  theme: keyof typeof SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS,
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
    tagIds: [SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS[theme]],
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
  createSystemPreset('system-classic', 0, 'sniptale', {
    style: {
      customCss:
        'box-shadow: 0 6px 16px rgba(15, 23, 42, 0.24);\n[text]\ntext-shadow: 0 1px 2px rgba(15, 23, 42, 0.72);',
      outlineColorSource: 'surface',
      outlineWidth: 2,
    },
  }),
  createSystemPreset('system-outline', 1, 'sniptale', {
    style: {
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#ffffff',
      outlineColorSource: 'surface',
      outlineWidth: 3,
    },
  }),
  createSystemPreset('system-compact', 3, 'paper', {
    style: {
      sizeSource: 'frame-border',
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#ffffff',
      outlineColorSource: 'surface',
      outlineWidth: 1,
    },
  }),
  createSystemPreset('system-large', 6, 'neon', {
    anchor: 'top-right',
    style: {
      customCss: 'box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.55), 0 0 18px rgba(34, 211, 238, 0.72);',
      outlineColorSource: 'surface',
      outlineWidth: 3,
      textColor: '#ffffff',
    },
  }),
  createSystemPreset('system-letters', 4, 'paper', {
    type: 'letter',
    alphabet: 'latin',
    style: {
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#ffffff',
      outlineColorSource: 'surface',
    },
  }),
  createSystemPreset('system-pill', 2, 'sniptale', {
    anchor: 'bottom-right',
    style: {
      diameter: 34,
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#ffffff',
      outlineColorSource: 'surface',
      outlineWidth: 2,
      customCss: 'border-radius: 999px; box-shadow: 0 8px 22px rgba(236, 72, 153, 0.32);',
    },
  }),
  createSystemPreset('system-stamp', 5, 'paper', {
    anchor: 'bottom-left',
    style: {
      diameter: 32,
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#ffffff',
      outlineColorSource: 'surface',
      outlineWidth: 3,
      customCss: 'border-radius: 5px; box-shadow: 2px 3px 0 rgba(120, 53, 15, 0.2);',
    },
  }),
  createSystemPreset('system-neon-orbit', 7, 'neon', {
    anchor: 'bottom-right',
    style: {
      diameter: 36,
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#ffffff',
      outlineColorSource: 'surface',
      outlineWidth: 3,
      customCss: 'box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.9), 0 0 22px currentColor;',
    },
  }),
  createSystemPreset('system-neon-square', 8, 'neon', {
    anchor: 'top-left',
    style: {
      diameter: 33,
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#ffffff',
      outlineColorSource: 'surface',
      outlineWidth: 2,
      customCss: 'border-radius: 6px; box-shadow: 0 0 18px rgba(34, 211, 238, 0.72);',
    },
  }),
  createSystemPreset('system-editorial-counter', 9, 'editorial', {
    style: {
      diameter: 28,
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#ffffff',
      outlineColorSource: 'surface',
      outlineWidth: 1,
      customCss:
        'border-radius: 0; box-shadow: 3px 3px 0 rgba(255,255,255,0.9);\n[text]\nfont-family: Georgia, serif;',
    },
  }),
  createSystemPreset('system-editorial-index', 10, 'editorial', {
    type: 'letter',
    alphabet: 'latin',
    anchor: 'bottom-left',
    style: {
      diameter: 31,
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#ffffff',
      outlineColorSource: 'surface',
      outlineWidth: 2,
      customCss: 'border-radius: 50% 50% 50% 4px;\n[text]\nfont-family: Georgia, serif;',
    },
  }),
  createSystemPreset('system-editorial-mark', 11, 'editorial', {
    anchor: 'top-right',
    style: {
      diameter: 30,
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#ffffff',
      outlineColorSource: 'surface',
      outlineWidth: 1,
      customCss: 'border-radius: 2px; box-shadow: 1px 2px 0 rgba(0,0,0,0.16);',
    },
  }),
  createSystemPreset('system-retro-sunset', 12, 'retro80s', {
    anchor: 'top-right',
    style: {
      diameter: 34,
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#ffffff',
      outlineColorSource: 'surface',
      outlineWidth: 3,
      customCss:
        'border-radius: 4px 16px 4px 16px; box-shadow: 0 0 20px rgba(244,114,182,.72);\n[text]\nfont-style: italic;',
    },
  }),
  createSystemPreset('system-retro-arcade', 13, 'retro80s', {
    anchor: 'bottom-right',
    style: {
      diameter: 32,
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#020617',
      outlineColorSource: 'surface',
      outlineWidth: 2,
      customCss:
        'border-radius: 0; box-shadow: 4px 4px 0 rgba(168,85,247,.72);\n[text]\nfont-family: ui-monospace, monospace;',
    },
  }),
  createSystemPreset('system-retro-memphis', 14, 'retro80s', {
    type: 'letter',
    alphabet: 'latin',
    anchor: 'bottom-left',
    style: {
      diameter: 36,
      backgroundColorSource: 'frame-border',
      textColorSource: 'custom',
      textColor: '#FFFFFF',
      outlineColorSource: 'surface',
      outlineWidth: 3,
      customCss: 'border-radius: 50% 8px 50% 8px; box-shadow: 5px 5px 0 rgba(244,114,182,.65);',
    },
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
  return {
    ...preset,
    settings: cloneStepBadgeTemplate(preset.settings),
    tagIds: [...preset.tagIds],
  };
}

export function createSystemStepBadgePresetCatalog(): StepBadgePreset[] {
  return canonicalCatalog.map(cloneStepBadgePreset).sort((left, right) => left.order - right.order);
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
