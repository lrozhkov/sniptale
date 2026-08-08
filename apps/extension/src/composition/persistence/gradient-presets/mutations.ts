import type { Gradient } from '@sniptale/foundation/paint';
import { cloneGradientPresetCatalog, normalizeGradientPresetPaint } from './defaults';
import type {
  GradientPresetCatalog,
  GradientPresetSurface,
  StoredGradientPreset,
} from './contracts';

function normalizePresetName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : null;
}

export function addUserGradientPreset(
  catalog: GradientPresetCatalog,
  preset: StoredGradientPreset
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
    name: canonicalName,
    order: Math.max(-1, ...next.presets.map((item) => item.order)) + 1,
    gradient: canonicalGradient,
  });
  return next;
}
export function updateUserGradientPreset(
  catalog: GradientPresetCatalog,
  id: string,
  gradient: Gradient,
  name?: string
): GradientPresetCatalog | null {
  const current = catalog.presets.find((preset) => preset.id === id);
  const canonicalGradient = normalizeGradientPresetPaint(gradient);
  const canonicalName = name === undefined ? undefined : normalizePresetName(name);
  if (!current || current.origin !== 'user' || !canonicalGradient || canonicalName === null)
    return null;
  const next = cloneGradientPresetCatalog(catalog);
  next.presets = next.presets.map((preset) =>
    preset.id === id
      ? {
          ...preset,
          ...(canonicalName === undefined ? {} : { name: canonicalName }),
          gradient: canonicalGradient,
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
  if (!current || current.origin !== 'user') return null;
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
  const users = catalog.presets.filter((preset) => preset.origin === 'user');
  if (
    ids.length !== users.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !users.some((preset) => preset.id === id))
  )
    return null;
  const rank = new Map(ids.map((id, index) => [id, index]));
  const next = cloneGradientPresetCatalog(catalog);
  const systems = next.presets.filter((preset) => preset.origin === 'system');
  const orderedUsers = next.presets
    .filter((preset) => preset.origin === 'user')
    .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const firstUserOrder = Math.max(-1, ...systems.map((preset) => preset.order)) + 1;
  orderedUsers.forEach((preset, index) => {
    preset.order = firstUserOrder + index;
  });
  next.presets = [...systems, ...orderedUsers];
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
