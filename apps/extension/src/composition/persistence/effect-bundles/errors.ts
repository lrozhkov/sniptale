type EffectBundlePersistenceErrorCode =
  | 'catalogEntryInvalid'
  | 'catalogIntegrityFailure'
  | 'catalogQuotaExceeded';

export class EffectBundlePersistenceError extends Error {
  readonly code: EffectBundlePersistenceErrorCode;

  constructor(code: EffectBundlePersistenceErrorCode) {
    super(`Effect bundle persistence failed: ${code}`);
    this.name = 'EffectBundlePersistenceError';
    this.code = code;
  }
}
