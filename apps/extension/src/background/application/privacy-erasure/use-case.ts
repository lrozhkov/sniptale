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
    const exclusions = reserveErasureExclusions(this.ports);
    const {
      audioExclusion,
      mediaExclusion,
      diagnosticsExclusion,
      nativeIngestionExclusion,
      pageRecoveryExclusion,
      popupExportExclusion,
      syncExclusion,
    } = exclusions;
    const execution = this.executionQueue.then(async () => {
      try {
        try {
          await syncExclusion.quiesce();
        } catch {
          return createShortCircuitedErasureResult([
            createFailedCleanupParticipant('sync-runtime-state', 'sync-quiescence-failed'),
          ]);
        }
        try {
          await this.ports.audioJobs.cancelActiveJob();
          await this.ports.popupExport.cancelActiveJob();
        } catch {
          return createShortCircuitedErasureResult([
            createFailedCleanupParticipant(
              'page-package-job-runtime-state',
              'page-package-cancel-failed'
            ),
          ]);
        }
        await Promise.all([
          audioExclusion.waitForActiveMutations(),
          mediaExclusion.waitForActiveMutations(),
          diagnosticsExclusion.waitForActiveMutations(),
          nativeIngestionExclusion.waitForActiveMutations(),
          popupExportExclusion.waitForActiveMutations(),
          pageRecoveryExclusion.waitForActiveMutations(),
        ]);
        return await this.executeWithMutationsExcluded(request);
      } finally {
        exclusions.release();
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

function reserveErasureExclusions(ports: PrivacyErasurePorts) {
  const reservations: Array<{ release(): void }> = [];
  function reserve<T extends { release(): void }>(reservation: T): T {
    reservations.push(reservation);
    return reservation;
  }
  function release() {
    for (const reservation of [...reservations].reverse()) reservation.release();
  }
  try {
    return {
      syncExclusion: reserve(ports.sync.reserveErasureExclusion()),
      audioExclusion: reserve(ports.audioJobs.reserveErasureExclusion()),
      mediaExclusion: reserve(ports.media.reserveErasureExclusion()),
      diagnosticsExclusion: reserve(ports.diagnostics.reserveErasureExclusion()),
      nativeIngestionExclusion: reserve(ports.nativeIngestion.reserveErasureExclusion()),
      pageRecoveryExclusion: reserve(ports.pageRecovery.reserveErasureExclusion()),
      popupExportExclusion: reserve(ports.popupExport.reserveErasureExclusion()),
      release,
    };
  } catch (error) {
    release();
    throw error;
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
      () => ports.pageRecovery.cleanup(),
      'page-recovery-runtime-state',
      'page-recovery-cleanup-failed'
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
