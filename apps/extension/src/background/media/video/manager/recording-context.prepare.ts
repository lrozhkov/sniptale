import { browserTabs } from '@sniptale/platform/browser/tabs';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { AppliedCaptureSurface } from '../../../capture-surface';
import { getVideoCaptureModeCapability } from '../../../../features/tab-capabilities/capabilities';
import { translate } from '../../../../platform/i18n';
import { acquireVideoCaptureSurface } from '../capture-surface';
import { setVideoRecordingTabId } from '../session-state';
import { announceCaptureSource, resolveCaptureSourceForMode } from './flow';
import {
  prepareContentSurfaceOrAbort,
  ensureOffscreenDocumentReadyOrAbort,
} from './transport.resolve';
import { getVideoRecordingId } from '../session-state';
import { ensureOffscreenDocumentReady } from './preflight.offscreen';
import { captureViewportsEqual, readTabCaptureViewport } from '../capture-viewport';

type RecordingContext = {
  captureMode: CaptureMode;
  captureSource: NonNullable<Awaited<ReturnType<typeof resolveCaptureSourceForMode>>>;
  generation: number;
  settings: VideoRecordingSettings;
  surface: AppliedCaptureSurface | null;
  tabId: number | null;
  viewport?: NonNullable<Awaited<ReturnType<typeof prepareContentSurfaceOrAbort>>>;
  viewportPresetId: string | null;
};

function ensureCaptureModeSupported(captureMode: CaptureMode, tab: chrome.tabs.Tab): void {
  const modeCapability = getVideoCaptureModeCapability(captureMode, tab);
  if (!modeCapability.supported) {
    throw new Error(modeCapability.reason || translate('background.runtime.recordingUnavailable'));
  }
}

export async function initializeRecordingContext(props: {
  captureMode: CaptureMode;
  settings: VideoRecordingSettings;
  tabId: number | null;
  viewportPresetId: string | null;
}): Promise<RecordingContext | null> {
  const { captureMode, settings, tabId, viewportPresetId } = props;
  const recordingId = getVideoRecordingId();
  if (!recordingId) throw new Error('Recording session ID is missing');

  if (captureMode === CaptureMode.CAMERA) {
    if (viewportPresetId) throw new Error('Viewport presets are unavailable for camera recording');
    setVideoRecordingTabId(null);
    await acquireVideoCaptureSurface({
      captureMode,
      presetId: null,
      recordingId,
      tabId: null,
    });
    await ensureOffscreenDocumentReady('Recording camera video');
    const captureSource = await resolveCaptureSourceForMode(null, null, captureMode, settings);
    if (!captureSource) return null;
    await announceCaptureSource(captureSource, captureMode, null);
    return {
      captureMode,
      captureSource,
      generation: 1,
      settings,
      surface: null,
      tabId: null,
      viewportPresetId: null,
    };
  }

  if (tabId === null) throw new Error('No tab ID');
  const tab = await browserTabs.get(tabId);
  ensureCaptureModeSupported(captureMode, tab);
  setVideoRecordingTabId(tabId);

  const surface = await acquireVideoCaptureSurface({
    captureMode,
    presetId: viewportPresetId,
    recordingId,
    tabId,
  });

  const offscreenReady = await ensureOffscreenDocumentReadyOrAbort(
    'Recording tab video',
    tabId,
    captureMode
  );
  if (!offscreenReady) return null;

  const viewport = await prepareContentSurfaceOrAbort(tabId, captureMode, settings, recordingId);
  if (viewport === null) return null;
  // The stream ID is intentionally acquired only after the final surface and crop UI are ready.
  const captureSource = await resolveCaptureSourceForMode(tabId, tab, captureMode, settings);
  if (!captureSource) return null;
  const liveViewport = await readTabCaptureViewport(tabId);
  if (
    captureSource.captureViewport &&
    !captureViewportsEqual(captureSource.captureViewport, liveViewport)
  ) {
    throw new Error('The tab viewport changed after the recording area was selected');
  }
  await announceCaptureSource(captureSource, captureMode, viewportPresetId);

  return {
    captureMode,
    captureSource,
    generation: 1,
    settings,
    surface,
    tabId,
    viewport: captureSource.captureViewport ?? liveViewport,
    viewportPresetId,
  };
}
