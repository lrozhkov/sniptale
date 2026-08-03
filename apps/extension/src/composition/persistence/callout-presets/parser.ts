// policyStateIds: [] - exact preset parser sets are immutable value allowlists, not authority state.
import {
  SYSTEM_CALLOUT_PRESET_KEYS,
  type CalloutVisualStyle,
  type SystemCalloutPresetKey,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { isBoolean, isNumber, isPlainRecord, isString } from '../infrastructure/guards/primitives';

export const CALLOUT_PRESET_STORAGE_SCHEMA_VERSION = 1;
export const MAX_USER_CALLOUT_PRESETS = 16;
export const MAX_CALLOUT_PRESET_NAME_LENGTH = 64;

interface StoredCalloutPresetPlacement {
  enabled: boolean;
  id: string;
  order: number;
}

interface StoredSystemCalloutPresetOverride {
  name: string;
  style: CalloutVisualStyle;
  systemPresetKey: SystemCalloutPresetKey;
}

interface StoredUserCalloutPreset {
  id: string;
  name: string;
  style: CalloutVisualStyle;
}

export interface StoredCalloutPresetCatalog {
  catalogCustomized?: boolean;
  defaultPresetId?: string;
  placements?: StoredCalloutPresetPlacement[];
  schemaVersion?: number;
  systemCatalogRevision?: number;
  systemOverrides?: StoredSystemCalloutPresetOverride[];
  userPresets?: StoredUserCalloutPreset[];
}

interface ParsedStoredCalloutPresetCatalog {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  value: StoredCalloutPresetCatalog;
}

const connectorKinds = new Set(['none', 'wedge', 'line']);
const connectorRoutings = new Set(['straight', 'elbow']);
const connectorMarkers = new Set(['none', 'circle', 'square', 'diamond', 'arrow']);
const fontFamilies = new Set(['sans', 'serif', 'mono']);
const fontWeights = new Set(['normal', 'bold']);
const systemKeys = new Set<string>(SYSTEM_CALLOUT_PRESET_KEYS);

function isConnectorMarker(
  value: unknown
): value is CalloutVisualStyle['connector']['blockMarker'] {
  return isString(value) && connectorMarkers.has(value);
}

function isConnectorKind(value: unknown): value is CalloutVisualStyle['connector']['kind'] {
  return isString(value) && connectorKinds.has(value);
}

function isConnectorRouting(value: unknown): value is CalloutVisualStyle['connector']['routing'] {
  return isString(value) && connectorRoutings.has(value);
}

function isFontFamily(value: unknown): value is CalloutVisualStyle['typography']['fontFamily'] {
  return isString(value) && fontFamilies.has(value);
}

function isFontWeight(value: unknown): value is CalloutVisualStyle['typography']['fontWeight'] {
  return isString(value) && fontWeights.has(value);
}

function isSystemPresetKey(value: unknown): value is SystemCalloutPresetKey {
  return isString(value) && systemKeys.has(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return isNumber(value) && value >= minimum && value <= maximum;
}

function isCalloutColor(value: unknown): value is string {
  if (value === 'transparent') return true;
  if (!isString(value) || (value.length !== 7 && value.length !== 9) || value[0] !== '#') {
    return false;
  }
  const hexDigits = '0123456789abcdefABCDEF';
  return [...value.slice(1)].every((character) => hexDigits.includes(character));
}

export function parseCalloutVisualStyle(value: unknown): CalloutVisualStyle | null {
  if (!isPlainRecord(value)) return null;
  const connector = value['connector'];
  const surface = value['surface'];
  const title = value['title'];
  const typography = value['typography'];
  if (
    !isPlainRecord(connector) ||
    !isConnectorMarker(connector['blockMarker']) ||
    !isCalloutColor(connector['color']) ||
    !isConnectorMarker(connector['frameMarker']) ||
    !isConnectorKind(connector['kind']) ||
    !isConnectorRouting(connector['routing']) ||
    !isNumberInRange(connector['wedgeSize'], 4, 48) ||
    !isNumberInRange(connector['width'], 1, 12) ||
    !isPlainRecord(surface) ||
    !isCalloutColor(surface['backgroundColor']) ||
    !isCalloutColor(surface['borderColor']) ||
    !isNumberInRange(surface['borderWidth'], 0, 12) ||
    !isNumberInRange(surface['paddingX'], 0, 48) ||
    !isNumberInRange(surface['paddingY'], 0, 48) ||
    !isNumberInRange(surface['radius'], 0, 64) ||
    !isNumberInRange(surface['shadow'], 0, 100) ||
    !isCalloutColor(surface['textColor']) ||
    !isPlainRecord(title) ||
    !isCalloutColor(title['backgroundColor']) ||
    !isBoolean(title['enabled']) ||
    !isNumberInRange(title['fontSize'], 8, 72) ||
    !isFontWeight(title['fontWeight']) ||
    !isCalloutColor(title['textColor']) ||
    !isPlainRecord(typography) ||
    !isFontFamily(typography['fontFamily']) ||
    !isNumberInRange(typography['fontSize'], 8, 72) ||
    !isFontWeight(typography['fontWeight']) ||
    !isNumberInRange(typography['maxWidth'], 80, 800)
  ) {
    return null;
  }

  return {
    connector: {
      blockMarker: connector['blockMarker'],
      color: connector['color'],
      frameMarker: connector['frameMarker'],
      kind: connector['kind'],
      routing: connector['routing'],
      wedgeSize: connector['wedgeSize'],
      width: connector['width'],
    },
    surface: {
      backgroundColor: surface['backgroundColor'],
      borderColor: surface['borderColor'],
      borderWidth: surface['borderWidth'],
      paddingX: surface['paddingX'],
      paddingY: surface['paddingY'],
      radius: surface['radius'],
      shadow: surface['shadow'],
      textColor: surface['textColor'],
    },
    title: {
      backgroundColor: title['backgroundColor'],
      enabled: title['enabled'],
      fontSize: title['fontSize'],
      fontWeight: title['fontWeight'],
      textColor: title['textColor'],
    },
    typography: {
      fontFamily: typography['fontFamily'],
      fontSize: typography['fontSize'],
      fontWeight: typography['fontWeight'],
      maxWidth: typography['maxWidth'],
    },
  };
}

function parsePlacement(value: unknown): StoredCalloutPresetPlacement | null {
  if (
    !isPlainRecord(value) ||
    !isString(value['id']) ||
    value['id'].length === 0 ||
    !isBoolean(value['enabled']) ||
    !isNonNegativeInteger(value['order'])
  ) {
    return null;
  }
  return { enabled: value['enabled'], id: value['id'], order: value['order'] };
}

function isValidPresetName(value: unknown): value is string {
  return (
    isString(value) &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_CALLOUT_PRESET_NAME_LENGTH
  );
}

function parseSystemOverride(value: unknown): StoredSystemCalloutPresetOverride | null {
  if (!isPlainRecord(value) || !isSystemPresetKey(value['systemPresetKey'])) return null;
  const style = parseCalloutVisualStyle(value['style']);
  if (!style || !isValidPresetName(value['name'])) return null;
  return {
    name: value['name'].trim(),
    style,
    systemPresetKey: value['systemPresetKey'],
  };
}

function parseUserPreset(value: unknown): StoredUserCalloutPreset | null {
  if (
    !isPlainRecord(value) ||
    !isString(value['id']) ||
    !value['id'].startsWith('user-') ||
    !isValidPresetName(value['name'])
  ) {
    return null;
  }
  const style = parseCalloutVisualStyle(value['style']);
  return style ? { id: value['id'], name: value['name'].trim(), style } : null;
}

function parseArray<T>(
  value: unknown,
  parser: (entry: unknown) => T | null
): { invalidFieldCount: number; value?: T[] } {
  if (value === undefined) return { invalidFieldCount: 0 };
  if (!Array.isArray(value)) return { invalidFieldCount: 1 };
  const parsed = value.map(parser).filter((entry): entry is T => entry !== null);
  return { invalidFieldCount: value.length - parsed.length, value: parsed };
}

function deduplicateBy<T>(
  values: T[] | undefined,
  keyOf: (value: T) => string
): {
  duplicateCount: number;
  values: T[] | undefined;
} {
  if (!values) return { duplicateCount: 0, values };
  const seen = new Set<string>();
  const unique = values.filter((value) => {
    const key = keyOf(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { duplicateCount: values.length - unique.length, values: unique };
}

export function parseStoredCalloutPresetCatalog(value: unknown): ParsedStoredCalloutPresetCatalog {
  if (value === undefined) return { hasInvalidRoot: false, invalidFieldCount: 0, value: {} };
  if (!isPlainRecord(value)) return { hasInvalidRoot: true, invalidFieldCount: 0, value: {} };

  let invalidFieldCount = 0;
  const parsed: StoredCalloutPresetCatalog = {};
  for (const field of ['schemaVersion', 'systemCatalogRevision'] as const) {
    if (value[field] === undefined) continue;
    if (isNonNegativeInteger(value[field])) parsed[field] = value[field];
    else invalidFieldCount++;
  }
  if (value['catalogCustomized'] !== undefined) {
    if (isBoolean(value['catalogCustomized']))
      parsed.catalogCustomized = value['catalogCustomized'];
    else invalidFieldCount++;
  }
  if (value['defaultPresetId'] !== undefined) {
    if (isString(value['defaultPresetId'])) parsed.defaultPresetId = value['defaultPresetId'];
    else invalidFieldCount++;
  }

  const placements = parseArray(value['placements'], parsePlacement);
  const systemOverrides = parseArray(value['systemOverrides'], parseSystemOverride);
  const userPresets = parseArray(value['userPresets'], parseUserPreset);
  const uniquePlacements = deduplicateBy(placements.value, (item) => item.id);
  const uniqueSystemOverrides = deduplicateBy(
    systemOverrides.value,
    (item) => item.systemPresetKey
  );
  const uniqueUserPresets = deduplicateBy(userPresets.value, (item) => item.id);
  invalidFieldCount +=
    placements.invalidFieldCount +
    systemOverrides.invalidFieldCount +
    userPresets.invalidFieldCount +
    uniquePlacements.duplicateCount +
    uniqueSystemOverrides.duplicateCount +
    uniqueUserPresets.duplicateCount;
  if ((uniqueUserPresets.values?.length ?? 0) > MAX_USER_CALLOUT_PRESETS) invalidFieldCount++;
  if (uniquePlacements.values) parsed.placements = uniquePlacements.values;
  if (uniqueSystemOverrides.values) parsed.systemOverrides = uniqueSystemOverrides.values;
  if (uniqueUserPresets.values) parsed.userPresets = uniqueUserPresets.values;

  return { hasInvalidRoot: false, invalidFieldCount, value: parsed };
}
