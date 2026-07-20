export const INVALID_FIELD = Symbol('invalid-field');

export type ParsedFieldValue<TValue> = TValue | undefined | typeof INVALID_FIELD;
