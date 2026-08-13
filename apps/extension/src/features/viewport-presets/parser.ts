import { getCanonicalSystemViewportPreset, getSystemViewportPresetKeys } from './catalog';
import {
  VIEWPORT_PRESET_CATALOG_REVISION,
  type SystemViewportPreset,
  type SystemViewportPresetKey,
  type ViewportPreset,
  type ViewportPresetTarget,
} from './contracts';
import {
  isSystemViewportPresetCustomized,
  isValidViewportPresetDimension,
  isValidViewportPresetName,
  normalizeViewportPresetOrder,
} from './operations';

// policyStateIds: [] - these sets are immutable parser catalogs, not runtime authority.
const targets = new Set<ViewportPresetTarget>(['window']);
const systemKeys = new Set<SystemViewportPresetKey>(getSystemViewportPresetKeys());

type ParsedPresetEntry = {
  preset: ViewportPreset;
  sourceCatalogRevision: typeof VIEWPORT_PRESET_CATALOG_REVISION | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBase(value: Record<string, unknown>) {
  if (
    typeof value['id'] !== 'string' ||
    !targets.has(value['target'] as ViewportPresetTarget) ||
    !isValidViewportPresetDimension(value['width']) ||
    !isValidViewportPresetDimension(value['height']) ||
    typeof value['enabled'] !== 'boolean' ||
    !Number.isInteger(value['order']) ||
    (value['order'] as number) < 0
  ) {
    return null;
  }
  return {
    id: value['id'],
    target: value['target'] as ViewportPresetTarget,
    width: value['width'],
    height: value['height'],
    enabled: value['enabled'],
    order: value['order'] as number,
  };
}

function parseSystemPreset(value: Record<string, unknown>): ParsedPresetEntry | null {
  const base = parseBase(value);
  const key = value['systemKey'];
  const nameOverride = value['nameOverride'];
  const sourceCatalogRevision = value['catalogRevision'];
  if (
    !base ||
    typeof key !== 'string' ||
    !systemKeys.has(key as SystemViewportPresetKey) ||
    sourceCatalogRevision !== VIEWPORT_PRESET_CATALOG_REVISION ||
    typeof value['customized'] !== 'boolean' ||
    (nameOverride !== undefined && !isValidViewportPresetName(nameOverride))
  ) {
    return null;
  }
  const systemKey = key as SystemViewportPresetKey;
  const canonical = getCanonicalSystemViewportPreset(systemKey);
  if (base.id !== canonical.id) return null;
  const preset: SystemViewportPreset = {
    kind: 'system',
    ...base,
    systemKey,
    catalogRevision: VIEWPORT_PRESET_CATALOG_REVISION,
    customized: value['customized'],
    ...(typeof nameOverride === 'string' ? { nameOverride: nameOverride.trim() } : {}),
  };
  return preset.customized === isSystemViewportPresetCustomized(preset)
    ? { preset, sourceCatalogRevision }
    : null;
}

function parseUserPreset(value: Record<string, unknown>): ParsedPresetEntry | null {
  const base = parseBase(value);
  if (!base || !isValidViewportPresetName(value['name'])) return null;
  return {
    preset: { kind: 'user', ...base, name: value['name'].trim() },
    sourceCatalogRevision: null,
  };
}

function parsePreset(value: unknown): ParsedPresetEntry | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'system') return parseSystemPreset(value);
  if (value['kind'] === 'user') return parseUserPreset(value);
  return null;
}

function hasExactSystemKeys(
  keys: readonly SystemViewportPresetKey[],
  expected: ReadonlySet<SystemViewportPresetKey>
): boolean {
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function isNormalizedCatalog(presets: readonly ViewportPreset[]): boolean {
  const normalized = normalizeViewportPresetOrder(presets);
  return normalized.every(
    (preset, index) => preset.id === presets[index]?.id && preset.order === presets[index]?.order
  );
}

export function parseViewportPresetCatalog(value: unknown): ViewportPreset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map(parsePreset);
  if (parsed.some((entry) => entry === null)) return undefined;
  const entries = parsed.filter((entry): entry is ParsedPresetEntry => entry !== null);
  const presets = entries.map((entry) => entry.preset);
  const ids = new Set(presets.map((preset) => preset.id));
  const keys = presets.flatMap((preset) => (preset.kind === 'system' ? [preset.systemKey] : []));
  const sourceRevisions = new Set(
    entries.flatMap((entry) =>
      entry.sourceCatalogRevision === null ? [] : [entry.sourceCatalogRevision]
    )
  );
  const currentCatalog =
    sourceRevisions.size === 1 && sourceRevisions.has(VIEWPORT_PRESET_CATALOG_REVISION);
  if (
    ids.size !== presets.length ||
    new Set(keys).size !== keys.length ||
    !currentCatalog ||
    (currentCatalog && !hasExactSystemKeys(keys, systemKeys)) ||
    [...targets].some((target) => {
      const group = presets.filter((preset) => preset.target === target);
      return new Set(group.map((preset) => preset.order)).size !== group.length;
    }) ||
    !isNormalizedCatalog(presets)
  ) {
    return undefined;
  }
  return normalizeViewportPresetOrder(presets);
}
