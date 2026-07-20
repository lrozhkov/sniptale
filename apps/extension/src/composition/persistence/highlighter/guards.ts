import type { EffectMode, FocusSettings } from '../../../features/highlighter/contracts';
import { parseBorderPresetsFromStorage } from './border-preset';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';
import { parseDefaultBlurSettings } from './blur-settings';

interface ParsedValue {
  borderPresets?: ReturnType<typeof parseBorderPresetsFromStorage>['borderPresets'];
  defaultBorderPresetId?: string;
  defaultBlurSettings?: ReturnType<typeof parseDefaultBlurSettings>['value'];
  defaultEffectMode?: EffectMode;
  defaultFocusSettings?: Partial<FocusSettings>;
}

interface ParsedStorage {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  migratedLegacyBlurFormat: boolean;
  value: ParsedValue;
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

function parseDefaultFocusSettings(value: unknown): ParsedField {
  if (value === undefined) {
    return { value: {}, invalidFieldCount: 0 };
  }

  if (!isRecord(value)) {
    return { value: {}, invalidFieldCount: 1 };
  }

  const nextValue: Partial<FocusSettings> = {};
  let invalidFieldCount = 0;

  if (value['opacity'] === undefined || isNumber(value['opacity'])) {
    if (value['opacity'] !== undefined) nextValue.opacity = value['opacity'];
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

  if (!isRecord(value)) {
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

  return {
    value: {
      ...borderPresets.value,
      ...defaultBorderPresetId.value,
      ...defaultEffectMode.value,
      ...(parsedBlurSettings.value === undefined
        ? {}
        : { defaultBlurSettings: parsedBlurSettings.value }),
      ...defaultFocusSettings.value,
    },
    hasInvalidRoot: false,
    invalidFieldCount:
      borderPresets.invalidFieldCount +
      defaultBorderPresetId.invalidFieldCount +
      defaultEffectMode.invalidFieldCount +
      parsedBlurSettings.invalidFieldCount +
      defaultFocusSettings.invalidFieldCount,
    migratedLegacyBlurFormat: parsedBlurSettings.migratedLegacyBlurFormat,
  };
}
