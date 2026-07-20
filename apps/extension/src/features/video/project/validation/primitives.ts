import {
  isBoolean,
  isNumber,
  isPlainRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';

export { isBoolean, isString };
export const isRecord = isPlainRecord;
export const isFiniteNumber = isNumber;

const MAX_VIDEO_PROJECT_ITEMS = 5_000;
export const MAX_VIDEO_PROJECT_DIMENSION = 16_384;
export const MAX_VIDEO_PROJECT_DURATION_SECONDS = 86_400;
export const MAX_VIDEO_PROJECT_FPS = 240;
const MAX_VIDEO_PROJECT_COORDINATE = MAX_VIDEO_PROJECT_DIMENSION * 4;
export const MAX_VIDEO_PROJECT_MEDIA_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_VIDEO_PROJECT_PLAYBACK_RATE = 16;
const MAX_VIDEO_PROJECT_SCALE = 4;
const MAX_VIDEO_PROJECT_VOLUME = 4;
const MAX_VIDEO_PROJECT_STYLE_SIZE = 2_048;
const MAX_VIDEO_PROJECT_TEXT_SIZE = 4_096;
const MAX_VIDEO_PROJECT_COLOR_LENGTH = 256;

export function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

export function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

export function isBoundedNumber(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

export function isUnitInterval(value: unknown): value is number {
  return isBoundedNumber(value, 0, 1);
}

export function isBoundedString(value: unknown, maxLength = MAX_VIDEO_PROJECT_TEXT_SIZE): boolean {
  return isString(value) && value.length <= maxLength && !hasDisallowedTextControlCharacter(value);
}

function hasDisallowedTextControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f)) {
      return true;
    }
  }
  return false;
}

export function isColorString(value: unknown): value is string {
  return (
    isString(value) &&
    isBoundedString(value, MAX_VIDEO_PROJECT_COLOR_LENGTH) &&
    value.trim().length > 0
  );
}

export function isCoordinate(value: unknown): value is number {
  return isBoundedNumber(value, -MAX_VIDEO_PROJECT_COORDINATE, MAX_VIDEO_PROJECT_COORDINATE);
}

export function isProjectDimension(value: unknown): value is number {
  return isBoundedNumber(value, 0, MAX_VIDEO_PROJECT_COORDINATE);
}

function isPositiveProjectDimension(value: unknown): value is number {
  return isBoundedNumber(value, Number.MIN_VALUE, MAX_VIDEO_PROJECT_COORDINATE);
}

export function isScale(value: unknown): value is number {
  return isBoundedNumber(value, 0.2, MAX_VIDEO_PROJECT_SCALE);
}

export function isPlaybackRate(value: unknown): value is number {
  return isBoundedNumber(value, 0.1, MAX_VIDEO_PROJECT_PLAYBACK_RATE);
}

export function isVolume(value: unknown): value is number {
  return isBoundedNumber(value, 0, MAX_VIDEO_PROJECT_VOLUME);
}

export function isStyleSize(value: unknown): value is number {
  return isBoundedNumber(value, 0, MAX_VIDEO_PROJECT_STYLE_SIZE);
}

export function isPositiveStyleSize(value: unknown): value is number {
  return isBoundedNumber(value, Number.MIN_VALUE, MAX_VIDEO_PROJECT_STYLE_SIZE);
}

export function isEnumValue(value: unknown, source: Record<string, string>): value is string {
  return isString(value) && Object.values(source).includes(value);
}

export function isBoundedArray<T>(
  value: unknown,
  guard: (entry: unknown) => boolean,
  maxItems = MAX_VIDEO_PROJECT_ITEMS
): value is T[] {
  return Array.isArray(value) && value.length <= maxItems && value.every(guard);
}

export function isNullable<T>(
  value: unknown,
  guard: (entry: unknown) => boolean
): value is T | null {
  return value === null || guard(value);
}

export function isPrimitiveRecord(
  value: unknown
): value is Record<string, string | number | boolean | null> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (entry) =>
        entry === null || isBoundedString(entry) || isFiniteNumber(entry) || isBoolean(entry)
    )
  );
}

export function isPoint(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && isCoordinate(value['x']) && isCoordinate(value['y']);
}

export function isRect(
  value: unknown
): value is { height: number; width: number; x: number; y: number } {
  return (
    isRecord(value) &&
    isCoordinate(value['x']) &&
    isCoordinate(value['y']) &&
    isPositiveProjectDimension(value['height']) &&
    isPositiveProjectDimension(value['width'])
  );
}
