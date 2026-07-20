import type { BlurSettings } from '../../../features/highlighter/contracts';
import { isStringLiteralValue } from '@sniptale/runtime-contracts/validation/string-literals';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';
import { isBlurStrokeStyle } from './blur-stroke-style';

type ParsedBlurSettings = {
  invalidFieldCount: number;
  migratedLegacyBlurFormat: boolean;
  value?: Partial<BlurSettings>;
};

type NumericBlurSettingKey = {
  [Key in keyof BlurSettings]-?: NonNullable<BlurSettings[Key]> extends number ? Key : never;
}[keyof BlurSettings];

const BLUR_TYPES = [
  'gaussian',
  'distortion',
  'pixelate',
  'solid',
] as const satisfies readonly BlurSettings['blurType'][];

function isBlurType(value: unknown): value is BlurSettings['blurType'] {
  return isStringLiteralValue(value, BLUR_TYPES);
}

export function parseDefaultBlurSettings(value: unknown): ParsedBlurSettings {
  if (value === undefined) {
    return { invalidFieldCount: 0, migratedLegacyBlurFormat: false };
  }

  if (!isRecord(value)) {
    return { invalidFieldCount: 1, migratedLegacyBlurFormat: false };
  }

  if ('format' in value && !('blurType' in value)) {
    return {
      value: parseLegacyDefaultBlurSettings(value),
      invalidFieldCount: 0,
      migratedLegacyBlurFormat: true,
    };
  }

  const parsed = parseModernDefaultBlurSettings(value);
  return { ...parsed, migratedLegacyBlurFormat: false };
}

function parseLegacyDefaultBlurSettings(value: Record<string, unknown>): Partial<BlurSettings> {
  const nextValue: Partial<BlurSettings> = { blurType: 'gaussian' };
  if (isNumber(value['amount'])) nextValue.amount = value['amount'];
  if (isBoolean(value['showBorder'])) nextValue.showBorder = value['showBorder'];
  return nextValue;
}

function parseModernDefaultBlurSettings(value: Record<string, unknown>): {
  invalidFieldCount: number;
  value: Partial<BlurSettings>;
} {
  const nextValue: Partial<BlurSettings> = {};
  let invalidFieldCount = 0;

  invalidFieldCount += assignParsedBlurCoreSettings(nextValue, value);
  invalidFieldCount += assignParsedBlurBorderSettings(nextValue, value);
  invalidFieldCount += assignOptionalNumber(nextValue, value, 'radius');
  invalidFieldCount += assignOptionalNumber(nextValue, value, 'shadow');
  invalidFieldCount += assignOptionalNumber(nextValue, value, 'strokeOpacity');

  return { value: nextValue, invalidFieldCount };
}

function assignParsedBlurCoreSettings(
  nextValue: Partial<BlurSettings>,
  value: Record<string, unknown>
): number {
  let invalidFieldCount = 0;
  invalidFieldCount += assignOptionalNumber(nextValue, value, 'amount');
  if (value['blurType'] === undefined || isBlurType(value['blurType'])) {
    if (value['blurType'] !== undefined) nextValue.blurType = value['blurType'];
  } else invalidFieldCount++;
  if (value['showBorder'] === undefined || isBoolean(value['showBorder'])) {
    if (value['showBorder'] !== undefined) nextValue.showBorder = value['showBorder'];
  } else invalidFieldCount++;
  return invalidFieldCount;
}

function assignParsedBlurBorderSettings(
  nextValue: Partial<BlurSettings>,
  value: Record<string, unknown>
): number {
  let invalidFieldCount = 0;
  if (value['borderPresetId'] === undefined || value['borderPresetId'] === null) {
    if (value['borderPresetId'] !== undefined) nextValue.borderPresetId = null;
  } else if (isString(value['borderPresetId'])) nextValue.borderPresetId = value['borderPresetId'];
  else invalidFieldCount++;
  if (value['strokeColor'] === undefined || isString(value['strokeColor'])) {
    if (value['strokeColor'] !== undefined) nextValue.strokeColor = value['strokeColor'];
  } else invalidFieldCount++;
  invalidFieldCount += assignOptionalNumber(nextValue, value, 'strokeWidth');
  if (value['strokeStyle'] === undefined || isBlurStrokeStyle(value['strokeStyle'])) {
    if (value['strokeStyle'] !== undefined) nextValue.strokeStyle = value['strokeStyle'];
  } else invalidFieldCount++;
  return invalidFieldCount;
}

function assignOptionalNumber(
  nextValue: Partial<BlurSettings>,
  value: Record<string, unknown>,
  key: NumericBlurSettingKey
): number {
  const nextFieldValue = value[key];
  if (nextFieldValue === undefined || isNumber(nextFieldValue)) {
    if (nextFieldValue !== undefined) nextValue[key] = nextFieldValue;
    return 0;
  }
  return 1;
}
