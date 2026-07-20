type ApplyEffectInstanceErrorCode =
  | 'effectCatalogIntegrityFailure'
  | 'effectKindTargetMismatch'
  | 'effectProjectQuotaExceeded'
  | 'effectTargetMissing';

export class ApplyEffectInstanceError extends Error {
  readonly code: ApplyEffectInstanceErrorCode;

  constructor(code: ApplyEffectInstanceErrorCode) {
    super(`Effect instance apply failed: ${code}`);
    this.name = 'ApplyEffectInstanceError';
    this.code = code;
  }
}

export function failCatalogIntegrity(): never {
  throw new ApplyEffectInstanceError('effectCatalogIntegrityFailure');
}
