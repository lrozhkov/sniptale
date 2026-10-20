import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  DEFAULT_POPUP_STARTUP_STATE,
  loadPopupStartupState,
  type PopupStartupSelection,
} from '../../../composition/persistence/capture-settings/popup-startup';
import { consumePopupExportLaunchIntentForActiveTab } from '../export/runtime/tab-message-routing';
import { popupBootstrapTransport } from '../bootstrap/runtime';
import { clearPopupVideoLaunchUrlParams } from '../../platform/browser-driver';
import {
  loadRecordingStateResponseWithFallback,
  resolvePopupBootstrapRecordingState,
} from '../bootstrap/recording-state';
import type {
  PopupPostRecordSnapshot,
  PopupRecordingSnapshot,
  PopupStartupDescriptor,
} from './descriptor';

const videoModes: Partial<Record<PopupStartupSelection, CaptureMode>> = {
  'video:tab': CaptureMode.TAB,
  'video:camera': CaptureMode.CAMERA,
  'video:screen': CaptureMode.SCREEN,
};

const screenshotModes = {
  'screenshots:quick-actions': 'quick-actions',
  'screenshots:tab': 'tab',
  'screenshots:desktop': 'desktop',
} as const;

function consumeVideoLaunchRoute(href: string | undefined): {
  videoMode: CaptureMode;
  videoLaunch: { tabId: number; viewportPresetId: string | null };
} | null {
  if (!href) return null;
  const url = new URL(href);
  const keys = ['videoLaunchMode', 'videoLaunchTabId', 'videoLaunchPresetId'];
  if (keys.some((key) => url.searchParams.getAll(key).length > 1)) return null;
  const mode = url.searchParams.get('videoLaunchMode');
  if (mode !== CaptureMode.TAB && mode !== CaptureMode.TAB_CROP && mode !== CaptureMode.SCREEN)
    return null;
  const rawTabId = url.searchParams.get('videoLaunchTabId');
  if (!rawTabId || !/^[1-9][0-9]*$/.test(rawTabId)) return null;
  const tabId = Number(rawTabId);
  if (!Number.isSafeInteger(tabId)) return null;
  const viewportPresetId = url.searchParams.get('videoLaunchPresetId');
  if (
    viewportPresetId !== null &&
    (!viewportPresetId || viewportPresetId.trim() !== viewportPresetId)
  )
    return null;
  if (typeof window !== 'undefined' && window.location.href === href) {
    clearPopupVideoLaunchUrlParams(href);
  }
  return { videoMode: mode, videoLaunch: { tabId, viewportPresetId } };
}

export async function resolvePopupStartupRoute(
  href = typeof window === 'undefined' ? undefined : window.location.href
): Promise<PopupStartupDescriptor> {
  const videoLaunch = consumeVideoLaunchRoute(href);
  const [startup, recordingResponse, exportIntent] = await Promise.all([
    loadPopupStartupState().catch(() => DEFAULT_POPUP_STARTUP_STATE),
    loadRecordingStateResponseWithFallback(popupBootstrapTransport, () => undefined),
    consumePopupExportLaunchIntentForActiveTab().catch(() => null),
  ]);
  const resolvedRecording = resolvePopupBootstrapRecordingState(recordingResponse);
  const recording = resolvedRecording.recordingState;
  const recordingSnapshot: PopupRecordingSnapshot = {
    controlCapability:
      typeof recordingResponse.controlToken === 'string' &&
      typeof recordingResponse.recordingId === 'string'
        ? {
            controlToken: recordingResponse.controlToken,
            recordingId: recordingResponse.recordingId,
          }
        : null,
    state: recording,
    statusError: resolvedRecording.recordingStatusError,
  };
  const postRecordSnapshot: PopupPostRecordSnapshot = {
    result: recordingResponse.postRecordResult ?? null,
  };
  if (
    recordingResponse.postRecordResult !== undefined ||
    recording.status !== VideoRecordingStatus.IDLE
  ) {
    return {
      page: 'video',
      recordingSnapshot,
      postRecordSnapshot,
    };
  }
  if (videoLaunch) return { page: 'video', ...videoLaunch, recordingSnapshot, postRecordSnapshot };
  if (exportIntent) return { page: 'export', destination: 'export', launch: exportIntent };
  if (startup.selection === 'remember-last') {
    return startup.lastPage === 'video'
      ? { page: 'video', recordingSnapshot, postRecordSnapshot }
      : startup.lastPage === 'export'
        ? { page: 'export', destination: startup.lastExportDestination }
        : { page: startup.lastPage };
  }
  if (startup.selection === 'menu') return { page: 'menu' };
  if (startup.selection === 'tools') return { page: 'tools' };
  if (startup.selection === 'export:download') return { page: 'export', destination: 'export' };
  if (startup.selection === 'export:library') return { page: 'export', destination: 'save' };
  if (startup.selection === 'export:html') return { page: 'export', destination: 'html' };
  const videoMode = videoModes[startup.selection];
  if (videoMode) {
    return { page: 'video', videoMode, recordingSnapshot, postRecordSnapshot };
  }
  const screenshotMode = screenshotModes[startup.selection as keyof typeof screenshotModes];
  return screenshotMode ? { page: 'screenshots', screenshotMode } : { page: 'menu' };
}
