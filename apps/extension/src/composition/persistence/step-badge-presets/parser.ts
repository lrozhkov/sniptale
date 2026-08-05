// policyStateIds: [] - exact preset parser sets are immutable value allowlists, not authority state.
import {
  SYSTEM_STEP_BADGE_PRESET_KEYS,
  type StepBadgeTemplateSettings,
  type SystemStepBadgePresetKey,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { isBoolean, isNumber, isPlainRecord, isString } from '../infrastructure/guards/primitives';

export const STEP_BADGE_PRESET_STORAGE_SCHEMA_VERSION = 1;
export const MAX_USER_STEP_BADGE_PRESETS = 16;
export const MAX_STEP_BADGE_PRESET_NAME_LENGTH = 64;

interface StoredPlacement {
  enabled: boolean;
  id: string;
  order: number;
}

interface StoredSystemOverride {
  basedOnRevision?: number;
  customized?: boolean;
  name: string;
  settings: StepBadgeTemplateSettings;
  systemPresetKey: SystemStepBadgePresetKey;
}

interface StoredUserPreset {
  id: string;
  name: string;
  settings: StepBadgeTemplateSettings;
}

export interface StoredStepBadgePresetCatalog {
  catalogCustomized?: boolean;
  defaultPresetId?: string;
  placements?: StoredPlacement[];
  schemaVersion?: number;
  systemCatalogRevision?: number;
  systemOverrides?: StoredSystemOverride[];
  userPresets?: StoredUserPreset[];
}

interface ParsedStoredStepBadgePresetCatalog {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  value: StoredStepBadgePresetCatalog;
}

const anchors = new Set([
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);
const offsets = new Set(['up', 'down', 'left', 'right']);
const types = new Set(['number', 'letter', 'manual']);
const alphabets = new Set(['cyrillic', 'latin']);
const colorSources = new Set(['custom', 'frame-border', 'frame-fill']);
const outlineSources = new Set(['custom', 'frame-border', 'frame-fill', 'surface']);
const sizeSources = new Set(['frame-border', 'custom']);
const systemKeys = new Set<string>(SYSTEM_STEP_BADGE_PRESET_KEYS);

function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isColor(value: unknown): value is string {
  return (
    value === 'transparent' ||
    (isString(value) &&
      (value.length === 7 || value.length === 9) &&
      value.startsWith('#') &&
      /^[0-9a-f]+$/i.test(value.slice(1)))
  );
}

export function parseStepBadgeTemplateSettings(value: unknown): StepBadgeTemplateSettings | null {
  if (!isPlainRecord(value) || !isPlainRecord(value['style'])) return null;
  const style = value['style'];
  const directions = value['offsetDirections'];
  if (
    !isString(value['anchor']) ||
    !anchors.has(value['anchor']) ||
    !Array.isArray(directions) ||
    directions.length > 4 ||
    !directions.every((direction) => isString(direction) && offsets.has(direction)) ||
    new Set(directions).size !== directions.length ||
    !isString(value['type']) ||
    !types.has(value['type']) ||
    !isString(value['alphabet']) ||
    !alphabets.has(value['alphabet']) ||
    !isString(value['value']) ||
    value['value'].length > 2 ||
    !isBoolean(value['auto']) ||
    !isString(style['sizeSource']) ||
    !sizeSources.has(style['sizeSource']) ||
    !isNumber(style['diameter']) ||
    style['diameter'] < 16 ||
    style['diameter'] > 160 ||
    !isString(style['backgroundColorSource']) ||
    !colorSources.has(style['backgroundColorSource']) ||
    !isColor(style['backgroundColor']) ||
    !isString(style['textColorSource']) ||
    !colorSources.has(style['textColorSource']) ||
    !isColor(style['textColor']) ||
    !isString(style['outlineColorSource']) ||
    !outlineSources.has(style['outlineColorSource']) ||
    !isColor(style['outlineColor'])
  )
    return null;
  return {
    anchor: value['anchor'] as StepBadgeTemplateSettings['anchor'],
    offsetDirections: directions.filter(isString) as StepBadgeTemplateSettings['offsetDirections'],
    type: value['type'] as StepBadgeTemplateSettings['type'],
    alphabet: value['alphabet'] as StepBadgeTemplateSettings['alphabet'],
    value: value['value'],
    auto: value['auto'],
    style: {
      sizeSource: style['sizeSource'] as StepBadgeTemplateSettings['style']['sizeSource'],
      diameter: style['diameter'],
      backgroundColorSource: style[
        'backgroundColorSource'
      ] as StepBadgeTemplateSettings['style']['backgroundColorSource'],
      backgroundColor: style['backgroundColor'],
      textColorSource: style[
        'textColorSource'
      ] as StepBadgeTemplateSettings['style']['textColorSource'],
      textColor: style['textColor'],
      outlineColorSource: style[
        'outlineColorSource'
      ] as StepBadgeTemplateSettings['style']['outlineColorSource'],
      outlineColor: style['outlineColor'],
    },
  };
}

function parsePlacements(
  value: unknown,
  invalid: { count: number }
): StoredPlacement[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    invalid.count += 1;
    return undefined;
  }
  const ids = new Set<string>();
  const parsed: StoredPlacement[] = [];
  for (const item of value) {
    if (
      !isPlainRecord(item) ||
      !isString(item['id']) ||
      ids.has(item['id']) ||
      !isNonNegativeInteger(item['order']) ||
      !isBoolean(item['enabled'])
    ) {
      invalid.count += 1;
      continue;
    }
    ids.add(item['id']);
    parsed.push({ id: item['id'], order: item['order'], enabled: item['enabled'] });
  }
  return parsed;
}

function parseUsers(value: unknown, invalid: { count: number }): StoredUserPreset[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    invalid.count += 1;
    return undefined;
  }
  const ids = new Set<string>();
  const parsed: StoredUserPreset[] = [];
  if (value.length > MAX_USER_STEP_BADGE_PRESETS) invalid.count += 1;
  for (const item of value.slice(0, MAX_USER_STEP_BADGE_PRESETS)) {
    const settings = isPlainRecord(item) ? parseStepBadgeTemplateSettings(item['settings']) : null;
    if (
      !isPlainRecord(item) ||
      !isString(item['id']) ||
      ids.has(item['id']) ||
      !isString(item['name']) ||
      !item['name'].trim() ||
      item['name'].length > MAX_STEP_BADGE_PRESET_NAME_LENGTH ||
      !settings ||
      systemKeys.has(item['id'])
    ) {
      invalid.count += 1;
      continue;
    }
    ids.add(item['id']);
    parsed.push({ id: item['id'], name: item['name'], settings });
  }
  return parsed;
}

