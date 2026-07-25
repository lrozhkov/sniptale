import { isSystemBorderPresetKey } from '@sniptale/runtime-contracts/highlighter/border-preset';
import type { BorderPreset, SystemBorderPresetKey } from '../../../features/highlighter/contracts';
import {
  cloneBorderPreset,
  createSystemBorderPresetCatalog,
  getCanonicalSystemBorderPreset,
  SYSTEM_BORDER_PRESET_CATALOG_REVISION,
} from '../../../features/highlighter/presets/catalog';

// policyStateId: highlighter-system-catalog-migration - immutable legacy-name recognition data
// is scoped to the versioned catalog migration owner and never grants runtime authority.
const LEGACY_SYSTEM_DEFAULT_NAMES = new Set(['Стандартная рамка', 'Default border']);

interface HighlighterCatalogStateInput {
  borderPresets?: BorderPreset[];
  defaultBorderPresetId?: string;
  systemPresetCatalogRevision?: number;
  catalogCustomized?: boolean;
}

interface MigratedHighlighterCatalogState {
  borderPresets: BorderPreset[];
  defaultBorderPresetId: string;
  systemPresetCatalogRevision: number;
  catalogCustomized: boolean;
}

interface CatalogNormalizationState {
  discoveredCustomization: boolean;
  legacyDefaultUntouched: boolean;
  normalized: BorderPreset[];
  requestedDefaultId: string | undefined;
  reservedIds: Set<string>;
  seenIds: Set<string>;
  seenSystemKeys: Set<SystemBorderPresetKey>;
}

const visualFieldNames = [
  'color',
  'customCss',
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

function normalizeFingerprintValue(value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith('#')) return value.toLowerCase();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeFingerprintValue(item)])
    );
  }
  return value;
}

function getVisualFingerprint(preset: BorderPreset): string {
  return JSON.stringify(
    Object.fromEntries(
      visualFieldNames.map((field) => [field, normalizeFingerprintValue(preset[field])])
    )
  );
}

function isUntouchedLegacyDefault(preset: BorderPreset): boolean {
  const canonical = getCanonicalSystemBorderPreset('system-default');
  return (
    LEGACY_SYSTEM_DEFAULT_NAMES.has(preset.name) &&
    getVisualFingerprint(preset) === getVisualFingerprint(canonical)
  );
}

function resolveSystemKey(preset: BorderPreset): SystemBorderPresetKey | null {
  if (preset.origin === 'user') return null;
  if (preset.systemPresetKey && isSystemBorderPresetKey(preset.systemPresetKey)) {
    return preset.systemPresetKey;
  }
  return isSystemBorderPresetKey(preset.id) ? preset.id : null;
}

function preservePlacement(
  canonical: ReturnType<typeof getCanonicalSystemBorderPreset>,
  current: BorderPreset,
  customized: boolean
): BorderPreset {
  if (customized) {
    const { isSystemDefault: _isSystemDefault, ...preserved } = cloneBorderPreset(current);
    return {
      ...preserved,
      id: canonical.id,
      origin: 'system',
      systemPresetKey: canonical.systemPresetKey,
      basedOnRevision: current.basedOnRevision ?? 0,
      customized: true,
    };
  }

  return {
    ...canonical,
    enabled: current.enabled ?? true,
    order: current.order,
  };
}

function normalizeUserPreset(preset: BorderPreset): BorderPreset {
  const {
    basedOnRevision: _basedOnRevision,
    customized: _customized,
    isSystemDefault: _isSystemDefault,
    systemPresetKey: _systemPresetKey,
    ...userPreset
  } = cloneBorderPreset(preset);
  return { ...userPreset, origin: 'user' };
}

function getPresetPriority(preset: BorderPreset): [number, string] {
  return [Number.isFinite(preset.order) ? preset.order : Number.MAX_SAFE_INTEGER, preset.id];
}

function comparePresetPriority(left: BorderPreset, right: BorderPreset): number {
  const [leftOrder, leftId] = getPresetPriority(left);
  const [rightOrder, rightId] = getPresetPriority(right);
  return leftOrder - rightOrder || leftId.localeCompare(rightId);
}

function repairEnabledInvariant(borderPresets: BorderPreset[]): BorderPreset[] {
  if (borderPresets.some((preset) => preset.enabled !== false)) return borderPresets;
  const first = [...borderPresets].sort(comparePresetPriority)[0];
  return first
    ? borderPresets.map((preset) =>
        preset.id === first.id ? { ...preset, enabled: true } : preset
      )
    : borderPresets;
}

function resolveEnabledDefaultId(
  borderPresets: BorderPreset[],
  requestedId: string | undefined
): string {
  const requested = borderPresets.find(
    (preset) => preset.id === requestedId && preset.enabled !== false
  );
  if (requested) return requested.id;
  return [...borderPresets]
    .filter((preset) => preset.enabled !== false)
    .sort(comparePresetPriority)[0]!.id;
}

function createFreshCatalogState(): MigratedHighlighterCatalogState {
  return {
    borderPresets: createSystemBorderPresetCatalog(),
    defaultBorderPresetId: 'system-default',
    systemPresetCatalogRevision: SYSTEM_BORDER_PRESET_CATALOG_REVISION,
    catalogCustomized: false,
  };
}

