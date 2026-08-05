import type {
  StepBadgePreset,
  StepBadgePresetCatalog,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  cloneStepBadgeTemplate,
  getCanonicalSystemStepBadgePreset,
} from '../../../features/highlighter/step-badge-presets/catalog';

function normalize(presets: StepBadgePreset[]): StepBadgePreset[] {
  return presets.map((preset, order) => ({ ...preset, order }));
}

export function addStepBadgePreset(catalog: StepBadgePresetCatalog, preset: StepBadgePreset) {
  if (catalog.presets.some((item) => item.id === preset.id)) return null;
  return { ...catalog, catalogCustomized: true, presets: normalize([...catalog.presets, preset]) };
}

export function updateStepBadgePreset(
  catalog: StepBadgePresetCatalog,
  input: Pick<StepBadgePreset, 'id' | 'name' | 'settings'>
) {
  const current = catalog.presets.find((preset) => preset.id === input.id);
  if (!current) return null;
  return {
    ...catalog,
    catalogCustomized: true,
    presets: catalog.presets.map((preset) =>
      preset.id === input.id
        ? {
            ...preset,
            name: input.name,
            settings: cloneStepBadgeTemplate(input.settings),
            ...(preset.origin === 'system' ? { customized: true } : {}),
          }
        : preset
    ),
  };
}

export function deleteStepBadgePreset(catalog: StepBadgePresetCatalog, id: string) {
  const current = catalog.presets.find((preset) => preset.id === id);
  if (!current || current.origin === 'system') return null;
  const presets = catalog.presets.filter((preset) => preset.id !== id);
  if (!presets.some((preset) => preset.enabled !== false)) return null;
  return {
    ...catalog,
    catalogCustomized: true,
    presets: normalize(presets),
    defaultPresetId:
      catalog.defaultPresetId === id
        ? presets.find((preset) => preset.enabled !== false)!.id
        : catalog.defaultPresetId,
  };
}

export function setStepBadgePresetEnabled(
  catalog: StepBadgePresetCatalog,
  id: string,
  enabled: boolean
) {
  if (!catalog.presets.some((preset) => preset.id === id)) return null;
  const presets = catalog.presets.map((preset) =>
    preset.id === id ? { ...preset, enabled } : preset
  );
  if (!presets.some((preset) => preset.enabled !== false)) return null;
  const defaultPresetId =
    presets.find((preset) => preset.id === catalog.defaultPresetId)?.enabled === false
      ? presets.find((preset) => preset.enabled !== false)!.id
      : catalog.defaultPresetId;
  return { ...catalog, catalogCustomized: true, defaultPresetId, presets };
}

export function setDefaultStepBadgePreset(catalog: StepBadgePresetCatalog, id: string) {
  const preset = catalog.presets.find((item) => item.id === id && item.enabled !== false);
  return preset ? { ...catalog, catalogCustomized: true, defaultPresetId: id } : null;
}

export function reorderStepBadgePresets(catalog: StepBadgePresetCatalog, ids: string[]) {
  if (ids.length !== catalog.presets.length || new Set(ids).size !== ids.length) return null;
  const byId = new Map(catalog.presets.map((preset) => [preset.id, preset]));
  if (ids.some((id) => !byId.has(id))) return null;
  return {
    ...catalog,
    catalogCustomized: true,
    presets: ids.map((id, order) => ({ ...byId.get(id)!, order })),
  };
}

export function resetSystemStepBadgePreset(catalog: StepBadgePresetCatalog, id: string) {
  const current = catalog.presets.find((preset) => preset.id === id);
  if (!current?.systemPresetKey) return null;
  const canonical = getCanonicalSystemStepBadgePreset(current.systemPresetKey);
  return {
    ...catalog,
    presets: catalog.presets.map((preset) =>
      preset.id === id
        ? { ...canonical, enabled: current.enabled !== false, order: current.order }
        : preset
    ),
  };
}
