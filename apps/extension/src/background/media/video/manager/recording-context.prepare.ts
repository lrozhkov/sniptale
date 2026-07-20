import { browserTabs } from '@sniptale/platform/browser/tabs';
import { translate } from '../../../../platform/i18n';
import type { ViewportEmulationResult } from '../../../debugger/workspace';
import { getVideoCaptureModeCapability } from '../../../../features/tab-capabilities/capabilities';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type {
  VideoRecordingSettings,
  VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import type { enableAnnotationsIfNeeded } from './preflight';
import { announceCaptureSource, resolveCaptureSourceForMode } from './flow';
import { ensureOffscreenDocumentReady } from './preflight.offscreen';
import { prepareRecordingViewportContext } from './recording-context.viewport';
import { setVideoRecordingTabId } from '../session-state';

type RecordingContext = {
  captureMode: CaptureMode;
  captureSource: NonNullable<Awaited<ReturnType<typeof resolveCaptureSourceForMode>>>;
  settings: VideoRecordingSettings;
  tabId: number | null;
  viewport?: Awaited<ReturnType<typeof enableAnnotationsIfNeeded>>;
  viewportEmulationResult?: ViewportEmulationResult;
  viewportPreset?: VideoViewportPresetSelection;
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
  viewportPreset?: VideoViewportPresetSelection;
}): Promise<RecordingContext | null> {
  const { tabId, captureMode, viewportPreset, settings } = props;
  if (captureMode === CaptureMode.CAMERA) {
    return initializeCameraRecordingContext({
      captureMode,
      settings,
      tabId,
      ...(viewportPreset === undefined ? {} : { viewportPreset }),
    });
  }

  if (tabId === null) {
    throw new Error('No tab ID');
  }

  const tab = await browserTabs.get(tabId);
  ensureCaptureModeSupported(captureMode, tab);
  setVideoRecordingTabId(tabId);

  return initializeTabRecordingContext({
    captureMode,
    settings,
    tab,
    tabId,
    ...(viewportPreset === undefined ? {} : { viewportPreset }),
  });
}

async function initializeCameraRecordingContext(props: {
  captureMode: CaptureMode.CAMERA;
  settings: VideoRecordingSettings;
  tabId: number | null;
  viewportPreset?: VideoViewportPresetSelection;
}): Promise<RecordingContext | null> {
  const { tabId, captureMode, viewportPreset, settings } = props;
  setVideoRecordingTabId(null);
  await ensureOffscreenDocumentReady('Recording camera video');
  const captureSource = await resolveCaptureSourceForMode(
    null,
    null,
    captureMode,
    settings,
    viewportPreset
  );
  if (!captureSource) {
    return null;
  }
  await announceCaptureSource(captureSource, captureMode, viewportPreset);
  return {
    captureMode,
    captureSource,
    settings,
    tabId,
    ...(viewportPreset === undefined ? {} : { viewportPreset }),
  };
}

async function initializeTabRecordingContext(props: {
  captureMode: Exclude<CaptureMode, CaptureMode.CAMERA>;
  settings: VideoRecordingSettings;
  tab: chrome.tabs.Tab;
  tabId: number;
  viewportPreset?: VideoViewportPresetSelection;
}): Promise<RecordingContext | null> {
  const { captureMode, settings, tab, tabId, viewportPreset } = props;
  const captureSource = await resolveCaptureSourceForMode(
    tabId,
    tab,
    captureMode,
    settings,
    viewportPreset
  );
  if (!captureSource) {
    return null;
  }
  await announceCaptureSource(captureSource, captureMode, viewportPreset);

  const viewportContext = await prepareRecordingViewportContext({
    captureMode,
    settings,
    tabId,
    ...(viewportPreset === undefined ? {} : { viewportPreset }),
  });
  if (viewportContext === null) {
    return null;
  }

  return {
    captureMode,
    captureSource,
    settings,
    tabId,
    viewport: viewportContext.viewport,
    ...(viewportContext.viewportEmulationResult === undefined
      ? {}
      : { viewportEmulationResult: viewportContext.viewportEmulationResult }),
    ...(viewportPreset === undefined ? {} : { viewportPreset }),
  };
}
