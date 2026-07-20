import {
  CaptureMode,
  normalizeVideoSourceCount,
  type VideoRecordingSettings,
  type VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { attemptDiagnosticsStart } from './diagnostics';
import { sendOffscreenStartRecording } from './start-helpers';
import { supportsSystemAudio } from '../capture-source';
import { getVideoRecordingId, getVideoRecordingTabId } from '../session-state';
import type { enableAnnotationsIfNeeded, resolveCaptureSource } from './preflight';
import type { ViewportSetupDeps } from './transport.deps';

function resolveOffscreenStartSettings(
  captureMode: CaptureMode,
  settings: VideoRecordingSettings
): VideoRecordingSettings {
  const multiSource =
    captureMode === CaptureMode.SCREEN && normalizeVideoSourceCount(settings.sourceCount) > 1;
  return supportsSystemAudio(captureMode) && !multiSource
    ? settings
    : { ...settings, systemAudioEnabled: false };
}

function logResolvedStartSettings(
  logger: ReturnType<typeof createLogger>,
  captureMode: CaptureMode,
  offscreenSettings: VideoRecordingSettings,
  viewportPreset?: VideoViewportPresetSelection
): void {
  if (!supportsSystemAudio(captureMode) || !offscreenSettings.systemAudioEnabled) {
    logger.debug('Disabling system audio for capture mode', captureMode);
  }

  if (captureMode === CaptureMode.VIEWPORT_EMULATION && viewportPreset) {
    logger.debug('Viewport emulation will resize in offscreen without cropRegion');
  }
}

export async function finalizeRecordingStart(context: {
  tabId: number | null;
  captureMode: CaptureMode;
  captureSource: NonNullable<Awaited<ReturnType<typeof resolveCaptureSource>>>;
  viewport?: Awaited<ReturnType<typeof enableAnnotationsIfNeeded>>;
  shouldAbortBeforeOffscreenStart?: () => boolean;
  onBeforeOffscreenStartDispatch?: () => void;
  viewportEmulationResult?: Awaited<ReturnType<ViewportSetupDeps['configureViewportEmulation']>>;
  viewportPreset?: VideoViewportPresetSelection;
  settings: VideoRecordingSettings;
}) {
  const logger = createLogger({ namespace: 'BackgroundVideoFlowTransport:FinalizeStart' });
  const {
    tabId,
    captureMode,
    captureSource,
    viewport,
    shouldAbortBeforeOffscreenStart,
    onBeforeOffscreenStartDispatch,
    viewportEmulationResult,
    viewportPreset,
    settings,
  } = context;

  await attemptDiagnosticsStart({
    captureMode,
    settings,
    ...(tabId === null ? {} : { tabId }),
    ...(viewport === undefined ? {} : { viewport }),
  });

  const offscreenSettings = resolveOffscreenStartSettings(captureMode, settings);
  logResolvedStartSettings(logger, captureMode, offscreenSettings, viewportPreset);

  if (shouldAbortBeforeOffscreenStart?.()) {
    throw new Error('Recording start delivery was cancelled before offscreen handoff');
  }

  onBeforeOffscreenStartDispatch?.();
  await sendOffscreenStartRecording({
    captureMode,
    captureSource,
    currentRecordingId: getVideoRecordingId(),
    recordingTabId: captureMode === CaptureMode.CAMERA ? null : getVideoRecordingTabId(),
    settings: offscreenSettings,
    ...(viewport === undefined ? {} : { viewport }),
    ...(viewportEmulationResult === undefined ? {} : { viewportEmulationResult }),
    ...(viewportPreset === undefined ? {} : { viewportPreset }),
  });
}
