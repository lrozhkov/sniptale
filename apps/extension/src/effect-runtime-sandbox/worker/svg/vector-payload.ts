import type {
  SerializedSvgVector,
  SerializedSvgVectorPart,
} from '../../../contracts/effect-runtime/svg-vector';
import {
  EFFECT_SVG_VECTOR_LIMITS,
  getSerializedSvgVectorPartCharacterCount,
} from '../../../contracts/effect-runtime/svg-vector';

export type {
  SerializedSvgVector,
  SerializedSvgVectorPart,
} from '../../../contracts/effect-runtime/svg-vector';

type CommonSvgPart = Omit<
  SerializedSvgVectorPart,
  'height' | 'pathData' | 'rx' | 'type' | 'width' | 'x' | 'y'
>;
type CommonSvgPartNumbers = Pick<CommonSvgPart, 'cx' | 'cy' | 'opacity' | 'strokeWidth'>;
type CommonSvgPartStrings = Omit<CommonSvgPart, keyof CommonSvgPartNumbers>;

export function parseSerializedSvgVector(value: unknown): SerializedSvgVector | null {
  if (!isRecord(value)) {
    return null;
  }
  const width = readPositiveNumber(value['width']);
  const height = readPositiveNumber(value['height']);
  if (
    width === null ||
    height === null ||
    !Array.isArray(value['parts']) ||
    value['parts'].length > EFFECT_SVG_VECTOR_LIMITS.maxParts
  ) {
    return null;
  }
  const parts: SerializedSvgVectorPart[] = [];
  let serializedCharacters = 0;
  for (const valuePart of value['parts']) {
    const part = parsePart(valuePart);
    if (!part) {
      return null;
    }
    serializedCharacters += getSerializedSvgVectorPartCharacterCount(part);
    if (serializedCharacters > EFFECT_SVG_VECTOR_LIMITS.maxSerializedStringCharacters) {
      return null;
    }
    parts.push(part);
  }
  return { height, parts, width };
}

function parsePart(value: unknown): SerializedSvgVectorPart | null {
  if (!isRecord(value) || (value['type'] !== 'path' && value['type'] !== 'rect')) {
    return null;
  }
  const common = parseCommonPart(value);
  if (!common) return null;
  if (value['type'] === 'path') {
    const pathData = readString(value['pathData'], EFFECT_SVG_VECTOR_LIMITS.maxPathDataCharacters);
    return pathData === null ? null : { ...common, pathData, type: 'path' };
  }
  const x = readFiniteNumber(value['x']);
  const y = readFiniteNumber(value['y']);
  const width = readFiniteNumber(value['width']);
  const height = readFiniteNumber(value['height']);
  const rx = readFiniteNumber(value['rx']);
  return x === null || y === null || width === null || height === null || rx === null
    ? null
    : { ...common, height, rx, type: 'rect', width, x, y };
}

function parseCommonPart(value: Record<string, unknown>): CommonSvgPart | null {
  const strings = parseCommonPartStrings(value);
  const numbers = parseCommonPartNumbers(value);
  return strings && numbers ? { ...strings, ...numbers } : null;
}

function parseCommonPartStrings(value: Record<string, unknown>): CommonSvgPartStrings | null {
  const id = readString(value['id'], EFFECT_SVG_VECTOR_LIMITS.maxCommonStringCharacters);
  const groupId = readNullableString(
    value['groupId'],
    EFFECT_SVG_VECTOR_LIMITS.maxCommonStringCharacters
  );
  const groupIds = readStringArray(
    value['groupIds'],
    EFFECT_SVG_VECTOR_LIMITS.maxGroupDepth,
    EFFECT_SVG_VECTOR_LIMITS.maxCommonStringCharacters
  );
  const fill = readNullableString(
    value['fill'],
    EFFECT_SVG_VECTOR_LIMITS.maxCommonStringCharacters
  );
  const stroke = readNullableString(
    value['stroke'],
    EFFECT_SVG_VECTOR_LIMITS.maxCommonStringCharacters
  );
  const strokeLineCap = readString(
    value['strokeLineCap'],
    EFFECT_SVG_VECTOR_LIMITS.maxLineStyleCharacters
  );
  const strokeLineJoin = readString(
    value['strokeLineJoin'],
    EFFECT_SVG_VECTOR_LIMITS.maxLineStyleCharacters
  );
  if (
    id === null ||
    groupId === undefined ||
    groupIds === null ||
    fill === undefined ||
    stroke === undefined ||
    strokeLineCap === null ||
    strokeLineJoin === null
  ) {
    return null;
  }
  return {
    fill,
    groupId,
    groupIds,
    id,
    stroke,
    strokeLineCap,
    strokeLineJoin,
  };
}

function parseCommonPartNumbers(value: Record<string, unknown>): CommonSvgPartNumbers | null {
  const cx = readFiniteNumber(value['cx']);
  const cy = readFiniteNumber(value['cy']);
  const opacity = readFiniteNumber(value['opacity']);
  const strokeWidth = readFiniteNumber(value['strokeWidth']);
  return cx === null || cy === null || opacity === null || strokeWidth === null
    ? null
    : { cx, cy, opacity, strokeWidth };
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPositiveNumber(value: unknown): number | null {
  const number = readFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function readString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length <= maxLength ? value : null;
}

function readNullableString(value: unknown, maxLength: number): string | null | undefined {
  return value === null ? null : (readString(value, maxLength) ?? undefined);
}

function readStringArray(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.length > maxLength) return null;
    result.push(item);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
