import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

export { isNumber, isRecord, isString };

export function numberOr(value: unknown, fallback: number): number {
  return isNumber(value) ? value : fallback;
}

export function stringOr(value: unknown, fallback: string): string {
  return isString(value) ? value : fallback;
}

export function nullableStringOr(value: unknown, fallback: string | null): string | null {
  return value === null || isString(value) ? value : fallback;
}

function isOneOf<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[]
): value is TValue {
  return isString(value) && allowed.some((allowedValue) => allowedValue === value);
}

export function oneOfOr<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  fallback: TValue
): TValue {
  return isOneOf(value, allowed) ? value : fallback;
}
