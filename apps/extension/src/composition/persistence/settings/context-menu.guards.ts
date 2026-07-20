import type { ContextMenuSettings, Settings } from '../../../contracts/settings';
import { isBoolean, isRecord } from '../infrastructure/guards/primitives';

const INVALID_FIELD = Symbol('invalid-field');

type ParsedFieldValue<TValue> = TValue | undefined | typeof INVALID_FIELD;
const CONTEXT_MENU_BOOLEAN_FIELDS = [
  'enabled',
  'showScreenshots',
  'showVideo',
  'showExport',
  'showImageEditor',
  'showVideoEditor',
  'showGallery',
  'showPageLinkCopy',
  'showSettings',
] as const;

interface ParsedContextMenuField {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  value: Partial<ContextMenuSettings> | undefined;
}

function parseOptionalBoolean(value: unknown): ParsedFieldValue<boolean> {
  if (value === undefined) {
    return undefined;
  }

  return isBoolean(value) ? value : INVALID_FIELD;
}

function assignParsedContextMenuField<TKey extends keyof ContextMenuSettings>(
  target: Partial<ContextMenuSettings>,
  key: TKey,
  parsedField: ParsedFieldValue<ContextMenuSettings[TKey]>
): number {
  if (parsedField === INVALID_FIELD) {
    return 1;
  }

  if (parsedField !== undefined) {
    target[key] = parsedField;
  }

  return 0;
}

function assignParsedContextMenuBooleanFields(
  target: Partial<ContextMenuSettings>,
  value: Record<string, unknown>
): number {
  let invalidFieldCount = 0;

  for (const key of CONTEXT_MENU_BOOLEAN_FIELDS) {
    invalidFieldCount += assignParsedContextMenuField(
      target,
      key,
      parseOptionalBoolean(value[key])
    );
  }

  return invalidFieldCount;
}

function parseContextMenuSettings(value: unknown): ParsedContextMenuField {
  if (value === undefined) {
    return { hasInvalidRoot: false, invalidFieldCount: 0, value: undefined };
  }

  if (!isRecord(value)) {
    return { hasInvalidRoot: true, invalidFieldCount: 0, value: undefined };
  }

  const nextValue: Partial<ContextMenuSettings> = {};
  const invalidFieldCount = assignParsedContextMenuBooleanFields(nextValue, value);

  return { hasInvalidRoot: false, invalidFieldCount, value: nextValue };
}

export function assignParsedContextMenuSettings(target: Partial<Settings>, value: unknown): number {
  const contextMenu = parseContextMenuSettings(value);
  const invalidFieldCount = contextMenu.invalidFieldCount + (contextMenu.hasInvalidRoot ? 1 : 0);

  if (contextMenu.value !== undefined) {
    target.contextMenu = contextMenu.value as Settings['contextMenu'];
  }

  return invalidFieldCount;
}
