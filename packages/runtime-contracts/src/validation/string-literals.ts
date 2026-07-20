export function isStringLiteralValue<TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[]
): value is TValue {
  return typeof value === 'string' && (allowedValues as readonly string[]).includes(value);
}

export function isStringEnumValue<TValue extends string>(
  value: unknown,
  source: Readonly<Record<string, TValue>>
): value is TValue {
  return isStringLiteralValue(value, Object.values(source));
}
