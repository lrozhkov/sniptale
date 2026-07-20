import {
  CaptureMode,
  type VideoRecordingSettings,
  type VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import { getVideoRecordingId } from '../session-state';
import {
  buildViewportEmulationResult,
  enableAnnotationsOrAbort,
  ensureOffscreenDocumentReadyOrAbort,
} from './flow';

export function normalizeViewportPreset(
  captureMode: CaptureMode,
  viewportPreset?: VideoViewportPresetSelection
): VideoViewportPresetSelection | undefined {
  return captureMode === CaptureMode.VIEWPORT_EMULATION ? viewportPreset : undefined;
}

export async function prepareRecordingViewportContext(props: {
  captureMode: CaptureMode;
  settings: VideoRecordingSettings;
  tabId: number;
  viewportPreset?: VideoViewportPresetSelection;
}) {
  const { tabId, captureMode, viewportPreset, settings } = props;
  const offscreenReady = await ensureOffscreenDocumentReadyOrAbort(
    'Recording tab video',
    tabId,
    captureMode
  );
  if (!offscreenReady) {
    return null;
  }

  const viewport = await enableAnnotationsOrAbort(
    tabId,
    captureMode,
    settings,
    getVideoRecordingId() ?? undefined
  );
  if (viewport === null) {
    return null;
  }

  const viewportEmulationResult = await buildViewportEmulationResult(
    tabId,
    captureMode,
    viewportPreset
  );
  if (viewportEmulationResult === null) {
    return null;
  }

  return { viewport, viewportEmulationResult };
}
