import { createLogger } from '@sniptale/platform/observability/logger';

import { translate } from '../../../platform/i18n';
import { bootstrapPopupState, type PopupBootstrapResult } from '../bootstrap';
import type {
  PopupLifecycleBootstrapParams,
  PopupLifecycleBootstrapParamsGetter,
} from './contracts';
import { consumePopupExportLaunchIntentForActiveTab } from '../export/runtime/tab-message-routing';
import { stagePopupExportLaunchSelection } from '../export/selection/launch-selection';
import { applyPopupStartupSelection, loadPopupStartupSelection } from './startup-routing';

const logger = createLogger({ namespace: 'PopupLifecycle' });

async function consumePopupExportLaunchIntent(): Promise<'export' | null> {
  try {
    return await consumePopupExportLaunchIntentForActiveTab();
  } catch (error) {
    logger.error('Failed to consume popup export launch intent', error);
    return null;
  }
}

function applyBootstrapSuccess(params: PopupLifecycleBootstrapParams, state: PopupBootstrapResult) {
  params.setHomeError(state.homeError ?? null);
  params.setViewportPresets(state.viewportPresets);
  params.setQuickActions(state.quickActions);
  params.setQuickActionsReady(true);
  params.setVideoSettings(state.videoSettings);
  params.setSelectedPresetId(state.selectedPresetId);
  params.setVideoCaptureMode(state.captureMode);
  params.setRecordingControlCapability(state.recordingControlCapability);
  params.setRecordingState(state.recordingState);
  params.setStartError(state.recordingStatusError ?? null);
  params.setMicrophoneDevices(state.microphones);
  params.setWebcamDevices(state.webcams);
}

async function refreshPopupSecondaryState(args: {
  cancelledRef: () => boolean;
  refreshActiveTabCapabilities: () => Promise<void>;
  refreshGalleryStatus: () => Promise<void>;
}) {
  if (args.cancelledRef()) {
    return;
  }

  try {
    await Promise.all([args.refreshActiveTabCapabilities(), args.refreshGalleryStatus()]);
  } catch (error) {
    logger.error('Failed to refresh popup secondary state', error);
  }
}

function handlePopupBootstrapError(
  error: unknown,
  cancelledRef: () => boolean,
  setStartError: PopupLifecycleBootstrapParams['setStartError'],
  setIsReady: PopupLifecycleBootstrapParams['setIsReady']
) {
  logger.error('Failed to bootstrap popup', error);
  if (cancelledRef()) {
    return;
  }

  setStartError(translate('popup.video.loadingPopupError'));
  setIsReady(true);
}

export async function bootstrapPopupLifecycle({
  cancelledRef,
  getParams,
}: {
  cancelledRef: () => boolean;
  getParams: PopupLifecycleBootstrapParamsGetter;
}) {
  const { refreshActiveTabCapabilities, refreshGalleryStatus, setIsReady, setStartError } =
    getParams();

  try {
    const [bootstrapState, launchPage, startupState] = await Promise.all([
      bootstrapPopupState(),
      consumePopupExportLaunchIntent(),
      loadPopupStartupSelection(),
    ]);

    if (cancelledRef()) {
      return;
    }

    applyBootstrapSuccess(getParams(), bootstrapState);
    if (bootstrapState.hasPostRecordResult) {
      getParams().setPage('video');
    } else if (launchPage) {
      stagePopupExportLaunchSelection({ includeAnnotations: true });
      getParams().setPage(launchPage);
    } else {
      await applyPopupStartupSelection(getParams(), startupState.selection, startupState.lastPage);
    }
    await refreshPopupSecondaryState({
      cancelledRef,
      refreshActiveTabCapabilities,
      refreshGalleryStatus,
    });

    if (cancelledRef()) {
      return;
    }

    setIsReady(true);
  } catch (error) {
    handlePopupBootstrapError(error, cancelledRef, setStartError, setIsReady);
  }
}
