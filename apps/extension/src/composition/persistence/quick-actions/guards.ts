import type { QuickAction, QuickActionsDisplayMode } from '../../../contracts/settings';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';

type StoredQuickActionsDisplayMode = QuickActionsDisplayMode | 'row';
type LegacyQuickActionAfterCapture = NonNullable<QuickAction['afterCapture']> | 'download';
type StoredQuickAction = Omit<QuickAction, 'afterCapture'> & {
  afterCapture?: LegacyQuickActionAfterCapture | null;
};

interface ParsedQuickActionsStorageValue {
  actions: QuickAction[];
  hasInvalidRoot: boolean;
  invalidEntryCount: number;
}

const bundledQuickActionIds = new Set<NonNullable<QuickAction['bundledId']>>([
  'default-fullscreen',
  'default-edit-visible',
  'default-selection',
  'default-delayed-visible',
  'default-copy-visible',
  'default-copy-selection',
]);

const quickActionOrigins = new Set<NonNullable<QuickAction['origin']>>(['bundled', 'user']);
const quickActionScreenshotModes = new Set<QuickAction['screenshotMode']>([
  'visible',
  'full',
  'selection',
]);
const quickActionDelays = new Set<Exclude<NonNullable<QuickAction['delay']>, undefined>>([
  0, 3, 5, 10,
]);
const quickActionAfterCaptureValues = new Set<LegacyQuickActionAfterCapture>([
  'download_default',
  'ask_preset',
  'ask_system',
  'scenario',
  'edit',
  'copy',
  'download',
]);
const quickActionImageFormats = new Set<
  Exclude<NonNullable<QuickAction['imageFormat']>, undefined>
>(['png', 'jpeg', 'webp']);

function hasOptionalField(
  record: Record<string, unknown>,
  key: string,
  validator: (value: unknown) => boolean
): boolean {
  return record[key] === undefined || validator(record[key]);
}

function isQuickActionOrigin(value: unknown): value is NonNullable<QuickAction['origin']> {
  return isString(value) && quickActionOrigins.has(value as NonNullable<QuickAction['origin']>);
}

function isQuickActionBundledId(value: unknown): value is NonNullable<QuickAction['bundledId']> {
  return (
    isString(value) && bundledQuickActionIds.has(value as NonNullable<QuickAction['bundledId']>)
  );
}

function isQuickActionDelay(
  value: unknown
): value is Exclude<NonNullable<QuickAction['delay']>, undefined> {
  return (
    isNumber(value) &&
    quickActionDelays.has(value as Exclude<NonNullable<QuickAction['delay']>, undefined>)
  );
}

function isQuickActionAfterCapture(value: unknown): value is LegacyQuickActionAfterCapture {
  return (
    isString(value) && quickActionAfterCaptureValues.has(value as LegacyQuickActionAfterCapture)
  );
}

function isQuickActionImageFormat(
  value: unknown
): value is Exclude<NonNullable<QuickAction['imageFormat']>, undefined> {
  return (
    isString(value) &&
    quickActionImageFormats.has(
      value as Exclude<NonNullable<QuickAction['imageFormat']>, undefined>
    )
  );
}

function isQuickActionHotkey(value: unknown): value is NonNullable<QuickAction['hotkey']> {
  return (
    isRecord(value) &&
    isString(value['key']) &&
    isBoolean(value['ctrlKey']) &&
    isBoolean(value['shiftKey']) &&
    isBoolean(value['altKey']) &&
    isBoolean(value['metaKey'])
  );
}

function isStoredQuickAction(value: unknown): value is StoredQuickAction {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isBoolean(value['status']) &&
    isString(value['name']) &&
    isString(value['icon']) &&
    quickActionScreenshotModes.has(value['screenshotMode'] as QuickAction['screenshotMode']) &&
    isBoolean(value['exitAfterCapture']) &&
    hasOptionalField(value, 'origin', isQuickActionOrigin) &&
    hasOptionalField(
      value,
      'bundledId',
      (fieldValue) => fieldValue === null || isQuickActionBundledId(fieldValue)
    ) &&
    hasOptionalField(
      value,
      'hotkey',
      (fieldValue) => fieldValue === null || isQuickActionHotkey(fieldValue)
    ) &&
    hasOptionalField(
      value,
      'emulation',
      (fieldValue) => fieldValue === null || isString(fieldValue)
    ) &&
    hasOptionalField(
      value,
      'delay',
      (fieldValue) => fieldValue === null || isQuickActionDelay(fieldValue)
    ) &&
    hasOptionalField(
      value,
      'afterCapture',
      (fieldValue) => fieldValue === null || isQuickActionAfterCapture(fieldValue)
    ) &&
    hasOptionalField(
      value,
      'imageFormat',
      (fieldValue) => fieldValue === null || isQuickActionImageFormat(fieldValue)
    ) &&
    hasOptionalField(
      value,
      'imageQuality',
      (fieldValue) => fieldValue === null || isNumber(fieldValue)
    )
  );
}

function normalizeStoredQuickAction(action: StoredQuickAction): QuickAction {
  const normalizedAfterCapture =
    action.afterCapture === 'download' ? 'download_default' : action.afterCapture;
  const { afterCapture: _afterCapture, ...rest } = action;

  return {
    ...rest,
    ...(normalizedAfterCapture === undefined ? {} : { afterCapture: normalizedAfterCapture }),
  };
}

export function parseStoredQuickActions(value: unknown): ParsedQuickActionsStorageValue {
  if (value === undefined) {
    return { actions: [], hasInvalidRoot: false, invalidEntryCount: 0 };
  }

  if (!Array.isArray(value)) {
    return { actions: [], hasInvalidRoot: true, invalidEntryCount: 0 };
  }

  const actions = value.filter(isStoredQuickAction).map(normalizeStoredQuickAction);
  return {
    actions,
    hasInvalidRoot: false,
    invalidEntryCount: value.length - actions.length,
  };
}

export function parseStoredQuickActionsDisplayMode(
  value: unknown
): StoredQuickActionsDisplayMode | null {
  return value === 'hidden' || value === 'list' || value === 'row' ? value : null;
}
