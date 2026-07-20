import { createIndexedDbStateDomainAdapter } from '../../../composition/persistence/infrastructure/indexed-db/state-manager-adapter';
import { stateManager } from '../../../composition/persistence/infrastructure/state-manager';
import { captureJobPolicyState, createCaptureJobService, type CaptureJobService } from './service';
import { CAPTURE_JOB_DOMAIN, createStateManagerCaptureJobStore } from './store';

const CAPTURE_JOB_RUNTIME_GENERATION = crypto.randomUUID();

let defaultCaptureJobService: CaptureJobService | null = null;

export function getDefaultCaptureJobService(): CaptureJobService {
  if (!defaultCaptureJobService) {
    stateManager.registerDomain(CAPTURE_JOB_DOMAIN, {
      adapter: createIndexedDbStateDomainAdapter(CAPTURE_JOB_DOMAIN),
      description: `${CAPTURE_JOB_DOMAIN}:${captureJobPolicyState.policyStateId}`,
    });
    defaultCaptureJobService = createCaptureJobService({
      runtimeGeneration: CAPTURE_JOB_RUNTIME_GENERATION,
      store: createStateManagerCaptureJobStore({ stateManager }),
    });
  }
  return defaultCaptureJobService;
}
