import { CaptureMode, type CaptureSource } from '@sniptale/runtime-contracts/video/types/types';
import { enrichCaptureSourceWithTabInfo } from '../capture-source';
import type { ResolveCaptureSourceDeps } from './preflight.resolve.types';

export async function resolveTabCaptureSource(
  tabId: number | null,
  tab: chrome.tabs.Tab | null,
  captureMode: CaptureMode,
  deps: ResolveCaptureSourceDeps
): Promise<CaptureSource | null> {
  if (captureMode === CaptureMode.CAMERA) {
    return {
      mode: captureMode,
      streamId: 'camera',
    };
  }

  if (!tab || tabId === null) {
    await deps.notifyStartFailed(deps.localize('background.runtime.recordingUnavailable'));
    return null;
  }

  try {
    const cropSelection = await resolveTabCropRegion(captureMode, tabId, deps);
    if (captureMode === CaptureMode.TAB_CROP && !cropSelection) {
      return null;
    }

    const captureSource = enrichCaptureSourceWithTabInfo(
      await deps.getCaptureSource(captureMode, tab),
      {
        ...(tab.title === undefined ? {} : { title: tab.title }),
        ...(tab.url === undefined ? {} : { url: tab.url }),
        ...(tab.favIconUrl === undefined ? {} : { favIconUrl: tab.favIconUrl }),
      }
    );

    const resolvedSource = cropSelection
      ? {
          ...captureSource,
          cropRegion: cropSelection.region,
          captureViewport: cropSelection.captureViewport,
        }
      : captureSource;
    deps.logger.debug('Capture source resolved', resolvedSource.mode);
    return resolvedSource;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.notifyStartFailed(message);
    return null;
  }
}

async function resolveTabCropRegion(
  captureMode: CaptureMode,
  tabId: number,
  deps: ResolveCaptureSourceDeps
) {
  if (captureMode !== CaptureMode.TAB_CROP) {
    return null;
  }

  deps.logger.debug('Requesting crop region before acquiring the one-time TAB_CROP stream ID');
  const cropSelection = await deps.requestRegionSelection(tabId);
  if (!cropSelection) {
    await deps.notifyStartFailed(deps.localize('background.runtime.areaSelectionCancelled'));
    return null;
  }

  return cropSelection;
}
