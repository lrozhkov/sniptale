import type {
  CalloutPreset,
  CalloutPresetCatalog,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import {
  cloneCalloutVisualStyle,
  getCanonicalSystemCalloutPreset,
} from '../../../features/highlighter/callout-presets/catalog';

interface CalloutPresetUpdate {
  content?: CalloutPreset['content'];
  id: string;
  name: string;
  placement: CalloutPreset['placement'];
  style: CalloutVisualStyle;
}

function withCustomization(catalog: CalloutPresetCatalog): CalloutPresetCatalog {
  return catalog.catalogCustomized ? catalog : { ...catalog, catalogCustomized: true };
}

function resolveDefaultId(presets: CalloutPreset[], requestedId: string): string {
  const requested = presets.find((preset) => preset.id === requestedId && preset.enabled !== false);
  return (
    requested?.id ??
    [...presets]
      .filter((preset) => preset.enabled !== false)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))[0]!.id
  );
}

export function addUserPreset(
  catalog: CalloutPresetCatalog,
  preset: Pick<CalloutPreset, 'id' | 'name' | 'placement' | 'style'> &
    Partial<Pick<CalloutPreset, 'content'>>
): CalloutPresetCatalog | null {
  if (catalog.presets.some((current) => current.id === preset.id)) return null;
  const order =
    catalog.presets.reduce((maximum, current) => Math.max(maximum, current.order), -1) + 1;
  return {
    ...withCustomization(catalog),
    presets: [
      ...catalog.presets,
      {
        content: { ...(preset.content ?? { titleText: '' }) },
        enabled: true,
        id: preset.id,
        name: preset.name,
        order,
        origin: 'user',
        placement: { ...preset.placement },
        style: cloneCalloutVisualStyle(preset.style),
      },
    ],
  };
}

export function updatePreset(
  catalog: CalloutPresetCatalog,
  update: CalloutPresetUpdate
): CalloutPresetCatalog | null {
  const current = catalog.presets.find((preset) => preset.id === update.id);
  if (!current) return null;
  const name = update.name.trim();
  if (
    current.name === name &&
    JSON.stringify(current.content) === JSON.stringify(update.content ?? current.content) &&
    JSON.stringify(current.placement) === JSON.stringify(update.placement) &&
    JSON.stringify(current.style) === JSON.stringify(update.style)
  ) {
    return null;
  }
  const updated: CalloutPreset = {
    ...current,
    customized: current.origin === 'system' ? true : current.customized,
    content: { ...(update.content ?? current.content) },
    name,
    placement: { ...update.placement },
    style: cloneCalloutVisualStyle(update.style),
  };
  return {
    ...withCustomization(catalog),
    presets: catalog.presets.map((preset) => (preset.id === update.id ? updated : preset)),
  };
}

export function deleteUserPreset(
  catalog: CalloutPresetCatalog,
  presetId: string
): CalloutPresetCatalog | null {
  const current = catalog.presets.find((preset) => preset.id === presetId);
  if (!current || current.origin === 'system') return null;
  if (
    current.enabled !== false &&
    catalog.presets.filter((preset) => preset.enabled !== false).length <= 1
  ) {
    return null;
  }
  const presets = catalog.presets.filter((preset) => preset.id !== presetId);
  return {
    ...withCustomization(catalog),
    defaultPresetId: resolveDefaultId(presets, catalog.defaultPresetId),
    presets,
  };
}

export function setPresetEnabled(
  catalog: CalloutPresetCatalog,
  presetId: string,
  enabled: boolean
): CalloutPresetCatalog | null {
  const current = catalog.presets.find((preset) => preset.id === presetId);
  if (!current || (current.enabled !== false) === enabled) return null;
  if (!enabled && catalog.presets.filter((preset) => preset.enabled !== false).length <= 1) {
    return null;
  }
  const presets = catalog.presets.map((preset) =>
    preset.id === presetId ? { ...preset, enabled } : preset
  );
  return {
    ...withCustomization(catalog),
    defaultPresetId: resolveDefaultId(presets, catalog.defaultPresetId),
    presets,
  };
}

export function setDefaultPreset(
  catalog: CalloutPresetCatalog,
  presetId: string
): CalloutPresetCatalog | null {
  const current = catalog.presets.find((preset) => preset.id === presetId);
  if (!current || current.enabled === false || catalog.defaultPresetId === presetId) return null;
  return { ...withCustomization(catalog), defaultPresetId: presetId };
}

export function reorderPresets(
  catalog: CalloutPresetCatalog,
  orderedIds: string[]
): CalloutPresetCatalog | null {
  if (new Set(orderedIds).size !== orderedIds.length) return null;
  const known = new Map(catalog.presets.map((preset) => [preset.id, preset]));
  const reordered = orderedIds.flatMap((id) => {
    const preset = known.get(id);
    if (!preset) return [];
    known.delete(id);
    return [preset];
  });
  reordered.push(
    ...catalog.presets.filter((preset) => known.has(preset.id)).sort((a, b) => a.order - b.order)
  );
  const presets = reordered.map((preset, order) => ({ ...preset, order }));
  if (presets.every((preset, index) => preset.id === catalog.presets[index]?.id)) return null;
  return { ...withCustomization(catalog), presets };
}

export function resetSystemPreset(
  catalog: CalloutPresetCatalog,
  presetId: string
): CalloutPresetCatalog | null {
  const current = catalog.presets.find((preset) => preset.id === presetId);
  if (current?.origin !== 'system' || !current.systemPresetKey) return null;
  const canonical = getCanonicalSystemCalloutPreset(current.systemPresetKey);
  if (
    current.customized !== true &&
    JSON.stringify(current.content) === JSON.stringify(canonical.content) &&
    current.name === canonical.name &&
    JSON.stringify(current.placement) === JSON.stringify(canonical.placement) &&
    JSON.stringify(current.style) === JSON.stringify(canonical.style)
  ) {
    return null;
  }
  return {
    ...withCustomization(catalog),
    presets: catalog.presets.map((preset) =>
      preset.id === presetId
        ? { ...canonical, enabled: current.enabled !== false, order: current.order }
        : preset
    ),
  };
}
