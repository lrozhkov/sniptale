import type {
  CaptureActionType,
  ContentToolbarDisplayMode,
  ContentToolbarPreferences,
  Settings,
} from '../../../contracts/settings';
import { isCaptureActionTypeValue } from '@sniptale/runtime-contracts/capture/action';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';
import { parseSavePresets, parseViewportPresets } from './array.guards.ts';
import { assignParsedContextMenuSettings } from './context-menu.guards.ts';

interface ParsedSettingsStorageValue {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  value: Partial<Settings>;
}

const INVALID_FIELD = Symbol('invalid-field');
const contentToolbarDisplayModes = new Set<ContentToolbarDisplayMode>(['horizontal', 'vertical']);
const imageFormats = new Set<Settings['imageFormat']>(['png', 'jpeg', 'webp']);

type ParsedFieldValue<TValue> = TValue | undefined | typeof INVALID_FIELD;

function parseOptionalBoolean(value: unknown): ParsedFieldValue<boolean> {
  if (value === undefined) {
    return undefined;
  }

  return isBoolean(value) ? value : INVALID_FIELD;
}

function parseOptionalNumber(value: unknown): ParsedFieldValue<number> {
  if (value === undefined) {
    return undefined;
  }

  return isNumber(value) ? value : INVALID_FIELD;
}

function parseOptionalNullableString(value: unknown): ParsedFieldValue<string | null> {
  if (value === undefined) {
    return undefined;
  }

  return value === null || isString(value) ? value : INVALID_FIELD;
}

function parseOptionalCaptureAction(value: unknown): ParsedFieldValue<CaptureActionType> {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'download') {
    return 'download_default';
  }

  return isCaptureActionTypeValue(value) ? value : INVALID_FIELD;
}

function parseOptionalToolbarDisplayMode(
  value: unknown
): ParsedFieldValue<ContentToolbarDisplayMode> {
  if (value === undefined) {
    return undefined;
  }

  return isString(value) && contentToolbarDisplayModes.has(value as ContentToolbarDisplayMode)
    ? (value as ContentToolbarDisplayMode)
    : INVALID_FIELD;
}

function parseOptionalImageFormat(value: unknown): ParsedFieldValue<Settings['imageFormat']> {
  if (value === undefined) {
    return undefined;
  }

  return isString(value) && imageFormats.has(value as Settings['imageFormat'])
    ? (value as Settings['imageFormat'])
    : INVALID_FIELD;
}

function parseOptionalContentToolbar(value: unknown): ParsedFieldValue<ContentToolbarPreferences> {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    return INVALID_FIELD;
  }

  const displayMode = parseOptionalToolbarDisplayMode(value['displayMode']);
  if (displayMode === INVALID_FIELD) {
    return INVALID_FIELD;
  }

  const position = value['position'];
  if (position !== undefined && position !== null) {
    if (!isRecord(position) || !isNumber(position['x']) || !isNumber(position['y'])) {
      return INVALID_FIELD;
    }
  }

  const parsedPosition =
    position === undefined || position === null
      ? null
      : {
          x: position['x'] as number,
          y: position['y'] as number,
        };

  return {
    displayMode: displayMode ?? 'horizontal',
    compactMenus: isBoolean(value['compactMenus']) ? value['compactMenus'] : false,
    position: parsedPosition,
  };
}

function assignParsedSettingsField<TKey extends keyof Settings>(
  target: Partial<Settings>,
  key: TKey,
  parsedField: ParsedFieldValue<Settings[TKey]>
): number {
  if (parsedField === INVALID_FIELD) {
    return 1;
  }

  if (parsedField !== undefined) {
    target[key] = parsedField;
  }

  return 0;
}

function parseDefaultPresetSettingsFields(
  value: Record<string, unknown>,
  nextValue: Partial<Settings>
): number {
  let invalidFieldCount = 0;

  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'defaultImagePresetId',
    parseOptionalNullableString(value['defaultImagePresetId'])
  );
  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'defaultVideoPresetId',
    parseOptionalNullableString(value['defaultVideoPresetId'])
  );
  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'defaultExportPresetId',
    parseOptionalNullableString(value['defaultExportPresetId'])
  );

  return invalidFieldCount;
}

function parsePrivacySettingsFields(
  value: Record<string, unknown>,
  nextValue: Partial<Settings>
): number {
  let invalidFieldCount = 0;

  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'authenticatedSnapshotAssetsEnabled',
    parseOptionalBoolean(value['authenticatedSnapshotAssetsEnabled'])
  );
  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'anonymousCrossOriginSnapshotAssetsEnabled',
    parseOptionalBoolean(value['anonymousCrossOriginSnapshotAssetsEnabled'])
  );
  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'skipWebSnapshotSaveDisclosure',
    parseOptionalBoolean(value['skipWebSnapshotSaveDisclosure'])
  );
  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'rawDiagnosticsEnabled',
    parseOptionalBoolean(value['rawDiagnosticsEnabled'])
  );

  return invalidFieldCount;
}

function parseScalarSettingsFields(
  value: Record<string, unknown>
): Pick<ParsedSettingsStorageValue, 'invalidFieldCount' | 'value'> {
  const nextValue: Partial<Settings> = {};
  let invalidFieldCount = 0;

  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'captureAction',
    parseOptionalCaptureAction(value['captureAction'])
  );
  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'contentToolbar',
    parseOptionalContentToolbar(value['contentToolbar'])
  );
  invalidFieldCount += assignParsedContextMenuSettings(nextValue, value['contextMenu']);
  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'saveCapturesToGallery',
    parseOptionalBoolean(value['saveCapturesToGallery'])
  );
  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'defaultViewportId',
    parseOptionalNullableString(value['defaultViewportId'])
  );
  invalidFieldCount += parseDefaultPresetSettingsFields(value, nextValue);
  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'imageFormat',
    parseOptionalImageFormat(value['imageFormat'])
  );
  invalidFieldCount += assignParsedSettingsField(
    nextValue,
    'imageQuality',
    parseOptionalNumber(value['imageQuality'])
  );
  invalidFieldCount += parsePrivacySettingsFields(value, nextValue);

  return { invalidFieldCount, value: nextValue };
}

function parseArraySettingsFields(
  value: Record<string, unknown>,
  nextValue: Partial<Settings>
): number {
  let invalidFieldCount = 0;

  const viewportPresets = parseViewportPresets(value['viewportPresets']);
  invalidFieldCount += viewportPresets.invalidEntryCount + (viewportPresets.hasInvalidRoot ? 1 : 0);
  if (viewportPresets.value !== undefined) {
    nextValue.viewportPresets = viewportPresets.value;
  }

  const savePresets = parseSavePresets(value['presets']);
  invalidFieldCount += savePresets.invalidEntryCount + (savePresets.hasInvalidRoot ? 1 : 0);
  if (savePresets.value !== undefined) {
    nextValue.presets = savePresets.value;
  }

  return invalidFieldCount;
}

export function parseStoredSettings(value: unknown): ParsedSettingsStorageValue {
  if (value === undefined) {
    return { value: {}, hasInvalidRoot: false, invalidFieldCount: 0 };
  }

  if (!isRecord(value)) {
    return { value: {}, hasInvalidRoot: true, invalidFieldCount: 0 };
  }

  const scalarFields = parseScalarSettingsFields(value);
  const invalidFieldCount =
    scalarFields.invalidFieldCount + parseArraySettingsFields(value, scalarFields.value);

  return {
    value: scalarFields.value,
    hasInvalidRoot: false,
    invalidFieldCount,
  };
}
