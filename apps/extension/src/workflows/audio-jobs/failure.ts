import type { AudioJobFailureCode } from '../../contracts/ai/audio';
import type { AIConnectionReason } from '../../contracts/settings/ai-catalog';

/** Retains admitted provider evidence while preserving the existing local audio error code. */
export class AudioJobProviderError extends Error {
  constructor(
    readonly reason: AIConnectionReason,
    code: AudioJobFailureCode
  ) {
    super(code);
    this.name = 'AudioJobProviderError';
  }
}

const LOCAL_REASONS: Partial<Record<AudioJobFailureCode, AIConnectionReason>> = {
  'network-failed': 'network',
  timeout: 'timeout',
  'model-unavailable': 'model-unavailable',
  'permission-denied': 'host-permission-required',
  'secret-unavailable': 'secret-locked',
  'provider-rate-limit': 'rate-limited',
};

/** Local codes with ambiguous causes retain generic feedback. Caller cancellation remains distinct. */
export function createAudioJobFailure(
  code: AudioJobFailureCode,
  reason?: AIConnectionReason
): Error {
  const evidence = reason ?? LOCAL_REASONS[code];
  return evidence ? new AudioJobProviderError(evidence, code) : new Error(code);
}
