import type {
  ErasureParticipantResult,
  LocalExtensionDataErasureOptions,
  LocalExtensionDataErasureResult,
} from '@sniptale/runtime-contracts/privacy-erasure/types';

import type { BackgroundRuntimeState } from '../runtime-state';
import type { PrivacyErasurePorts } from './ports';
import {
  createFailedCleanupParticipant,
  createShortCircuitedErasureResult,
  hasRequiredCleanupFailure,
  mergeCleanupResults,
} from './result';

interface PrivacyErasureRequest {
  options: LocalExtensionDataErasureOptions;
  state: BackgroundRuntimeState;
}

interface CleanupStep {
  cleanup(): Promise<readonly ErasureParticipantResult[]>;
  failureCode: string;
  fallbackId: string;
}

export class PrivacyErasureUseCase {
  private executionQueue: Promise<void> = Promise.resolve();

  constructor(private readonly ports: PrivacyErasurePorts) {}

  execute(request: PrivacyErasureRequest): Promise<LocalExtensionDataErasureResult> {
    const mediaExclusion = this.ports.media.reserveErasureExclusion();
    const diagnosticsExclusion = this.ports.diagnostics.reserveErasureExclusion();
    const nativeIngestionExclusion = this.ports.nativeIngestion.reserveErasureExclusion();
    const execution = this.executionQueue.then(async () => {
      try {
        await Promise.all([
          mediaExclusion.waitForActiveMutations(),
          diagnosticsExclusion.waitForActiveMutations(),
          nativeIngestionExclusion.waitForActiveMutations(),
        ]);
        return await this.executeWithMutationsExcluded(request);
      } finally {
        nativeIngestionExclusion.release();
        diagnosticsExclusion.release();
        mediaExclusion.release();
      }
    });
    this.executionQueue = execution.then(
      () => undefined,
      () => undefined
    );
    return execution;
  }

  private async executeWithMutationsExcluded(
    request: PrivacyErasureRequest
  ): Promise<LocalExtensionDataErasureResult> {
    const participants: ErasureParticipantResult[] = [];

    for (const step of createCleanupSteps(this.ports, request.state)) {
      participants.push(...(await runCleanupStep(step.cleanup, step.fallbackId, step.failureCode)));
      if (hasRequiredCleanupFailure(participants)) {
        return createShortCircuitedErasureResult(participants);
      }
    }

    try {
      return mergeCleanupResults(participants, await this.ports.storage.cleanup(request.options));
    } catch {
      return createShortCircuitedErasureResult([
        ...participants,
        createFailedCleanupParticipant('persistent-storage', 'storage-cleanup-failed'),
      ]);
    }
  }
}

function createCleanupSteps(
  ports: PrivacyErasurePorts,
  state: BackgroundRuntimeState
): readonly CleanupStep[] {
  return [
    createCleanupStep(() => ports.media.cleanup(), 'media-runtime-state', 'media-cleanup-failed'),
    createCleanupStep(
      () => ports.diagnostics.cleanup(),
      'diagnostics-runtime-state',
      'diagnostics-cleanup-failed'
    ),
    createCleanupStep(
      () => ports.nativeIngestion.cleanup(),
      'native-ingestion-runtime-state',
      'native-ingestion-cleanup-failed'
    ),
    createCleanupStep(
      () => ports.runtime.cleanup(state),
      'background-runtime-state',
      'runtime-cleanup-failed'
    ),
  ];
}

function createCleanupStep(
  cleanup: CleanupStep['cleanup'],
  fallbackId: string,
  failureCode: string
): CleanupStep {
  return { cleanup, failureCode, fallbackId };
}

async function runCleanupStep(
  cleanup: () => Promise<readonly ErasureParticipantResult[]>,
  fallbackId: string,
  failureCode: string
): Promise<readonly ErasureParticipantResult[]> {
  try {
    return await cleanup();
  } catch {
    return [createFailedCleanupParticipant(fallbackId, failureCode)];
  }
}
