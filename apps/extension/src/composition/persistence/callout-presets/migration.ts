import type {
  CalloutPreset,
  CalloutPresetCatalog,
  SystemCalloutPresetKey,
} from '@sniptale/runtime-contracts/highlighter/callout';
import {
  cloneCalloutPreset,
  cloneCalloutVisualStyle,
  createSystemCalloutPresetCatalog,
  SYSTEM_CALLOUT_PRESET_CATALOG_REVISION,
} from '../../../features/highlighter/callout-presets/catalog';
import { CALLOUT_PRESET_STORAGE_SCHEMA_VERSION, type StoredCalloutPresetCatalog } from './parser';

function comparePlacement(left: CalloutPreset, right: CalloutPreset): number {
  return left.order - right.order || left.id.localeCompare(right.id);
}

function enforceEnabledInvariant(presets: CalloutPreset[]): CalloutPreset[] {
  if (presets.some((preset) => preset.enabled !== false)) return presets;
  const first = presets.toSorted(comparePlacement)[0];
  return first
    ? presets.map((preset) => (preset.id === first.id ? { ...preset, enabled: true } : preset))
    : presets;
}

function resolveDefaultId(presets: CalloutPreset[], requestedId?: string): string {
  const requested = presets.find((preset) => preset.id === requestedId && preset.enabled !== false);
  return (
    requested?.id ??
    presets.filter((preset) => preset.enabled !== false).toSorted(comparePlacement)[0]!.id
  );
}

export function resolveStoredCalloutPresetCatalog(
  stored: StoredCalloutPresetCatalog
): CalloutPresetCatalog {
  const hasStoredCatalog = Object.keys(stored).length > 0;
  const placementById = new Map((stored.placements ?? []).map((item) => [item.id, item]));
  const overrideByKey = new Map(
    (stored.systemOverrides ?? [])
      .filter((item) => item.customized !== false)
      .map((item) => [item.systemPresetKey, item])
  );
  const customized =
    stored.catalogCustomized === true ||
    (stored.systemOverrides?.some((item) => item.customized !== false) ?? false) ||
    (stored.userPresets?.length ?? 0) > 0;
  const nextOrder =
    (stored.placements ?? []).reduce((maximum, item) => Math.max(maximum, item.order), -1) + 1;

  const systems = createSystemCalloutPresetCatalog().map((canonical, index) => {
    const key = canonical.systemPresetKey!;
    const placement = placementById.get(canonical.id);
    const override = overrideByKey.get(key);
    if (!override) {
      return {
        ...canonical,
        enabled: placement?.enabled ?? (!hasStoredCatalog || !customized),
        order: placement?.order ?? nextOrder + index,
      };
    }
    return {
      ...canonical,
      basedOnRevision: override.basedOnRevision ?? stored.systemCatalogRevision ?? 0,
      customized: true,
      content: { ...(override.content ?? canonical.content) },
      enabled: placement?.enabled ?? true,
      name: override.name,
      order: placement?.order ?? nextOrder + index,
      placement: { ...(override.placement ?? canonical.placement) },
      style: cloneCalloutVisualStyle(override.style),
    };
  });

  const users: CalloutPreset[] = (stored.userPresets ?? []).map((user, index) => {
    const placement = placementById.get(user.id);
    return {
      content: { ...(user.content ?? { titleText: '' }) },
      enabled: placement?.enabled ?? true,
      id: user.id,
      name: user.name,
      order: placement?.order ?? nextOrder + systems.length + index,
      origin: 'user',
      placement: { ...(user.placement ?? { anchor: 'top-center', side: 'top' }) },
      style: cloneCalloutVisualStyle(user.style),
    };
  });
  const presets = enforceEnabledInvariant([...systems, ...users]).toSorted(comparePlacement);
  return {
    catalogCustomized: customized,
    defaultPresetId: resolveDefaultId(presets, stored.defaultPresetId),
    presets: presets.map((preset, order) => ({ ...preset, order })),
    systemCatalogRevision: SYSTEM_CALLOUT_PRESET_CATALOG_REVISION,
  };
}

export function cloneCalloutPresetCatalog(catalog: CalloutPresetCatalog): CalloutPresetCatalog {
  return { ...catalog, presets: catalog.presets.map(cloneCalloutPreset) };
}

export function serializeCalloutPresetCatalog(
  catalog: CalloutPresetCatalog
): StoredCalloutPresetCatalog {
  return {
    catalogCustomized: catalog.catalogCustomized,
    defaultPresetId: catalog.defaultPresetId,
    placements: catalog.presets.map((preset) => ({
      enabled: preset.enabled !== false,
      id: preset.id,
      order: preset.order,
    })),
    schemaVersion: CALLOUT_PRESET_STORAGE_SCHEMA_VERSION,
    systemCatalogRevision: SYSTEM_CALLOUT_PRESET_CATALOG_REVISION,
    systemOverrides: catalog.presets
      .filter(
        (preset): preset is CalloutPreset & { systemPresetKey: SystemCalloutPresetKey } =>
          preset.origin === 'system' &&
          preset.customized === true &&
          preset.systemPresetKey !== undefined
      )
      .map((preset) => ({
        basedOnRevision: preset.basedOnRevision ?? catalog.systemCatalogRevision,
        customized: true,
        content: { ...preset.content },
        name: preset.name,
        placement: { ...preset.placement },
        style: cloneCalloutVisualStyle(preset.style),
        systemPresetKey: preset.systemPresetKey,
      })),
    userPresets: catalog.presets
      .filter((preset) => preset.origin !== 'system')
      .map((preset) => ({
        content: { ...preset.content },
        id: preset.id,
        name: preset.name,
        placement: { ...preset.placement },
        style: cloneCalloutVisualStyle(preset.style),
      })),
  };
}
