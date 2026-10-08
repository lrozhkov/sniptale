import { createSecureRandomUuid } from './secure-random-id';
import {
  RUNTIME_MESSAGE_FRESHNESS_FIELD,
  type RuntimeMessageFreshness,
} from '@sniptale/runtime-contracts/protocol/runtime-message-freshness';

export {
  RUNTIME_MESSAGE_FRESHNESS_FIELD,
  splitRuntimeMessageFreshness,
  stripRuntimeMessageFreshness,
} from '@sniptale/runtime-contracts/protocol/runtime-message-freshness';
export type { RuntimeMessageFreshness } from '@sniptale/runtime-contracts/protocol/runtime-message-freshness';

function createNonce(): string {
  return createSecureRandomUuid('Runtime message nonce generation is unavailable.');
}

export function createRuntimeMessageFreshness(nowEpochMs = Date.now()): RuntimeMessageFreshness {
  return {
    issuedAtEpochMs: nowEpochMs,
    nonce: createNonce(),
  };
}

export function attachRuntimeMessageFreshness<TMessage extends object>(
  message: TMessage,
  freshness = createRuntimeMessageFreshness()
): TMessage & { [RUNTIME_MESSAGE_FRESHNESS_FIELD]: RuntimeMessageFreshness } {
  return {
    ...message,
    [RUNTIME_MESSAGE_FRESHNESS_FIELD]: freshness,
  };
}
