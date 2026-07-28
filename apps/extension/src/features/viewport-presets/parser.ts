import { getCanonicalSystemViewportPreset, getSystemViewportPresetKeys } from './catalog';
import {
  VIEWPORT_PRESET_CATALOG_REVISION,
  type SystemViewportPreset,
  type SystemViewportPresetKey,
  type UserViewportPreset,
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
const targets = new Set<ViewportPresetTarget>(['viewport', 'window']);
const systemKeys = new Set<SystemViewportPresetKey>(getSystemViewportPresetKeys());

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

function parseSystemPreset(value: Record<string, unknown>): SystemViewportPreset | null {
  const base = parseBase(value);
  const key = value['systemKey'];
  const nameOverride = value['nameOverride'];
  if (
    !base ||
    typeof key !== 'string' ||
    !systemKeys.has(key as SystemViewportPresetKey) ||
    value['catalogRevision'] !== VIEWPORT_PRESET_CATALOG_REVISION ||
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
  return preset.customized === isSystemViewportPresetCustomized(preset) ? preset : null;
}

function parseUserPreset(value: Record<string, unknown>): UserViewportPreset | null {
  const base = parseBase(value);
  if (!base || !isValidViewportPresetName(value['name'])) return null;
  return { kind: 'user', ...base, name: value['name'].trim() };
}

function parsePreset(value: unknown): ViewportPreset | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'system') return parseSystemPreset(value);
  if (value['kind'] === 'user') return parseUserPreset(value);
  return null;
}

export function parseViewportPresetCatalog(value: unknown): ViewportPreset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map(parsePreset);
  if (parsed.some((preset) => preset === null)) return undefined;
  const presets = parsed as ViewportPreset[];
  const ids = new Set(presets.map((preset) => preset.id));
  const keys = presets.flatMap((preset) => (preset.kind === 'system' ? [preset.systemKey] : []));
  if (
    ids.size !== presets.length ||
    new Set(keys).size !== keys.length ||
    keys.length !== systemKeys.size ||
    keys.some((key) => !systemKeys.has(key)) ||
    [...targets].some((target) => {
      const group = presets.filter((preset) => preset.target === target);
      return new Set(group.map((preset) => preset.order)).size !== group.length;
    })
  ) {
    return undefined;
  }
  const normalized = normalizeViewportPresetOrder(presets);
  return normalized.every(
    (preset, index) => preset.id === presets[index]?.id && preset.order === presets[index]?.order
  )
    ? normalized
    : undefined;
}
