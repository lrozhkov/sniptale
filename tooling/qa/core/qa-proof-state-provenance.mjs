import { isOpaqueIdentifier } from '../runtime/observability/identifiers.mjs';

export function requireProducerRunId(producerRunId) {
  if (!isOpaqueIdentifier(producerRunId)) {
    throw new Error('QA proof state requires a valid producer run ID');
  }
  return producerRunId;
}

export function hasValidProducerRunId(state) {
  return isOpaqueIdentifier(state?.producerRunId);
}
