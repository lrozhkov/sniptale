import type { BorderPreset, SystemBorderPresetKey } from '../contracts';
import { cloneBorderPresetEffects } from '@sniptale/runtime-contracts/highlighter/border-preset';

type SystemBorderPreset = BorderPreset & {
  basedOnRevision: number;
  customized: boolean;
  enabled: boolean;
  origin: 'system';
  systemPresetKey: SystemBorderPresetKey;
};

export const SYSTEM_BORDER_PRESET_CATALOG_REVISION = 2;

function createUniformPadding(value: number) {
  return { top: value, right: value, bottom: value, left: value };
}

function createSystemPreset(
  key: SystemBorderPresetKey,
  order: number,
  visual: Pick<
    BorderPreset,
    'color' | 'fillColor' | 'fillOpacity' | 'padding' | 'radius' | 'shadow' | 'style' | 'width'
  >
): SystemBorderPreset {
  return {
    id: key,
    name: key,
    enabled: true,
    order,
    opacity: 100,
    strokeOpacity: 100,
    inheritCustomCss: false,
    customCss: '',
    effects: cloneBorderPresetEffects(undefined),
    origin: 'system',
    systemPresetKey: key,
    basedOnRevision: SYSTEM_BORDER_PRESET_CATALOG_REVISION,
    customized: false,
    ...visual,
  };
}

const canonicalCatalog: readonly SystemBorderPreset[] = [
  createSystemPreset('system-default', 0, {
    color: '#F97316',
    width: 3,
    style: 'solid',
    radius: 0,
    padding: createUniformPadding(3),
    fillColor: '#00000000',
    fillOpacity: 0,
    shadow: 0,
  }),
  createSystemPreset('system-soft-highlight', 1, {
    color: '#2563EB',
    width: 3,
    style: 'solid',
    radius: 10,
    padding: createUniformPadding(6),
    fillColor: '#60A5FA',
    fillOpacity: 8,
    shadow: 30,
  }),
  createSystemPreset('system-marker', 2, {
    color: '#A16207',
    width: 2,
    style: 'solid',
    radius: 4,
    padding: createUniformPadding(3),
    fillColor: '#FACC15',
    fillOpacity: 18,
    shadow: 0,
  }),
  createSystemPreset('system-success', 3, {
    color: '#16A34A',
    width: 3,
    style: 'solid',
    radius: 8,
    padding: createUniformPadding(5),
    fillColor: '#22C55E',
    fillOpacity: 8,
    shadow: 0,
  }),
  createSystemPreset('system-attention', 4, {
    color: '#EF4444',
    width: 4,
    style: 'solid',
    radius: 6,
    padding: createUniformPadding(5),
    fillColor: '#EF4444',
    fillOpacity: 7,
    shadow: 30,
  }),
  createSystemPreset('system-review', 5, {
    color: '#8B5CF6',
    width: 3,
    style: 'dashed',
    radius: 8,
    padding: createUniformPadding(5),
    fillColor: '#00000000',
    fillOpacity: 0,
    shadow: 0,
  }),
  createSystemPreset('system-light-ui', 6, {
    color: '#111827',
    width: 2,
    style: 'solid',
    radius: 4,
    padding: createUniformPadding(4),
    fillColor: '#00000000',
    fillOpacity: 0,
    shadow: 0,
  }),
  createSystemPreset('system-dark-ui', 7, {
    color: '#F8FAFC',
    width: 2,
    style: 'solid',
    radius: 4,
    padding: createUniformPadding(4),
    fillColor: '#00000000',
    fillOpacity: 0,
    shadow: 30,
  }),
];

export function cloneBorderPreset(preset: BorderPreset): BorderPreset {
  return {
    ...preset,
    effects: cloneBorderPresetEffects(preset.effects),
    padding: { ...preset.padding },
  };
}

export function createSystemBorderPresetCatalog(): BorderPreset[] {
  return canonicalCatalog.map(cloneBorderPreset);
}

export function getCanonicalSystemBorderPreset(key: SystemBorderPresetKey): SystemBorderPreset {
  return cloneBorderPreset(
    canonicalCatalog.find((item) => item.systemPresetKey === key)!
  ) as SystemBorderPreset;
}
