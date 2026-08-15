import type { Gradient } from '@sniptale/foundation/paint';
import { cloneGradientPresetCatalog, normalizeGradientPresetPaint } from './defaults';
import type {
  GradientPresetCatalog,
  GradientPresetSurface,
  NewGradientPreset,
  StoredGradientPreset,
} from './contracts';
import { SYSTEM_GRADIENT_PRESETS } from './defaults';

function normalizePresetName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : null;
}

function gradientsEqual(left: Gradient, right: Gradient): boolean {
  const normalizedLeft = normalizeGradientPresetPaint(left);
  const normalizedRight = normalizeGradientPresetPaint(right);
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

export function addUserGradientPreset(
  catalog: GradientPresetCatalog,
  preset: NewGradientPreset
): GradientPresetCatalog | null {
  const userCount = catalog.presets.filter((item) => item.origin === 'user').length;
  const canonicalGradient = normalizeGradientPresetPaint(preset.gradient);
  const canonicalName = normalizePresetName(preset.name);
  if (
    preset.origin !== 'user' ||
    !preset.id.trim() ||
    preset.id.length > 256 ||
    !canonicalName ||
    userCount >= 100 ||
    !canonicalGradient ||
    catalog.presets.some((item) => item.id === preset.id)
  )
    return null;
  const next = cloneGradientPresetCatalog(catalog);
  next.presets.push({
    ...preset,
    customized: false,
    enabled: true,
    name: canonicalName,
    order: Math.max(-1, ...next.presets.map((item) => item.order)) + 1,
    gradient: canonicalGradient,
  });
  return next;
}
function isSystemPresetCustomized(preset: StoredGradientPreset): boolean {
  const canonical = SYSTEM_GRADIENT_PRESETS.find((item) => item.id === preset.id);
  return Boolean(
    canonical &&
    (preset.name !== canonical.name ||
      preset.enabled !== canonical.enabled ||
      preset.order !== canonical.order ||
      !gradientsEqual(preset.gradient, canonical.gradient))
  );
}

export function updateGradientPresetValues(
  catalog: GradientPresetCatalog,
  id: string,
  gradient: Gradient,
  name?: string
): GradientPresetCatalog | null {
  const current = catalog.presets.find((preset) => preset.id === id);
  const canonicalGradient = normalizeGradientPresetPaint(gradient);
  const canonicalName = name === undefined ? undefined : normalizePresetName(name);
  if (!current || !canonicalGradient || canonicalName === null) return null;
  const next = cloneGradientPresetCatalog(catalog);
  next.presets = next.presets.map((preset) =>
    preset.id === id
      ? {
          ...preset,
          ...(canonicalName === undefined ? {} : { name: canonicalName }),
          gradient: canonicalGradient,
          customized:
            preset.origin === 'system'
              ? isSystemPresetCustomized({
                  ...preset,
                  ...(canonicalName === undefined ? {} : { name: canonicalName }),
                  gradient: canonicalGradient,
                })
              : false,
        }
      : preset
  );
  return next;
}
export function deleteUserGradientPreset(
  catalog: GradientPresetCatalog,
  id: string
): GradientPresetCatalog | null {
  const current = catalog.presets.find((preset) => preset.id === id);
  if (
    !current ||
    current.origin !== 'user' ||
    Object.values(catalog.defaultPresetIdBySurface).includes(id)
  )
    return null;
  const next = cloneGradientPresetCatalog(catalog);
  next.presets = next.presets.filter((preset) => preset.id !== id);
  for (const surface of Object.keys(next.favoriteIdsBySurface) as GradientPresetSurface[])
    next.favoriteIdsBySurface[surface] = (next.favoriteIdsBySurface[surface] ?? []).filter(
      (favorite) => favorite !== id
    );
  return next;
}
export function reorderGradientPresets(
  catalog: GradientPresetCatalog,
  ids: readonly string[]
): GradientPresetCatalog | null {
  if (
    ids.length !== catalog.presets.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !catalog.presets.some((preset) => preset.id === id))
  )
    return null;
  const rank = new Map(ids.map((id, index) => [id, index]));
  const next = cloneGradientPresetCatalog(catalog);
  next.presets = next.presets
    .toSorted((a, b) => rank.get(a.id)! - rank.get(b.id)!)
    .map((preset, order) => {
      const reordered = { ...preset, order };
      return {
        ...reordered,
        customized: reordered.origin === 'system' ? isSystemPresetCustomized(reordered) : false,
      };
    });
  return next;
}

export function toggleGradientPresetEnabled(
  catalog: GradientPresetCatalog,
  id: string
): GradientPresetCatalog | null {
  const current = catalog.presets.find((preset) => preset.id === id);
  if (!current || Object.values(catalog.defaultPresetIdBySurface).includes(id)) return null;
  const next = cloneGradientPresetCatalog(catalog);
  next.presets = next.presets.map((preset) => {
    if (preset.id !== id) return preset;
    const toggled = { ...preset, enabled: !preset.enabled };
    return {
      ...toggled,
      customized: toggled.origin === 'system' ? isSystemPresetCustomized(toggled) : false,
    };
  });
  return next;
}

export function setDefaultGradientPreset(
  catalog: GradientPresetCatalog,
  surface: GradientPresetSurface,
  id: string
): GradientPresetCatalog | null {
  const preset = catalog.presets.find((item) => item.id === id);
  if (!preset?.enabled) return null;
  const next = cloneGradientPresetCatalog(catalog);
  next.defaultPresetIdBySurface[surface] = id;
  return next;
}

export function resetSystemGradientPreset(
  catalog: GradientPresetCatalog,
  id: string
): GradientPresetCatalog | null {
  const canonical = SYSTEM_GRADIENT_PRESETS.find((preset) => preset.id === id);
  if (!canonical) return null;
  const next = cloneGradientPresetCatalog(catalog);
  const reordered = next.presets.filter((preset) => preset.id !== id);
  reordered.splice(canonical.order, 0, structuredClone(canonical));
  next.presets = reordered.map((preset, order) => {
    const positioned = { ...preset, order };
    return {
      ...positioned,
      customized: positioned.origin === 'system' ? isSystemPresetCustomized(positioned) : false,
    };
  });
  return next;
}
export function toggleGradientPresetFavorite(
  catalog: GradientPresetCatalog,
  surface: GradientPresetSurface,
  id: string
): GradientPresetCatalog | null {
  if (!catalog.presets.some((preset) => preset.id === id)) return null;
  const next = cloneGradientPresetCatalog(catalog);
  const current = next.favoriteIdsBySurface[surface] ?? [];
  next.favoriteIdsBySurface[surface] = current.includes(id)
    ? current.filter((item) => item !== id)
    : [...current, id];
  return next;
}
