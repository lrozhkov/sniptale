import type { SecretProtectionPort } from '../../../composition/persistence/secret-protection/model';
import {
  IMAGE_JOB_FAILURE_CODES,
  IMAGE_JOB_TIMEOUT_MS,
  type ImageJobStart,
  type ImageJobServerMessage,
  type ImageJobFailureCode,
} from '../../../contracts/ai/image';
import { createTextJobLifecycle } from '../llm/text-job-lifecycle';
import { authorizeImageJob } from './authorization';
import { resolveImageModelConfig } from './model-config';
import { requestImage } from './request';

interface Dependencies {
  authorize: typeof authorizeImageJob;
  resolveModel: typeof resolveImageModelConfig;
  request: typeof requestImage;
}

/** Owns one approved operation, incremental variants, cancellation and privacy-erasure drainage. */
export function createImageJobService(
  overrides: Partial<Dependencies> = {},
  protection?: SecretProtectionPort
) {
  const deps: Dependencies = {
    authorize: authorizeImageJob,
    resolveModel: resolveImageModelConfig,
    request: requestImage,
    ...overrides,
  };
  return createTextJobLifecycle<ImageJobStart, ImageJobServerMessage, number, ImageJobFailureCode>({
    timeoutMs: IMAGE_JOB_TIMEOUT_MS,
    failureCodes: IMAGE_JOB_FAILURE_CODES,
    progress: (request) => ({
      type: 'progress',
      requestId: request.requestId,
      phase: 'authorizing',
      variant: 0,
    }),
    result: (request, received) => ({ type: 'complete', requestId: request.requestId, received }),
    failure: (request, code) => ({ type: 'failure', requestId: request.requestId, code }),
    async run(request, sender, signal, send) {
      await deps.authorize(request, sender, signal);
      signal.throwIfAborted();
      const config = await deps.resolveModel(request, signal, protection);
      signal.throwIfAborted();
      let received = 0;
      for (let variant = 0; variant < request.context.parameters.variants; variant++) {
        signal.throwIfAborted();
        send({ type: 'progress', requestId: request.requestId, phase: 'requesting', variant });
        const result = await deps.request({
          config,
          context: request.context,
          signal,
          beforeSend: async () => {
            signal.throwIfAborted();
            const current = await deps.resolveModel(request, signal, protection);
            if (JSON.stringify(current) !== JSON.stringify(config)) throw new Error('stale');
            signal.throwIfAborted();
          },
        });
        signal.throwIfAborted();
        send({ type: 'image', requestId: request.requestId, variant, ...result });
        received++;
      }
      return received;
    },
  });
}
export type ImageJobService = ReturnType<typeof createImageJobService>;
