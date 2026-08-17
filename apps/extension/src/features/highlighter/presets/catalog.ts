import type { BorderPreset, SystemBorderPresetKey } from '../contracts';
import { cloneBorderPresetEffects } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { clonePaint, createSolidPaint } from '@sniptale/foundation/paint';
import { SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS } from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { getShowcaseGradientPaint } from '../showcase-resources';

type SystemBorderPreset = BorderPreset & {
  basedOnRevision: number;
  customized: boolean;
  enabled: boolean;
  origin: 'system';
  systemPresetKey: SystemBorderPresetKey;
};

export const SYSTEM_BORDER_PRESET_CATALOG_REVISION = 7;

function createUniformPadding(value: number) {
  return { top: value, right: value, bottom: value, left: value };
}

function createSystemPreset(
  key: SystemBorderPresetKey,
  order: number,
  theme: keyof typeof SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS,
  linkedTemplates: { calloutPresetId: string; stepBadgePresetId: string },
  visual: Pick<
    BorderPreset,
    'color' | 'fillPaint' | 'padding' | 'radius' | 'shadow' | 'style' | 'width'
  >
): SystemBorderPreset {
  return {
    id: key,
    name: key,
    enabled: true,
    order,
    inheritCustomCss: false,
    customCss: '',
    effects: {
      ...cloneBorderPresetEffects(undefined),
      linkedTemplates,
    },
    origin: 'system',
    systemPresetKey: key,
    basedOnRevision: SYSTEM_BORDER_PRESET_CATALOG_REVISION,
    customized: false,
    tagIds: [SYSTEM_ANNOTATION_TEMPLATE_TAG_IDS[theme]],
    ...visual,
  };
}

