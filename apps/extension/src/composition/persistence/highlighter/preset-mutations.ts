import type { BorderPreset, HighlighterSettings } from '../../../features/highlighter/contracts';
import {
  cloneBorderPreset,
  getCanonicalSystemBorderPreset,
} from '../../../features/highlighter/presets/catalog';
import { cloneBorderVisualStyle } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { getBorderPresetDisplayName } from '../../../features/highlighter/presets/display-name';
import { reorderBorderPresets, resolveDefaultBorderPresetId } from './resolved';

const editableVisualFields = [
  'color',
  'customCss',
  'effects',
  'fillColor',
  'fillOpacity',
  'inheritCustomCss',
  'opacity',
  'padding',
  'radius',
  'shadow',
  'strokeOpacity',
  'style',
  'width',
] as const;

function editableVisualsEqual(left: BorderPreset, right: BorderPreset): boolean {
  return editableVisualFields.every((field) => {
    if (field === 'padding') {
      return (
        left.padding.top === right.padding.top &&
        left.padding.right === right.padding.right &&
        left.padding.bottom === right.padding.bottom &&
        left.padding.left === right.padding.left
      );
    }
    if (field === 'effects') {
      const leftEffects = cloneBorderVisualStyle(left).effects!;
      const rightEffects = cloneBorderVisualStyle(right).effects!;
      return (
        leftEffects.blur.amount === rightEffects.blur.amount &&
        leftEffects.blur.blurType === rightEffects.blur.blurType &&
        leftEffects.focus.opacity === rightEffects.focus.opacity
      );
    }
    return left[field] === right[field];
  });
}

function withCatalogCustomization(settings: HighlighterSettings): HighlighterSettings {
  return settings.catalogCustomized === true ? settings : { ...settings, catalogCustomized: true };
}

function normalizeUserPreset(preset: BorderPreset, placement: { enabled: boolean; order: number }) {
  const {
    basedOnRevision: _basedOnRevision,
    customized: _customized,
    systemPresetKey: _systemPresetKey,
    ...candidate
  } = cloneBorderPreset(preset);
  return {
    ...candidate,
    enabled: placement.enabled,
    order: placement.order,
    origin: 'user' as const,
  };
}

export function addUserBorderPreset(
  settings: HighlighterSettings,
  preset: BorderPreset
): HighlighterSettings | null {
  if (settings.borderPresets.some((current) => current.id === preset.id)) return null;
  const nextOrder =
    settings.borderPresets.reduce((maximum, current) => Math.max(maximum, current.order), -1) + 1;
  return {
    ...withCatalogCustomization(settings),
    borderPresets: [
      ...settings.borderPresets,
      normalizeUserPreset(preset, { enabled: preset.enabled !== false, order: nextOrder }),
    ],
  };
}

function updateSystemPreset(current: BorderPreset, incoming: BorderPreset): BorderPreset | null {
  const displayName = getBorderPresetDisplayName(current);
  const incomingName = incoming.name.trim();
  const nameChanged = incomingName !== displayName;
  const visualChanged = !editableVisualsEqual(current, incoming);
  if (!nameChanged && !visualChanged) return null;

  const updated = cloneBorderPreset(incoming);
  return {
    ...updated,
    id: current.id,
    name: incomingName || displayName,
    enabled: current.enabled ?? true,
    order: current.order,
    origin: 'system',
    ...(current.systemPresetKey === undefined ? {} : { systemPresetKey: current.systemPresetKey }),
    ...(current.basedOnRevision === undefined ? {} : { basedOnRevision: current.basedOnRevision }),
    customized: true,
  };
}

export function updateExistingBorderPreset(
  settings: HighlighterSettings,
  incoming: BorderPreset
): HighlighterSettings | null {
  const index = settings.borderPresets.findIndex((current) => current.id === incoming.id);
  if (index < 0) return null;
  const current = settings.borderPresets[index]!;
  const updated =
    current.origin === 'system'
      ? updateSystemPreset(current, incoming)
      : normalizeUserPreset(incoming, {
          enabled: current.enabled !== false,
          order: current.order,
        });
  if (!updated) return null;
  if (
    current.origin !== 'system' &&
    current.name === updated.name &&
    editableVisualsEqual(current, updated)
  ) {
    return null;
  }

  return {
    ...withCatalogCustomization(settings),
    borderPresets: settings.borderPresets.map((preset, presetIndex) =>
      presetIndex === index ? updated : preset
    ),
  };
}

export function deleteUserBorderPreset(
  settings: HighlighterSettings,
  presetId: string
): HighlighterSettings | null {
  const preset = settings.borderPresets.find((current) => current.id === presetId);
  const isOnlyEnabledPreset =
    preset !== undefined &&
    preset.enabled !== false &&
    settings.borderPresets.filter((current) => current.enabled !== false).length <= 1;
  if (
    !preset ||
    preset.origin === 'system' ||
    settings.borderPresets.length <= 1 ||
    isOnlyEnabledPreset
  ) {
    return null;
  }
  const borderPresets = settings.borderPresets.filter((current) => current.id !== presetId);
  return {
    ...withCatalogCustomization(settings),
    borderPresets,
    defaultBorderPresetId: resolveDefaultBorderPresetId(
      borderPresets,
      settings.defaultBorderPresetId
    ),
  };
}

export function setPresetEnabled(
  settings: HighlighterSettings,
  presetId: string,
  enabled: boolean
): HighlighterSettings | null {
  const preset = settings.borderPresets.find((current) => current.id === presetId);
  if (!preset || (preset.enabled !== false) === enabled) return null;
  if (
    !enabled &&
    settings.borderPresets.filter((current) => current.enabled !== false).length <= 1
  ) {
    return null;
  }
  const borderPresets = settings.borderPresets.map((current) =>
    current.id === presetId ? { ...current, enabled } : current
  );
  return {
    ...withCatalogCustomization(settings),
    borderPresets,
    defaultBorderPresetId: resolveDefaultBorderPresetId(
      borderPresets,
      settings.defaultBorderPresetId
    ),
  };
}

export function setPresetAsDefault(
  settings: HighlighterSettings,
  presetId: string
): HighlighterSettings | null {
  const preset = settings.borderPresets.find((current) => current.id === presetId);
  if (!preset || preset.enabled === false || settings.defaultBorderPresetId === presetId)
    return null;
  return {
    ...withCatalogCustomization(settings),
    defaultBorderPresetId: presetId,
  };
}

export function reorderPresets(
  settings: HighlighterSettings,
  orderedIds: string[]
): HighlighterSettings | null {
  const borderPresets = reorderBorderPresets(settings.borderPresets, orderedIds);
  if (
    borderPresets.every((preset, index) => preset.order === settings.borderPresets[index]?.order)
  ) {
    return null;
  }
  return { ...withCatalogCustomization(settings), borderPresets };
}

export function resetSystemBorderPresetToCanonical(
  settings: HighlighterSettings,
  presetId: string
): HighlighterSettings | null {
  const current = settings.borderPresets.find((preset) => preset.id === presetId);
  if (current?.origin !== 'system' || !current.systemPresetKey) return null;
  const canonical = getCanonicalSystemBorderPreset(current.systemPresetKey);
  const reset = {
    ...canonical,
    enabled: current.enabled ?? true,
    order: current.order,
  };
  if (
    current.customized !== true &&
    current.name === reset.name &&
    editableVisualsEqual(current, reset)
  ) {
    return null;
  }
  return {
    ...withCatalogCustomization(settings),
    borderPresets: settings.borderPresets.map((preset) =>
      preset.id === presetId ? reset : preset
    ),
  };
}
