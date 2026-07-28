import { createLogger } from '@sniptale/platform/observability/logger';
import { recoverOwnedCdpLease } from './cdp-backend';
import { createFullPagePageAgentTransport } from './page-agent-transport';
import { readStoredFullPageCaptureLease, releaseFullPageCaptureLease } from './session-lease';

const logger = createLogger({ namespace: 'BackgroundFullPageCaptureLifecycle' });

function isTerminalPageTargetError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes('no tab with id') ||
    normalized.includes('no frame with id') ||
    normalized.includes('no document with id') ||
    normalized.includes('frame was removed')
  );
}

export async function cleanupCapture(tabId: number): Promise<void> {
  const lease = await readStoredFullPageCaptureLease();
  if (!lease || lease.tabId !== tabId) return;
  const failures: unknown[] = [];
  let pageRestoreCompleted = false;
  let debuggerCleanupCompleted = lease.backendKind !== 'unattended-cdp';
  try {
    await createFullPagePageAgentTransport({
      documentId: lease.documentId,
      tabId,
    }).restore({
      jobId: lease.jobId,
      ownerToken: lease.ownerToken,
      runtimeGeneration: lease.runtimeGeneration,
    });
    pageRestoreCompleted = true;
  } catch (error) {
    if (isTerminalPageTargetError(error)) {
      pageRestoreCompleted = true;
      logger.warn('Interrupted full-page page target no longer exists', error);
    } else {
      failures.push(error);
      logger.warn('Failed to restore interrupted full-page page agent', error);
    }
  }
  if (lease.backendKind === 'unattended-cdp') {
    try {
      await recoverOwnedCdpLease(tabId, lease.ownerToken);
      debuggerCleanupCompleted = true;
    } catch (error) {
      failures.push(error);
      logger.warn('Failed to release interrupted full-page CDP lease', error);
    }
  }
  if (pageRestoreCompleted && debuggerCleanupCompleted) {
    try {
      await releaseFullPageCaptureLease(lease.ownerToken);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Interrupted full-page capture cleanup failed');
  }
}

export async function cleanupStoredFullPageCaptureLease(): Promise<void> {
  const lease = await readStoredFullPageCaptureLease();
  if (!lease) return;
  await cleanupCapture(lease.tabId);
}
