import { runStorageStartupPhase } from '../../composition/persistence/infrastructure/startup-diagnostics';
import {
  initDB,
  subscribeToDbTermination,
} from '../../composition/persistence/infrastructure/indexed-db/core';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'OffscreenDataReadiness' });

type Dependencies = {
  admit: () => Promise<unknown>;
  recover: () => Promise<unknown>;
  subscribeTermination: (listener: () => void) => () => void;
};

/** Data admission is shared, retryable and scoped to one live database connection. */
export function createOffscreenDataReadiness(deps: Dependencies) {
  let generation = 0;
  let admission: Promise<void> | null = null;
  let admitted = false;
  let assetsReady = false;
  let recovery: Promise<void> | null = null;
  const unsubscribe = deps.subscribeTermination(() => {
    generation += 1;
    admitted = false;
    assetsReady = false;
    admission = null;
    recovery = null;
  });
  async function run(
    phase: 'admission' | 'recovery',
    operation: () => Promise<unknown>
  ): Promise<void> {
    const current = generation;
    const start = performance.now();
    try {
      await runStorageStartupPhase(
        phase === 'admission' ? 'offscreen-data-admission' : 'offscreen-data-recovery',
        operation
      );
      if (current !== generation) throw new Error('Offscreen data connection changed');
      if (phase === 'admission') admitted = true;
      else assetsReady = true;
      logger.debug('Data readiness completed', {
        phase,
        durationMs: Math.round(performance.now() - start),
      });
    } catch (error) {
      logger.warn('Data readiness failed', {
        phase,
        durationMs: Math.round(performance.now() - start),
      });
      throw error;
    }
  }
  function ensureAdmission(): Promise<void> {
    if (!admission) {
      const pending = run('admission', deps.admit).catch((error) => {
        if (admission === pending) admission = null;
        throw error;
      });
      admission = pending;
    }
    return admission;
  }
  function ensureAssets(): Promise<void> {
    if (!recovery) {
      const pending = ensureAdmission()
        .then(() => {
          requireAdmission();
          return run('recovery', deps.recover);
        })
        .catch((error) => {
          if (recovery === pending) recovery = null;
          throw error;
        });
      recovery = pending;
    }
    return recovery;
  }
  function requireAdmission(): void {
    if (!admitted) throw new Error('Offscreen data is not admitted');
  }
  function requireAssets(): void {
    if (!admitted || !assetsReady) throw new Error('Offscreen assets are not prepared');
  }
  return { ensureAdmission, requireAdmission, ensureAssets, requireAssets, dispose: unsubscribe };
}

export const offscreenDataReadiness = createOffscreenDataReadiness({
  admit: initDB,
  recover: async () => {
    const { recoverPendingAssetPublications } =
      await import('../../composition/persistence/asset-publication-recovery');
    await recoverPendingAssetPublications();
  },
  subscribeTermination: subscribeToDbTermination,
});

/** Replay the previous durable completion before admitting another recording writer. */
export async function prepareOffscreenRecordingData(): Promise<void> {
  await offscreenDataReadiness.ensureAdmission();
  const [{ reconcileRecordingCompletionOutbox }, { sendRuntimeMessage }] =
    await runStorageStartupPhase('recording-outbox-import', () =>
      Promise.all([
        import('../recording/post-record-publication'),
        import('../../platform/runtime-messaging'),
      ])
    );
  await runStorageStartupPhase('recording-outbox-reconcile', () =>
    reconcileRecordingCompletionOutbox({ sendRuntimeMessage })
  );
}
