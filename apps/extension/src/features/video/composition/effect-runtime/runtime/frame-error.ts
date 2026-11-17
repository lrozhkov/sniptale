import type {
  EffectRuntimeErrorCode,
  EffectRuntimeFrameResult,
} from '../../../../../contracts/effect-runtime/types';

/** Carries the checked runtime code through composition without retaining frame identity. */
export class EffectRuntimeFrameError extends Error {
  constructor(readonly code: EffectRuntimeErrorCode) {
    super('Effect runtime frame failed.');
    this.name = 'EffectRuntimeFrameError';
  }

  static fromFailure(failure: Extract<EffectRuntimeFrameResult, { kind: 'error' }>) {
    return new EffectRuntimeFrameError(
      failure.code === 'circuitOpen' ? (failure.startupFailureCode ?? failure.code) : failure.code
    );
  }
}
