import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createLogger } from '@sniptale/platform/observability/logger';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { createContentRuntimeMessageListener } from './bridge';
import { createRegionSelectorController } from '../selection/region-selector';
import { disableHighlighterMode } from '../selection/highlighter';
import { disableAiPickModeIfLoaded } from '../overlay/ai/pick/runtime/lazy';
import { disableQuickEditMode } from '../selection/quick-edit';
import {
  disposePageStyleRuntime,
  initializePageStyleRuntime,
} from '../selection/quick-edit/page-style';
import { disableSelectionMode } from '../selection/selection-mode';
import { hideVideoCountdown } from '../overlay/video-countdown';
import { disableVideoAnnotations } from '../overlay/video-annotations';
import { disableVideoTelemetry } from '../overlay/video-telemetry';
import type { RegionSelectorController } from '../selection/region-selector/types';
import {
  createContentRuntimeServices,
  type ContentRuntimeServices,
} from '../application/runtime-services/services';

type ViewportInfoReader = () => ViewportInfo;
export type ContentRuntimeCleanup = () => void;
const logger = createLogger({ namespace: 'ContentRuntimeBootstrap' });

type ContentRuntimeLifecycle = {
  disposed: boolean;
};

type CleanupStep = {
  run: () => void;
  resource: string;
};

function requestRecordingState(services: ContentRuntimeServices) {
  return services.messaging.sendRuntimeMessage({ type: VideoMessageType.GET_RECORDING_STATE });
}

function requestRecordingTabId(services: ContentRuntimeServices) {
  return services.messaging.sendRuntimeMessage({ type: VideoMessageType.GET_RECORDING_TAB_ID });
}

function getRejectedBootstrapReason(results: {
  stateResult: PromiseSettledResult<Awaited<ReturnType<typeof requestRecordingState>>>;
  tabResult: PromiseSettledResult<Awaited<ReturnType<typeof requestRecordingTabId>>>;
}): unknown {
  if (results.stateResult.status === 'rejected') {
    const reason: unknown = results.stateResult.reason;
    return reason;
  }

  if (results.tabResult.status === 'rejected') {
    const reason: unknown = results.tabResult.reason;
    return reason;
  }

  return null;
}

async function restoreTabCropOverlayOnBootstrap(
  regionSelectorController: Pick<RegionSelectorController, 'showRecordingOverlay'>,
  lifecycle: ContentRuntimeLifecycle,
  services: ContentRuntimeServices
): Promise<void> {
  try {
    const [stateResult, tabResult] = await Promise.allSettled([
      requestRecordingState(services),
      requestRecordingTabId(services),
    ]);

    if (stateResult.status === 'rejected' || tabResult.status === 'rejected') {
      logger.warn(
        'Failed to restore TAB_CROP overlay on bootstrap',
        getRejectedBootstrapReason({ stateResult, tabResult })
      );
      return;
    }

    if (!stateResult.value.success || !tabResult.value.success) {
      logger.warn('Recording bootstrap state unavailable for TAB_CROP overlay restore', {
        recordingStateAvailable: stateResult.value.success,
        recordingTabAvailable: tabResult.value.success,
      });
      return;
    }

    const cropRegion = stateResult.value.state?.captureSource?.cropRegion;
    if (
      !tabResult.value.isCurrentTab ||
      stateResult.value.state?.captureMode !== CaptureMode.TAB_CROP ||
      !cropRegion
    ) {
      return;
    }

    if (lifecycle.disposed) {
      return;
    }

    regionSelectorController.showRecordingOverlay(cropRegion);
  } catch (error) {
    logger.warn('Failed to restore TAB_CROP overlay on bootstrap', error);
  }
}

function runCleanupStep(step: CleanupStep): void {
  try {
    step.run();
  } catch (error) {
    logger.warn('Failed to cleanup content runtime resource', {
      error,
      resource: step.resource,
    });
  }
}

/**
 * Restores content runtime state and wires the runtime message listener for the top-level document.
 */
export function initializeTopLevelContentRuntime(
  getViewportInfo: ViewportInfoReader,
  services: ContentRuntimeServices = createContentRuntimeServices()
): ContentRuntimeCleanup {
  const regionSelectorController = createRegionSelectorController();
  const lifecycle: ContentRuntimeLifecycle = { disposed: false };

  initializePageStyleRuntime();
  void restoreTabCropOverlayOnBootstrap(regionSelectorController, lifecycle, services);

  const unsubscribe = browserRuntime.subscribeToMessages(
    createContentRuntimeMessageListener(getViewportInfo, {
      regionSelectorController,
    })
  );

  return () => {
    lifecycle.disposed = true;
    const cleanupSteps: CleanupStep[] = [
      { resource: 'runtime listener', run: unsubscribe },
      { resource: 'highlighter mode', run: disableHighlighterMode },
      { resource: 'quick edit mode', run: disableQuickEditMode },
      { resource: 'AI pick mode', run: disableAiPickModeIfLoaded },
      { resource: 'selection mode', run: disableSelectionMode },
      { resource: 'page style runtime', run: disposePageStyleRuntime },
      { resource: 'video countdown', run: hideVideoCountdown },
      { resource: 'video annotations', run: disableVideoAnnotations },
      { resource: 'video telemetry', run: disableVideoTelemetry },
      { resource: 'region selector controller', run: () => regionSelectorController.dispose() },
    ];

    cleanupSteps.forEach(runCleanupStep);
  };
}
