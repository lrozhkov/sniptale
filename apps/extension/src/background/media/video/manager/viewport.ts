import {
  CaptureMode,
  type VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import { awaitBestEffort } from '@sniptale/foundation/best-effort';
import { createLogger } from '@sniptale/platform/observability/logger';
import { armDebuggerActivation } from '../../../debugger/session/activation';
import { attachDebugger } from '../../../debugger/session/attach';
import { detachDebugger } from '../../../debugger/session/detach';
import {
  clearViewport,
  resetZoom,
  setViewport,
  type ViewportEmulationResult,
} from '../../../debugger/workspace';

const logger = createLogger({ namespace: 'BackgroundVideoViewport' });
const VIEWPORT_EMULATION_SETUP_DELAY_MS = 200;

export async function configureViewportEmulation(
  tabId: number,
  captureMode: CaptureMode,
  viewportPreset?: VideoViewportPresetSelection
): Promise<ViewportEmulationResult | undefined> {
  if (captureMode !== CaptureMode.VIEWPORT_EMULATION || !viewportPreset) {
    return undefined;
  }

  try {
    logger.log('Attaching CDP for VIEWPORT_EMULATION (before countdown)');
    await attachDebugger(
      tabId,
      'video-emulation',
      armDebuggerActivation({ client: 'video-emulation', reason: 'video-viewport-setup', tabId })
    );

    await new Promise((resolve) => setTimeout(resolve, VIEWPORT_EMULATION_SETUP_DELAY_MS));
    await resetZoom(tabId);

    const viewportEmulationResult = await setViewport(
      tabId,
      viewportPreset.width,
      viewportPreset.height
    );
    logger.log('CDP viewport set with emulation result', {
      preset: viewportPreset,
      emulation: viewportEmulationResult,
    });

    return viewportEmulationResult;
  } catch (error) {
    await awaitBestEffort(
      detachDebugger(tabId, 'video-emulation'),
      logger,
      'Failed to detach viewport emulation debugger after setup error',
      { tabId }
    );
    throw error;
  }
}

export async function cleanupViewportEmulation(tabId: number, reason: string): Promise<void> {
  await awaitBestEffort(
    clearViewport(tabId),
    logger,
    'Failed to clear viewport emulation after setup cancellation',
    { tabId, reason }
  );
  await awaitBestEffort(
    detachDebugger(tabId, 'video-emulation'),
    logger,
    'Failed to detach viewport emulation debugger after setup cancellation',
    { tabId, reason }
  );
}