const canonicalCatalog: readonly SystemBorderPreset[] = [
  createSystemPreset(
    'system-default',
    0,
    'sniptale',
    { calloutPresetId: 'system-callout-bubble', stepBadgePresetId: 'system-classic' },
    {
      color: '#F97316',
      width: 2,
      style: 'solid',
      radius: 6,
      padding: createUniformPadding(4),
      fillPaint: createSolidPaint('#F973160D'),
      shadow: 8,
    }
  ),
  createSystemPreset(
    'system-soft-highlight',
    1,
    'sniptale',
    { calloutPresetId: 'system-callout-card', stepBadgePresetId: 'system-outline' },
    {
      color: '#2563EB',
      width: 3,
      style: 'solid',
      radius: 10,
      padding: createUniformPadding(6),
      fillPaint: getShowcaseGradientPaint('system-ocean', 0.09),
      shadow: 24,
    }
  ),
  createSystemPreset(
    'system-marker',
    3,
    'paper',
    { calloutPresetId: 'system-callout-pointer-note', stepBadgePresetId: 'system-compact' },
    {
      color: '#A16207',
      width: 2,
      style: 'solid',
      radius: 4,
      padding: createUniformPadding(3),
      fillPaint: getShowcaseGradientPaint('system-radial-glow', 0.16),
      shadow: 0,
    }
  ),
  createSystemPreset(
    'system-success',
    4,
    'paper',
    { calloutPresetId: 'system-callout-framed-note', stepBadgePresetId: 'system-letters' },
    {
      color: '#0F766E',
      width: 3,
      style: 'solid',
      radius: 8,
      padding: createUniformPadding(5),
      fillPaint: createSolidPaint('#0F766E14'),
      shadow: 0,
    }
  ),
  createSystemPreset(
    'system-attention',
    6,
    'neon',
    { calloutPresetId: 'system-callout-header-card', stepBadgePresetId: 'system-large' },
    {
      color: '#F43F5E',
      width: 4,
      style: 'solid',
      radius: 6,
      padding: createUniformPadding(5),
      fillPaint: getShowcaseGradientPaint('system-conic-spectrum', 0.08),
      shadow: 32,
    }
  ),
  createSystemPreset(
    'system-review',
    7,
    'neon',
    { calloutPresetId: 'system-callout-text', stepBadgePresetId: 'system-neon-orbit' },
    {
      color: '#D946EF',
      width: 3,
      style: 'dashed',
      radius: 8,
      padding: createUniformPadding(5),
      fillPaint: createSolidPaint('#D946EF14'),
      shadow: 18,
    }
  ),
  createSystemPreset(
    'system-light-ui',
    9,
    'editorial',
    {
      calloutPresetId: 'system-callout-editorial-caption',
      stepBadgePresetId: 'system-editorial-counter',
    },
    {
      color: '#737373',
      width: 1,
      style: 'solid',
      radius: 0,
      padding: createUniformPadding(6),
      fillPaint: getShowcaseGradientPaint('system-graphite', 0.06),
      shadow: 8,
    }
  ),
  createSystemPreset(
    'system-dark-ui',
    8,
    'neon',
    { calloutPresetId: 'system-callout-terminal', stepBadgePresetId: 'system-neon-square' },
    {
      color: '#22D3EE',
      width: 2,
      style: 'solid',
      radius: 4,
      padding: createUniformPadding(4),
      fillPaint: createSolidPaint('#0F172A24'),
      shadow: 32,
    }
  ),
  createSystemPreset(
    'system-sunrise',
    2,
    'sniptale',
    { calloutPresetId: 'system-callout-ribbon', stepBadgePresetId: 'system-pill' },
    {
      color: '#FB7185',
      width: 4,
      style: 'solid',
      radius: 18,
      padding: createUniformPadding(8),
      fillPaint: getShowcaseGradientPaint('system-peach', 0.11),
      shadow: 26,
    }
  ),
  createSystemPreset(
    'system-sticky-note',
    5,
    'paper',
    { calloutPresetId: 'system-callout-sticky', stepBadgePresetId: 'system-stamp' },
    {
      color: '#92400E',
      width: 2,
      style: 'dashed',
      radius: 2,
      padding: createUniformPadding(7),
      fillPaint: createSolidPaint('#FEF3C72E'),
      shadow: 12,
    }
  ),
  createSystemPreset(
    'system-editorial-ink',
    10,
    'editorial',
    {
      calloutPresetId: 'system-callout-editorial-quote',
      stepBadgePresetId: 'system-editorial-index',
    },
    {
      color: '#737373',
      width: 4,
      style: 'solid',
      radius: 0,
      padding: { top: 10, right: 5, bottom: 10, left: 5 },
      fillPaint: createSolidPaint('#FFFFFF10'),
      shadow: 0,
    }
  ),
  createSystemPreset(
    'system-editorial-proof',
    11,
    'editorial',
    {
      calloutPresetId: 'system-callout-editorial-proof',
      stepBadgePresetId: 'system-editorial-mark',
    },
    {
      color: '#737373',
      width: 2,
      style: 'dotted',
      radius: 1,
      padding: createUniformPadding(9),
      fillPaint: createSolidPaint('#7373730D'),
      shadow: 5,
    }
  ),
  createSystemPreset(
    'system-retro-sunset',
    12,
    'retro80s',
    {
      calloutPresetId: 'system-callout-retro-sunset',
      stepBadgePresetId: 'system-retro-sunset',
    },
    {
      color: '#F472B6',
      width: 4,
      style: 'solid',
      radius: 3,
      padding: createUniformPadding(6),
      fillPaint: getShowcaseGradientPaint('system-midnight', 0.16),
      shadow: 32,
    }
  ),
  createSystemPreset(
    'system-retro-arcade',
    13,
    'retro80s',
    {
      calloutPresetId: 'system-callout-retro-arcade',
      stepBadgePresetId: 'system-retro-arcade',
    },
    {
      color: '#A3E635',
      width: 3,
      style: 'dashed',
      radius: 0,
      padding: createUniformPadding(5),
      fillPaint: createSolidPaint('#02061720'),
      shadow: 28,
    }
  ),
  createSystemPreset(
    'system-retro-memphis',
    14,
    'retro80s',
    {
      calloutPresetId: 'system-callout-retro-memphis',
      stepBadgePresetId: 'system-retro-memphis',
    },
    {
      color: '#111827',
      width: 3,
      style: 'dotted',
      radius: 16,
      padding: createUniformPadding(9),
      fillPaint: getShowcaseGradientPaint('system-conic-halo', 0.08),
      shadow: 14,
    }
  ),
];

export function cloneBorderPreset(preset: BorderPreset): BorderPreset {
  return {
    ...preset,
    effects: cloneBorderPresetEffects(preset.effects),
    padding: { ...preset.padding },
    fillPaint: clonePaint(preset.fillPaint),
    tagIds: [...preset.tagIds],
  };
}

export function createSystemBorderPresetCatalog(): BorderPreset[] {
  return canonicalCatalog.map(cloneBorderPreset).sort((left, right) => left.order - right.order);
}

export function getCanonicalSystemBorderPreset(key: SystemBorderPresetKey): SystemBorderPreset {
  return cloneBorderPreset(
    canonicalCatalog.find((item) => item.systemPresetKey === key)!
  ) as SystemBorderPreset;
}
