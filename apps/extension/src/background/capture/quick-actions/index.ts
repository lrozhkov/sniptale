import { createLogger } from '@sniptale/platform/observability/logger';
import { processQuickAction } from './flow/process';
import { assertQuickActionSupported } from './capability';
import { notifyDuplicateCapture, notifyQuickActionError } from './notifications';
import type { HandleQuickActionArgs } from './types';
import { classifyTabRuntimeCapability } from '../../../features/tab-capabilities/runtime';

const logger = createLogger({ namespace: 'BackgroundQuickActions' });

type QuickActionResult =
  | { result: 'accepted' | 'blocked' | 'cancelled' | 'duplicate' }
  | { error: string; result: 'failed' };

export async function handleQuickAction({
  actionId,
  tabId,
  tab,
  viewportState,
  screenshotModeState,
  captureGuardState,
  desktopSelection,
  pageAccessPort,
  webSnapshotViewerPorts,
  runtimeContext,
}: HandleQuickActionArgs): Promise<QuickActionResult> {
  logger.log('Handling quick action', { actionId, tabId });

  if (captureGuardState.isCapturing) {
    logger.warn('Capture already in progress, ignoring quick action', { actionId, tabId });
    notifyDuplicateCapture(tabId);
    return { result: 'duplicate' };
  }

  if (runtimeContext?.captureMode !== 'desktop') {
    try {
      assertQuickActionSupported(actionId, tabId, tab);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), result: 'failed' };
    }
  }
  const pageCapability = classifyTabRuntimeCapability(tab);

  captureGuardState.isCapturing = true;

  try {
    const processArgs = {
      actionId,
      tabId,
      viewportState,
      screenshotModeState,
      pageCapability,
      pageAccessPort,
      webSnapshotViewerPorts,
      ...(runtimeContext ? { runtimeContext } : {}),
      ...(desktopSelection === undefined ? {} : { desktopSelection }),
    };
    return await processQuickAction(processArgs);
  } catch (error) {
    logger.error('Quick action failed', error);
    if (runtimeContext?.captureMode !== 'desktop') {
      notifyQuickActionError(tabId, error);
    }
    return { error: error instanceof Error ? error.message : String(error), result: 'failed' };
  } finally {
    captureGuardState.isCapturing = false;
  }
}
