import { containsUnsafeCssSyntax } from '@sniptale/platform/security/css-safety';
import { SCENARIO_V3_LIMITS } from './limits';

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;
const NUMBER_PATTERN = '(?:\\d+|\\d*\\.\\d+)';
const RGB_LEGACY_PATTERN = new RegExp(
  `^rgba?\\(\\s*(${NUMBER_PATTERN}%?)\\s*,\\s*(${NUMBER_PATTERN}%?)\\s*,\\s*` +
    `(${NUMBER_PATTERN}%?)(?:\\s*,\\s*(${NUMBER_PATTERN}%?))?\\s*\\)$`,
  'iu'
);
const RGB_SPACE_PATTERN = new RegExp(
  `^rgba?\\(\\s*(${NUMBER_PATTERN}%?)\\s+(${NUMBER_PATTERN}%?)\\s+` +
    `(${NUMBER_PATTERN}%?)(?:\\s*\\/\\s*(${NUMBER_PATTERN}%?))?\\s*\\)$`,
  'iu'
);
const HSL_LEGACY_PATTERN = new RegExp(
  `^hsla?\\(\\s*(${NUMBER_PATTERN})(?:deg|rad|turn)?\\s*,\\s*(${NUMBER_PATTERN}%)\\s*,\\s*` +
    `(${NUMBER_PATTERN}%)(?:\\s*,\\s*(${NUMBER_PATTERN}%?))?\\s*\\)$`,
  'iu'
);
const HSL_SPACE_PATTERN = new RegExp(
  `^hsla?\\(\\s*(${NUMBER_PATTERN})(?:deg|rad|turn)?\\s+(${NUMBER_PATTERN}%)\\s+` +
    `(${NUMBER_PATTERN}%)(?:\\s*\\/\\s*(${NUMBER_PATTERN}%?))?\\s*\\)$`,
  'iu'
);

function parseNumericToken(value: string): number | null {
  const parsed = Number(value.endsWith('%') ? value.slice(0, -1) : value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRangeToken(value: string | undefined, min: number, max: number): boolean {
  if (value === undefined) {
    return true;
  }

  const parsed = parseNumericToken(value);
  return parsed !== null && parsed >= min && parsed <= max;
}

function isRgbChannel(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  return value.endsWith('%') ? isRangeToken(value, 0, 100) : isRangeToken(value, 0, 255);
}

function isAlpha(value: string | undefined): boolean {
  return (
    value === undefined ||
    (value.endsWith('%') ? isRangeToken(value, 0, 100) : isRangeToken(value, 0, 1))
  );
}

function isRgbColor(value: string): boolean {
  const match = RGB_LEGACY_PATTERN.exec(value) ?? RGB_SPACE_PATTERN.exec(value);
  return (
    match !== null &&
    isRgbChannel(match[1]) &&
    isRgbChannel(match[2]) &&
    isRgbChannel(match[3]) &&
    isAlpha(match[4])
  );
}

function isHslColor(value: string): boolean {
  const match = HSL_LEGACY_PATTERN.exec(value) ?? HSL_SPACE_PATTERN.exec(value);
  return (
    match !== null &&
    isRangeToken(match[1], 0, 360) &&
    isRangeToken(match[2], 0, 100) &&
    isRangeToken(match[3], 0, 100) &&
    isAlpha(match[4])
  );
}

export function isScenarioColorToken(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > SCENARIO_V3_LIMITS.maxColorLength ||
    value.trim() !== value ||
    containsUnsafeCssSyntax(value)
  ) {
    return false;
  }

  return (
    value === 'transparent' ||
    HEX_COLOR_PATTERN.test(value) ||
    isRgbColor(value) ||
    isHslColor(value)
  );
}

export function resolveScenarioColorToken(value: string, fallback: string): string {
  return isScenarioColorToken(value) ? value : fallback;
}
