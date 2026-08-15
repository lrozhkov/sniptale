// policyStateIds: [] - exact preset parser sets are immutable value allowlists, not authority state.
import {
  SYSTEM_CALLOUT_PRESET_KEYS,
  type CalloutAttachment,
  type CalloutAnchor,
  type CalloutConnectorAttachments,
  type CalloutPreset,
  type CalloutVisualStyle,
  type SystemCalloutPresetKey,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { parseAnnotationSessionDefaults } from '../infrastructure/guards/annotation-session-defaults';
import { isBoolean, isNumber, isPlainRecord, isString } from '../infrastructure/guards/primitives';
import { parseCalloutVisualStyle } from './visual-style-parser';
import { parseAnnotationTemplateTagIds } from '../annotation-template-tags/tag-ids';
import type { AnnotationSessionDefaults } from '@sniptale/runtime-contracts/highlighter/border-preset';

export { parseCalloutVisualStyle } from './visual-style-parser';

export const CALLOUT_PRESET_STORAGE_SCHEMA_VERSION = 6;
export const MAX_USER_CALLOUT_PRESETS = 16;
export const MAX_CALLOUT_PRESET_NAME_LENGTH = 64;
const MAX_CALLOUT_PRESET_TITLE_LENGTH = 256;

type StoredCalloutPresetContent = CalloutPreset['content'];

interface StoredCalloutPresetPlacement {
  enabled: boolean;
  id: string;
  order: number;
  tagIds?: string[];
}

interface StoredSystemCalloutPresetOverride {
  basedOnRevision?: number;
  customized?: boolean;
  content?: StoredCalloutPresetContent;
  name: string;
  placement?: CalloutPreset['placement'];
  style: CalloutVisualStyle;
  systemPresetKey: SystemCalloutPresetKey;
}

interface StoredUserCalloutPreset {
  content?: StoredCalloutPresetContent;
  id: string;
  name: string;
  placement?: CalloutPreset['placement'];
  style: CalloutVisualStyle;
}

export interface StoredCalloutPresetCatalog {
  catalogCustomized?: boolean;
  defaultPresetId?: string;
  newSessionDefaults?: AnnotationSessionDefaults;
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

const attachmentModes = new Set(['auto', 'anchor', 'free']);
const systemKeys = new Set<string>(SYSTEM_CALLOUT_PRESET_KEYS);
const calloutAnchors = new Set<CalloutAnchor>([
  'middle-left',
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'middle-right',
]);
const calloutSides = new Set(['top', 'bottom', 'left', 'right']);

function getExpectedPresetSide(anchor: CalloutAnchor) {
  if (anchor === 'middle-left') return 'left';
  if (anchor === 'middle-right') return 'right';
  return anchor.startsWith('bottom') ? 'bottom' : 'top';
}

function isSystemPresetKey(value: unknown): value is SystemCalloutPresetKey {
  return isString(value) && systemKeys.has(value);
}

export function parseCalloutPresetPlacement(value: unknown): CalloutPreset['placement'] | null {
  if (
    !isPlainRecord(value) ||
    !isString(value['anchor']) ||
    !calloutAnchors.has(value['anchor'] as CalloutAnchor) ||
    !isString(value['side']) ||
    !calloutSides.has(value['side']) ||
    value['side'] !== getExpectedPresetSide(value['anchor'] as CalloutAnchor)
  ) {
    return null;
  }
  const connectorAttachments = parseConnectorAttachments(value['connectorAttachments']);
  if (connectorAttachments === null) return null;
  return {
    anchor: value['anchor'] as CalloutAnchor,
    connectorAttachments,
    side: value['side'] as CalloutPreset['placement']['side'],
  };
}

function parseAttachment(value: unknown): CalloutAttachment | null {
  if (!isPlainRecord(value) || !isString(value['mode']) || !attachmentModes.has(value['mode'])) {
    return null;
  }
  const perimeterPosition = value['perimeterPosition'];
  const anchorId = value['anchorId'];
  if (
    (perimeterPosition !== undefined && !isNumberInRange(perimeterPosition, 0, 1)) ||
    (anchorId !== undefined && (!isString(anchorId) || anchorId.length > 64))
  ) {
    return null;
  }
  return {
    mode: value['mode'] as NonNullable<
      CalloutPreset['placement']['connectorAttachments']
    >['frame']['mode'],
    ...(isString(anchorId) ? { anchorId } : {}),
    ...(isNumber(perimeterPosition) ? { perimeterPosition } : {}),
  };
}

function parseConnectorAttachments(value: unknown): CalloutConnectorAttachments | null {
  if (value === undefined) {
    return { block: { mode: 'auto' as const }, frame: { mode: 'auto' as const } };
  }
  if (!isPlainRecord(value)) return null;
  const block = parseAttachment(value['block']);
  const frame = parseAttachment(value['frame']);
  return block && frame ? { block, frame } : null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return isNumber(value) && value >= minimum && value <= maximum;
}

function parsePlacement(value: unknown): StoredCalloutPresetPlacement | null {
  const tagIds = isPlainRecord(value)
    ? parseAnnotationTemplateTagIds(value['tagIds'])
    : { invalid: true, value: [] };
  if (
    !isPlainRecord(value) ||
    !isString(value['id']) ||
    value['id'].length === 0 ||
    !isBoolean(value['enabled']) ||
    !isNonNegativeInteger(value['order']) ||
    tagIds.invalid
  ) {
    return null;
  }
  return {
    enabled: value['enabled'],
    id: value['id'],
    order: value['order'],
    ...(value['tagIds'] === undefined ? {} : { tagIds: tagIds.value }),
  };
}

function isValidPresetName(value: unknown): value is string {
  return (
    isString(value) &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_CALLOUT_PRESET_NAME_LENGTH
  );
}

export function parseCalloutPresetContent(value: unknown): StoredCalloutPresetContent | null {
  if (
    !isPlainRecord(value) ||
    !isString(value['titleText']) ||
    value['titleText'].length > MAX_CALLOUT_PRESET_TITLE_LENGTH
  ) {
    return null;
  }
  return { titleText: value['titleText'] };
}

function parseSystemOverride(value: unknown): StoredSystemCalloutPresetOverride | null {
  if (
    !isPlainRecord(value) ||
    !isSystemPresetKey(value['systemPresetKey']) ||
    (value['basedOnRevision'] !== undefined && !isNonNegativeInteger(value['basedOnRevision'])) ||
    (value['customized'] !== undefined && !isBoolean(value['customized']))
  ) {
    return null;
  }
  const style = parseCalloutVisualStyle(value['style']);
  const content =
    value['content'] === undefined ? undefined : parseCalloutPresetContent(value['content']);
  const placement =
    value['placement'] === undefined ? undefined : parseCalloutPresetPlacement(value['placement']);
  if (!style || !isValidPresetName(value['name']) || placement === null || content === null)
    return null;
  return {
    ...(isNonNegativeInteger(value['basedOnRevision'])
      ? { basedOnRevision: value['basedOnRevision'] }
      : {}),
    ...(isBoolean(value['customized']) ? { customized: value['customized'] } : {}),
    ...(content ? { content } : {}),
    name: value['name'].trim(),
    ...(placement ? { placement } : {}),
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
  const content =
    value['content'] === undefined ? undefined : parseCalloutPresetContent(value['content']);
  const placement =
    value['placement'] === undefined ? undefined : parseCalloutPresetPlacement(value['placement']);
  if (!style || placement === null || content === null) return null;
  return {
    ...(content ? { content } : {}),
    id: value['id'],
    name: value['name'].trim(),
    ...(placement ? { placement } : {}),
    style,
  };
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
  if (value['newSessionDefaults'] !== undefined) {
    const defaults = parseAnnotationSessionDefaults(value['newSessionDefaults']);
    if (defaults) parsed.newSessionDefaults = defaults;
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
