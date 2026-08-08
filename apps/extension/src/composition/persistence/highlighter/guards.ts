import type { EffectMode, FocusSettings } from '../../../features/highlighter/contracts';
import { parseBorderPresetsFromStorage } from './border-preset';
import { isBoolean, isNumber, isPlainRecord, isString } from '../infrastructure/guards/primitives';
import { parseDefaultBlurSettings } from './blur-settings';

interface ParsedHighlighterSettingsValue {
  borderPresets?: ReturnType<typeof parseBorderPresetsFromStorage>['borderPresets'];
  defaultBorderPresetId?: string;
  defaultBlurSettings?: ReturnType<typeof parseDefaultBlurSettings>['value'];
  defaultEffectMode?: EffectMode;
  defaultFocusSettings?: Partial<FocusSettings>;
  systemPresetCatalogRevision?: number;
  catalogCustomized?: boolean;
}

interface ParsedStorage {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  migratedLegacyBlurFormat: boolean;
  value: ParsedHighlighterSettingsValue;
}

type ParsedField = Pick<ParsedStorage, 'invalidFieldCount' | 'value'>;

const effectModes = new Set<EffectMode>(['border', 'blur', 'focus']);

function parseBorderPresets(value: unknown): ParsedField {
  const { borderPresets, invalidFieldCount } = parseBorderPresetsFromStorage(value);
  return {
    value: borderPresets === undefined ? {} : { borderPresets },
    invalidFieldCount,
  };
}

function parseDefaultBorderPresetId(value: unknown): ParsedField {
  if (value === undefined) {
    return { value: {}, invalidFieldCount: 0 };
  }

  return isString(value)
    ? { value: { defaultBorderPresetId: value }, invalidFieldCount: 0 }
    : { value: {}, invalidFieldCount: 1 };
}

function parseDefaultEffectMode(value: unknown): ParsedField {
  if (value === undefined) {
    return { value: {}, invalidFieldCount: 0 };
  }

  return isString(value) && effectModes.has(value as EffectMode)
    ? { value: { defaultEffectMode: value as EffectMode }, invalidFieldCount: 0 }
    : { value: {}, invalidFieldCount: 1 };
}

function parseCatalogMetadata(value: Record<string, unknown>): ParsedField {
  const parsed: Pick<
    ParsedHighlighterSettingsValue,
    'catalogCustomized' | 'systemPresetCatalogRevision'
  > = {};
  let invalidFieldCount = 0;

  if (value['systemPresetCatalogRevision'] !== undefined) {
    if (isNonNegativeInteger(value['systemPresetCatalogRevision'])) {
      parsed.systemPresetCatalogRevision = value['systemPresetCatalogRevision'];
    } else {
      invalidFieldCount++;
    }
  }
  if (value['catalogCustomized'] !== undefined) {
    if (isBoolean(value['catalogCustomized'])) {
      parsed.catalogCustomized = value['catalogCustomized'];
    } else {
      invalidFieldCount++;
    }
  }

  return { value: parsed, invalidFieldCount };
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function parseDefaultFocusSettings(value: unknown): ParsedField {
  if (value === undefined) {
    return { value: {}, invalidFieldCount: 0 };
  }

  if (!isPlainRecord(value)) {
    return { value: {}, invalidFieldCount: 1 };
  }

  const nextValue: Partial<FocusSettings> = {};
  let invalidFieldCount = 0;

  if (
    value['opacity'] === undefined ||
    (isNumber(value['opacity']) && value['opacity'] >= 0 && value['opacity'] <= 1)
  ) {
    if (value['opacity'] !== undefined) nextValue.opacity = value['opacity'];
  } else {
    invalidFieldCount++;
  }

  if (
    value['blurAmount'] === undefined ||
    (isNumber(value['blurAmount']) && value['blurAmount'] >= 0 && value['blurAmount'] <= 25)
  ) {
    if (value['blurAmount'] !== undefined) nextValue.blurAmount = value['blurAmount'];
  } else {
    invalidFieldCount++;
  }

  if (value['showBorder'] === undefined || isBoolean(value['showBorder'])) {
    if (value['showBorder'] !== undefined) nextValue.showBorder = value['showBorder'];
  } else {
    invalidFieldCount++;
  }

  return {
    value: { defaultFocusSettings: nextValue },
    invalidFieldCount,
  };
}

export function parseStoredHighlighterSettings(value: unknown): ParsedStorage {
  if (value === undefined) {
    return {
      value: {},
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      migratedLegacyBlurFormat: false,
    };
  }

  if (!isPlainRecord(value)) {
    return {
      value: {},
      hasInvalidRoot: true,
      invalidFieldCount: 0,
      migratedLegacyBlurFormat: false,
    };
  }

  const borderPresets = parseBorderPresets(value['borderPresets']);
  const defaultBorderPresetId = parseDefaultBorderPresetId(value['defaultBorderPresetId']);
  const defaultEffectMode = parseDefaultEffectMode(value['defaultEffectMode']);
  const parsedBlurSettings = parseDefaultBlurSettings(value['defaultBlurSettings']);
  const defaultFocusSettings = parseDefaultFocusSettings(value['defaultFocusSettings']);
  const catalogMetadata = parseCatalogMetadata(value);

  return {
    value: {
      ...borderPresets.value,
      ...defaultBorderPresetId.value,
      ...defaultEffectMode.value,
      ...(parsedBlurSettings.value === undefined
        ? {}
        : { defaultBlurSettings: parsedBlurSettings.value }),
      ...defaultFocusSettings.value,
      ...catalogMetadata.value,
    },
    hasInvalidRoot: false,
    invalidFieldCount:
      borderPresets.invalidFieldCount +
      defaultBorderPresetId.invalidFieldCount +
      defaultEffectMode.invalidFieldCount +
      parsedBlurSettings.invalidFieldCount +
      defaultFocusSettings.invalidFieldCount +
      catalogMetadata.invalidFieldCount,
    migratedLegacyBlurFormat: parsedBlurSettings.migratedLegacyBlurFormat,
  };
}