function allocateRemappedUserPresetId(originalId: string, reservedIds: Set<string>): string {
  const base = `${originalId}-user`;
  let candidate = base;
  let suffix = 2;
  while (reservedIds.has(candidate)) {
    candidate = `${base}-${suffix++}`;
  }
  reservedIds.add(candidate);
  return candidate;
}

function createCatalogNormalizationState(
  input: HighlighterCatalogStateInput
): CatalogNormalizationState {
  return {
    discoveredCustomization: input.catalogCustomized === true,
    legacyDefaultUntouched: false,
    normalized: [],
    requestedDefaultId: input.defaultBorderPresetId,
    reservedIds: new Set([
      ...(input.borderPresets ?? []).map((preset) => preset.id),
      ...createSystemBorderPresetCatalog().map((preset) => preset.id),
    ]),
    seenIds: new Set<string>(),
    seenSystemKeys: new Set<SystemBorderPresetKey>(),
  };
}

function collectSystemPreset(
  current: BorderPreset,
  systemKey: SystemBorderPresetKey,
  isLegacyCatalog: boolean,
  state: CatalogNormalizationState
): void {
  if (state.seenSystemKeys.has(systemKey)) return;
  const canonical = getCanonicalSystemBorderPreset(systemKey);
  if (!canonical) return;

  state.seenSystemKeys.add(systemKey);
  state.seenIds.add(canonical.id);
  const isLegacyDefault =
    isLegacyCatalog && systemKey === 'system-default' && current.origin !== 'system';
  const untouchedLegacy = isLegacyDefault && isUntouchedLegacyDefault(current);
  state.legacyDefaultUntouched ||= untouchedLegacy;
  const customized = isLegacyDefault ? !untouchedLegacy : current.customized === true;
  state.discoveredCustomization ||= customized;
  state.normalized.push(preservePlacement(canonical, current, customized));
}

function collectUserPreset(current: BorderPreset, state: CatalogNormalizationState): void {
  const remappedId = isSystemBorderPresetKey(current.id)
    ? allocateRemappedUserPresetId(current.id, state.reservedIds)
    : current.id;
  if (state.seenIds.has(remappedId)) return;

  state.seenIds.add(remappedId);
  if (state.requestedDefaultId === current.id && remappedId !== current.id) {
    state.requestedDefaultId = remappedId;
  }
  state.discoveredCustomization = true;
  state.normalized.push(normalizeUserPreset({ ...current, id: remappedId }));
}

function collectStoredPreset(
  current: BorderPreset,
  isLegacyCatalog: boolean,
  state: CatalogNormalizationState
): void {
  const systemKey = resolveSystemKey(current);
  if (systemKey) {
    collectSystemPreset(current, systemKey, isLegacyCatalog, state);
    return;
  }
  collectUserPreset(current, state);
}

function appendMissingSystemPresets(
  catalogWasUntouched: boolean,
  state: CatalogNormalizationState
): void {
  let nextOrder =
    state.normalized.reduce((maximum, preset) => Math.max(maximum, preset.order), -1) + 1;
  for (const canonical of createSystemBorderPresetCatalog()) {
    const key = canonical.systemPresetKey!;
    if (state.seenSystemKeys.has(key)) continue;
    state.normalized.push({
      ...canonical,
      enabled: catalogWasUntouched,
      order: nextOrder++,
    });
    state.seenSystemKeys.add(key);
  }
}

function restoreCanonicalOrderForUntouchedCatalog(
  isLegacyCatalog: boolean,
  state: CatalogNormalizationState
): BorderPreset[] {
  if (isLegacyCatalog || state.discoveredCustomization) return state.normalized;
  return createSystemBorderPresetCatalog().map((canonical, order) => ({
    ...state.normalized.find((preset) => preset.systemPresetKey === canonical.systemPresetKey)!,
    order,
  }));
}

export function normalizeHighlighterCatalogState(
  input: HighlighterCatalogStateInput
): MigratedHighlighterCatalogState {
  if (!input.borderPresets || input.borderPresets.length === 0) {
    return createFreshCatalogState();
  }

  const isLegacyCatalog = input.systemPresetCatalogRevision === undefined;
  const state = createCatalogNormalizationState(input);

  for (const current of input.borderPresets) {
    collectStoredPreset(current, isLegacyCatalog, state);
  }

  const catalogWasUntouched =
    input.catalogCustomized !== true &&
    !state.discoveredCustomization &&
    (!isLegacyCatalog || state.legacyDefaultUntouched);
  appendMissingSystemPresets(catalogWasUntouched, state);
  const ordered = restoreCanonicalOrderForUntouchedCatalog(isLegacyCatalog, state);
  const borderPresets = repairEnabledInvariant(ordered);
  return {
    borderPresets,
    defaultBorderPresetId: resolveEnabledDefaultId(borderPresets, state.requestedDefaultId),
    systemPresetCatalogRevision: SYSTEM_BORDER_PRESET_CATALOG_REVISION,
    catalogCustomized: state.discoveredCustomization,
  };
}
