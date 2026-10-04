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
  let recovery: Promise<void> | null = null;
  const unsubscribe = deps.subscribeTermination(() => {
    generation += 1;
    admitted = false;
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
      await operation();
      if (current !== generation) throw new Error('Offscreen data connection changed');
      if (phase === 'admission') admitted = true;
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
        .then(() => run('recovery', deps.recover))
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
  return { ensureAdmission, requireAdmission, ensureAssets, dispose: unsubscribe };
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
  await offscreenDataReadiness.ensureAssets();
  const [{ reconcileRecordingCompletionOutbox }, { sendRuntimeMessage }] = await Promise.all([
    import('../recording/post-record-publication'),
    import('../../platform/runtime-messaging'),
  ]);
  await reconcileRecordingCompletionOutbox({ sendRuntimeMessage });
}
