import type {
  StepBadgePreset,
  StepBadgePresetCatalog,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  cloneStepBadgePreset,
  createSystemStepBadgePresetCatalog,
  SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION,
} from '../../../features/highlighter/step-badge-presets/catalog';
import {
  STEP_BADGE_PRESET_STORAGE_SCHEMA_VERSION,
  type StoredStepBadgePresetCatalog,
} from './parser';

function resolveDefaultId(presets: StepBadgePreset[], requested?: string): string {
  const requestedPreset = presets.find(
    (preset) => preset.id === requested && preset.enabled !== false
  );
  return requestedPreset?.id ?? presets.find((preset) => preset.enabled !== false)!.id;
}

export function resolveStoredStepBadgePresetCatalog(
  stored: StoredStepBadgePresetCatalog
): StepBadgePresetCatalog {
  const placements = new Map((stored.placements ?? []).map((item) => [item.id, item]));
  const overrides = new Map(
    (stored.systemOverrides ?? []).map((item) => [item.systemPresetKey, item])
  );
  const systems = createSystemStepBadgePresetCatalog().map((canonical) => {
    const placement = placements.get(canonical.id);
    const override = canonical.systemPresetKey
      ? overrides.get(canonical.systemPresetKey)
      : undefined;
    const customized = override?.customized === true;
    const source =
      customized && override ? { ...canonical, ...override, origin: 'system' as const } : canonical;
    return {
      ...source,
      enabled: placement?.enabled ?? true,
      order: placement?.order ?? canonical.order,
      basedOnRevision: customized
        ? (override?.basedOnRevision ??
          stored.systemCatalogRevision ??
          SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION)
        : SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION,
      customized,
    };
  });
  const users: StepBadgePreset[] = (stored.userPresets ?? []).map((preset, index) => {
    const placement = placements.get(preset.id);
    return {
      ...preset,
      origin: 'user' as const,
      enabled: placement?.enabled ?? true,
      order: placement?.order ?? systems.length + index,
    };
  });
  const presets = [...systems, ...users]
    .sort((a, b) => a.order - b.order)
    .map((preset, order) => ({ ...preset, order }));
  if (!presets.some((preset) => preset.enabled !== false)) presets[0]!.enabled = true;
  return {
    defaultPresetId: resolveDefaultId(presets, stored.defaultPresetId),
    presets,
    systemCatalogRevision: SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION,
    catalogCustomized: stored.catalogCustomized ?? false,
  };
}

export function cloneStepBadgePresetCatalog(
  catalog: StepBadgePresetCatalog
): StepBadgePresetCatalog {
  return { ...catalog, presets: catalog.presets.map(cloneStepBadgePreset) };
}

export function serializeStepBadgePresetCatalog(
  catalog: StepBadgePresetCatalog
): StoredStepBadgePresetCatalog {
  return {
    schemaVersion: STEP_BADGE_PRESET_STORAGE_SCHEMA_VERSION,
    systemCatalogRevision: SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION,
    defaultPresetId: catalog.defaultPresetId,
    catalogCustomized: catalog.catalogCustomized ?? false,
    placements: catalog.presets.map((preset) => ({
      id: preset.id,
      order: preset.order,
      enabled: preset.enabled !== false,
    })),
    systemOverrides: catalog.presets
      .filter((preset) => preset.origin === 'system' && preset.customized === true)
      .map((preset) => ({
        systemPresetKey: preset.systemPresetKey!,
        name: preset.name,
        settings: preset.settings,
        ...(preset.basedOnRevision === undefined
          ? {}
          : { basedOnRevision: preset.basedOnRevision }),
        customized: true,
      })),
    userPresets: catalog.presets
      .filter((preset) => preset.origin !== 'system')
      .map((preset) => ({ id: preset.id, name: preset.name, settings: preset.settings })),
  };
}
