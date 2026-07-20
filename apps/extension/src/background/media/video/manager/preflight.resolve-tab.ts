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
    deps.notifyStartFailed(deps.localize('background.runtime.recordingUnavailable'));
    return null;
  }

  try {
    const captureSource = enrichCaptureSourceWithTabInfo(
      await deps.getCaptureSource(captureMode, tab),
      {
        ...(tab.title === undefined ? {} : { title: tab.title }),
        ...(tab.url === undefined ? {} : { url: tab.url }),
        ...(tab.favIconUrl === undefined ? {} : { favIconUrl: tab.favIconUrl }),
      }
    );

    return await finalizeTabCaptureSource({ captureMode, captureSource, deps, tabId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.notifyStartFailed(message);
    return null;
  }
}

async function finalizeTabCaptureSource(params: {
  captureMode: CaptureMode;
  captureSource: CaptureSource;
  deps: ResolveCaptureSourceDeps;
  tabId: number;
}): Promise<CaptureSource | null> {
  const captureSource = await attachTabCropRegionIfNeeded(params);
  if (!captureSource) {
    return null;
  }

  params.deps.logger.debug('Capture source resolved', captureSource.mode);
  return captureSource;
}

async function attachTabCropRegionIfNeeded(params: {
  captureMode: CaptureMode;
  captureSource: CaptureSource;
  deps: ResolveCaptureSourceDeps;
  tabId: number;
}): Promise<CaptureSource | null> {
  if (params.captureMode !== CaptureMode.TAB_CROP) {
    return params.captureSource;
  }

  params.deps.logger.debug('Requesting crop region for TAB_CROP mode');
  const cropRegion = await params.deps.requestRegionSelection(params.tabId);
  if (!cropRegion) {
    params.deps.notifyStartFailed(
      params.deps.localize('background.runtime.areaSelectionCancelled')
    );
    return null;
  }

  return { ...params.captureSource, cropRegion };
}
