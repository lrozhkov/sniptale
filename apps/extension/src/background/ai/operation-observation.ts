import {
  admitStoredAIOperation,
  commitStoredAIOperation,
} from '../../composition/persistence/ai-settings/graph-mutations';
import type {
  AIOperationObservationBinding,
  AIOperationObservationToken,
  AIOperationObservationOutcome,
} from '../../composition/persistence/ai-settings/operation-observations';

/** Observes one admitted request without retaining payloads or changing its result on storage failure. */
export function createAIOperationObservation(options: {
  binding?: AIOperationObservationBinding | undefined;
  signal?: AbortSignal | undefined;
}) {
  let receipt: AIOperationObservationToken | null = null;
  let dispatched = false;
  return {
    admit: async () => {
      if (options.binding)
        receipt = await admitStoredAIOperation(options.binding).catch(() => null);
    },
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      dispatched = true;
      return globalThis.fetch(input, init);
    },
    observe: async (outcome: AIOperationObservationOutcome) => {
      if (!receipt || !dispatched || options.signal?.aborted) return;
      await commitStoredAIOperation(receipt, outcome).catch(() => undefined);
    },
  };
}
