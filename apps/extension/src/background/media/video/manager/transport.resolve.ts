import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  defaultContentSurfaceSetupDeps,
  defaultCaptureSourceResolverDeps,
  defaultOffscreenSetupDeps,
  type ContentSurfaceSetupDeps,
  type CaptureSourceResolverDeps,
  type OffscreenSetupDeps,
} from './transport.deps';

export async function resolveCaptureSourceForMode(
  tabId: number | null,
  tab: chrome.tabs.Tab | null,
  captureMode: CaptureMode,
  settings?: VideoRecordingSettings,
  deps: CaptureSourceResolverDeps = defaultCaptureSourceResolverDeps
) {
  deps.logger.debug('Resolving capture source', {
    captureMode,
    controlledCursorCaptureEnabled: settings?.controlledCursorCaptureEnabled === true,
    tabId,
  });
  return deps.resolveCaptureSource({
    tabId,
    tab,
    captureMode,
    ...(settings?.controlledCursorCaptureEnabled === true
      ? { controlledCursorCaptureEnabled: true }
      : {}),
    ...(settings?.sourceCount === undefined ? {} : { sourceCount: settings.sourceCount }),
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

export async function prepareContentSurfaceOrAbort(
  tabId: number,
  captureMode: CaptureMode,
  settings: VideoRecordingSettings,
  recordingId?: string,
  deps: ContentSurfaceSetupDeps = defaultContentSurfaceSetupDeps
) {
  const viewport = await deps.prepareContentSurfaceIfNeeded(
    tabId,
    captureMode,
    settings,
    recordingId
  );
  if (deps.abortStart(tabId, captureMode, 'content surface setup')) {
    return null;
  }
  return viewport;
}
