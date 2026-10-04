import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'LibraryAssetMaintenance' });

/** Run one cancellable pass after Gallery has rendered; never gate its snapshot or capture startup. */
export async function maintainLibraryAssets(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 16));
  if (signal.aborted) return;
  const start = performance.now();
  try {
    const { collectOrphanAssetObjectsDuringIdle } =
      await import('../../composition/persistence/asset-publication-recovery/audit');
    if (signal.aborted) return;
    await collectOrphanAssetObjectsDuringIdle(signal);
    logger.debug('Library maintenance completed', {
      durationMs: Math.round(performance.now() - start),
    });
  } catch {
    if (!signal.aborted) logger.warn('Library maintenance deferred');
  }
}
