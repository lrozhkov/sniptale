import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  CaptureMode,
  normalizeVideoSourceCount,
  type CaptureSource,
  type VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import { getCaptureSource } from '../capture-source';
import { requestDesktopMedia, requestDisplayMediaSource } from '../ui/desktop-media';
import { requestRegionSelection } from '../ui/region-selection';
import { notifyRecordingStartFailed } from '../runtime/manager';
import { ensureOffscreenDocumentReady } from './preflight.offscreen';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging as getMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { resolveTabCaptureSource } from './preflight.resolve-tab';
import type { ResolveCaptureSourceDeps } from './preflight.resolve.types';

const defaultResolveCaptureSourceDeps: ResolveCaptureSourceDeps = {
  ensureOffscreenDocumentReady,
  getCaptureSource,
  localize: translate,
  logger: createLogger({ namespace: 'BackgroundVideoPreflight:CaptureSource' }),
  notifyStartFailed: notifyRecordingStartFailed,
  requestDesktopMedia,
  requestDisplayMediaSource,
  requestRegionSelection,
  sendRuntimeMessage: (message) => getMessaging().sendRuntimeMessage(message),
};

interface ResolveCaptureSourceParams {
  tabId: number | null;
  tab: chrome.tabs.Tab | null;
  captureMode: CaptureMode;
  controlledCursorCaptureEnabled?: boolean;
  sourceCount?: number;
  viewportPreset?: VideoViewportPresetSelection;
}

export async function resolveCaptureSource(
  params: ResolveCaptureSourceParams,
  deps: ResolveCaptureSourceDeps = defaultResolveCaptureSourceDeps
): Promise<CaptureSource | null> {
  const { tabId, tab, captureMode, viewportPreset } = params;

  if (captureMode === CaptureMode.VIEWPORT_EMULATION && !viewportPreset) {
    deps.notifyStartFailed(deps.localize('background.runtime.viewportPresetRequired'));
    return null;
  }

  if (captureMode === CaptureMode.SCREEN) {
    return resolveScreenCaptureSource(
      captureMode,
      params.controlledCursorCaptureEnabled === true,
      normalizeVideoSourceCount(params.sourceCount),
      deps
    );
  }

  return resolveTabCaptureSource(tabId, tab, captureMode, deps);
}

async function resolveScreenCaptureSource(
  captureMode: CaptureMode,
  controlledCursorCaptureEnabled: boolean,
  sourceCount: number,
  deps: ResolveCaptureSourceDeps
): Promise<CaptureSource | null> {
  if (sourceCount > 1) {
    return orchestrateMultiScreenCaptureSourceResolution(
      captureMode,
      controlledCursorCaptureEnabled,
      sourceCount,
      deps
    );
  }

  deps.logger.debug('Ensuring offscreen document before screen capture');
  await deps.ensureOffscreenDocumentReady('Recording tab video');

  const desktopSource = await deps.requestDesktopMedia(captureMode, controlledCursorCaptureEnabled);
  if (!desktopSource) {
    deps.notifyStartFailed(deps.localize('background.runtime.sourceSelectionCancelled'));
    return null;
  }

  deps.logger.debug('Desktop media source selected', desktopSource.label);
  return {
    mode: captureMode,
    streamId: 'desktop',
    screenName: desktopSource.label,
  };
}

async function orchestrateMultiScreenCaptureSourceResolution(
  captureMode: CaptureMode,
  controlledCursorCaptureEnabled: boolean,
  sourceCount: number,
  deps: ResolveCaptureSourceDeps
): Promise<CaptureSource | null> {
  const labels: string[] = [];

  for (let sourceIndex = 0; sourceIndex < sourceCount; sourceIndex++) {
    const desktopSource = await requestMultiScreenDesktopSource({
      captureMode,
      controlledCursorCaptureEnabled,
      deps,
      sourceCount,
      sourceIndex,
    });
    if (!desktopSource) {
      return null;
    }

    labels.push(desktopSource.label);
  }

  deps.logger.debug('Multi-source desktop media selected', { sourceCount });
  return {
    mode: captureMode,
    streamId: 'desktop-multi',
    screenName: labels.join(', '),
  };
}

async function requestMultiScreenDesktopSource(params: {
  captureMode: CaptureMode;
  controlledCursorCaptureEnabled: boolean;
  deps: ResolveCaptureSourceDeps;
  sourceCount: number;
  sourceIndex: number;
}): Promise<{ label: string } | null> {
  try {
    const { captureMode, controlledCursorCaptureEnabled, deps, sourceCount, sourceIndex } = params;
    const desktopSource = await deps.requestDisplayMediaSource(captureMode, {
      beforeDesktopStreamAcquire: () => deps.ensureOffscreenDocumentReady('Recording tab video'),
      controlledCursorCaptureEnabled,
      sourceCount,
      sourceIndex,
    });
    if (desktopSource) {
      return desktopSource;
    }

    await rollbackPreparedMultiScreenCaptureSources(deps);
    deps.notifyStartFailed(deps.localize('background.runtime.sourceSelectionCancelled'));
    return null;
  } catch (error) {
    await handleMultiScreenDesktopPreparationFailure(error, params);
    return null;
  }
}

async function handleMultiScreenDesktopPreparationFailure(
  error: unknown,
  params: {
    deps: ResolveCaptureSourceDeps;
    sourceCount: number;
    sourceIndex: number;
  }
): Promise<void> {
  const { deps, sourceCount, sourceIndex } = params;
  const phase = getDesktopPreparationFailurePhase(error);
  deps.logger.warn('Failed to prepare selected multi-source desktop media', {
    error,
    phase,
    sourceCount,
    sourceIndex,
  });
  await rollbackPreparedMultiScreenCaptureSources(deps);
  deps.notifyStartFailed(
    deps.localize(
      phase === 'desktop-picker'
        ? 'background.runtime.sourcePickerFailed'
        : 'background.runtime.sourcePreparationFailed'
    )
  );
}

function getDesktopPreparationFailurePhase(
  error: unknown
): 'desktop-picker' | 'desktop-stream-acquire' | 'display-media-acquire' {
  if (
    typeof error === 'object' &&
    error !== null &&
    'phase' in error &&
    error.phase === 'desktop-picker'
  ) {
    return 'desktop-picker';
  }

  return 'display-media-acquire';
}

async function rollbackPreparedMultiScreenCaptureSources(
  deps: Pick<ResolveCaptureSourceDeps, 'logger' | 'sendRuntimeMessage'>
): Promise<void> {
  await deps
    .sendRuntimeMessage(
      attachOffscreenCommandCapability({ type: VideoMessageType.DISPOSE_DESKTOP_MEDIA })
    )
    .catch((error) => {
      deps.logger.warn('Failed to dispose prepared multi-source desktop media', error);
    });
}
