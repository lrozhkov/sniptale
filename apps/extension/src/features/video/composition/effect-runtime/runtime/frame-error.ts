import type { EffectRuntimeErrorCode } from '../../../../../contracts/effect-runtime/types';

/** Carries the checked runtime code through composition without retaining frame identity. */
export class EffectRuntimeFrameError extends Error {
  constructor(readonly code: EffectRuntimeErrorCode) {
    super('Effect runtime frame failed.');
    this.name = 'EffectRuntimeFrameError';
  }
}