function parseOverrides(
  value: unknown,
  invalid: { count: number }
): StoredSystemOverride[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    invalid.count += 1;
    return undefined;
  }
  const keys = new Set<string>();
  const parsed: StoredSystemOverride[] = [];
  for (const item of value) {
    const settings = isPlainRecord(item) ? parseStepBadgeTemplateSettings(item['settings']) : null;
    const key = isPlainRecord(item) ? item['systemPresetKey'] : null;
    if (
      !isPlainRecord(item) ||
      !isString(key) ||
      !systemKeys.has(key) ||
      keys.has(key) ||
      !isString(item['name']) ||
      !item['name'].trim() ||
      item['name'].length > MAX_STEP_BADGE_PRESET_NAME_LENGTH ||
      !settings ||
      (item['basedOnRevision'] !== undefined && !isNonNegativeInteger(item['basedOnRevision'])) ||
      (item['customized'] !== undefined && !isBoolean(item['customized']))
    ) {
      invalid.count += 1;
      continue;
    }
    keys.add(key);
    parsed.push({
      systemPresetKey: key as SystemStepBadgePresetKey,
      name: item['name'],
      settings,
      ...(isNonNegativeInteger(item['basedOnRevision'])
        ? { basedOnRevision: item['basedOnRevision'] }
        : {}),
      ...(isBoolean(item['customized']) ? { customized: item['customized'] } : {}),
    });
  }
  return parsed;
}

export function parseStoredStepBadgePresetCatalog(
  value: unknown
): ParsedStoredStepBadgePresetCatalog {
  if (value === undefined) return { hasInvalidRoot: false, invalidFieldCount: 0, value: {} };
  if (!isPlainRecord(value)) return { hasInvalidRoot: true, invalidFieldCount: 0, value: {} };
  const invalid = { count: 0 };
  const parsed: StoredStepBadgePresetCatalog = {};
  if (isNonNegativeInteger(value['schemaVersion'])) parsed.schemaVersion = value['schemaVersion'];
  else if (value['schemaVersion'] !== undefined) invalid.count += 1;
  if (isNonNegativeInteger(value['systemCatalogRevision']))
    parsed.systemCatalogRevision = value['systemCatalogRevision'];
  else if (value['systemCatalogRevision'] !== undefined) invalid.count += 1;
  if (isString(value['defaultPresetId'])) parsed.defaultPresetId = value['defaultPresetId'];
  else if (value['defaultPresetId'] !== undefined) invalid.count += 1;
  if (isBoolean(value['catalogCustomized'])) parsed.catalogCustomized = value['catalogCustomized'];
  else if (value['catalogCustomized'] !== undefined) invalid.count += 1;
  const placements = parsePlacements(value['placements'], invalid);
  const users = parseUsers(value['userPresets'], invalid);
  const overrides = parseOverrides(value['systemOverrides'], invalid);
  if (placements) parsed.placements = placements;
  if (users) parsed.userPresets = users;
  if (overrides) parsed.systemOverrides = overrides;
  return { hasInvalidRoot: false, invalidFieldCount: invalid.count, value: parsed };
}
