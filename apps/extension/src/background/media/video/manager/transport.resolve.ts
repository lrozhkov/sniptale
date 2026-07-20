import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type {
  VideoRecordingSettings,
  VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  defaultAnnotationSetupDeps,
  defaultCaptureSourceResolverDeps,
  defaultOffscreenSetupDeps,
  type AnnotationSetupDeps,
  type CaptureSourceResolverDeps,
  type OffscreenSetupDeps,
} from './transport.deps';

export async function resolveCaptureSourceForMode(
  tabId: number | null,
  tab: chrome.tabs.Tab | null,
  captureMode: CaptureMode,
  settings?: VideoRecordingSettings,
  viewportPreset?: VideoViewportPresetSelection,
  deps: CaptureSourceResolverDeps = defaultCaptureSourceResolverDeps
) {
  deps.logger.debug('Resolving capture source', {
    captureMode,
    controlledCursorCaptureEnabled: settings?.controlledCursorCaptureEnabled === true,
    tabId,
    viewportPreset,
  });
  return deps.resolveCaptureSource({
    tabId,
    tab,
    captureMode,
    ...(settings?.controlledCursorCaptureEnabled === true
      ? { controlledCursorCaptureEnabled: true }
      : {}),
    ...(settings?.sourceCount === undefined ? {} : { sourceCount: settings.sourceCount }),
    ...(viewportPreset === undefined ? {} : { viewportPreset }),
  });
}

async function ensureOffscreenDocumentReadyWithLog(
  description: string,
  deps: Pick<
    OffscreenSetupDeps,
    'logger' | 'ensureOffscreenDocumentReady'
  > = defaultOffscreenSetupDeps
) {
  deps.logger.debug('Ensuring offscreen document is ready');
  await deps.ensureOffscreenDocumentReady(description);
}

export async function ensureOffscreenDocumentReadyOrAbort(
  description: string,
  tabId: number,
  captureMode: CaptureMode,
  deps: OffscreenSetupDeps = defaultOffscreenSetupDeps
) {
  await ensureOffscreenDocumentReadyWithLog(description, deps);
  return !deps.abortStart(tabId, captureMode, 'offscreen setup');
}

export async function enableAnnotationsOrAbort(
  tabId: number,
  captureMode: CaptureMode,
  settings: VideoRecordingSettings,
  recordingId?: string,
  deps: AnnotationSetupDeps = defaultAnnotationSetupDeps
) {
  const viewport = await deps.enableAnnotationsIfNeeded(tabId, captureMode, settings, recordingId);
  if (deps.abortStart(tabId, captureMode, 'annotation setup')) {
    return null;
  }
  return viewport;
}
