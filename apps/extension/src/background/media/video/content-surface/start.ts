import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  loadVideoSettings,
  loadVideoUiState,
} from '../../../../composition/persistence/capture-settings';
import { loadSettings } from '../../../../composition/persistence/settings';
import { ensureMediaHubStorageHeadroom } from '../../../../features/media-hub/storage-capacity';
import { ensureActivePageAccessRuntime } from '../../../page-access/service';
import { startRecording } from '../manager';
import { resolveVideoRecordingViewportPreset } from './preset';
import { createVideoRecordingSurfaceSnapshot } from './snapshot';
import {
  ensureVideoRecordingSurfaceLeaseHydrated,
  requestVideoRecordingSurface,
  updateVideoRecordingSurface,
} from './surface-lease';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { browserAction } from '@sniptale/platform/browser/action';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';

const PREVIOUS_RECORDING_ERROR = 'Resolve the previous recording before starting another.';
const logger = createLogger({ namespace: 'VideoRecordingContentSurfaceStart' });

async function openPreviousRecordingResolution(tabId: number): Promise<void> {
  try {
    const tab = await browserTabs.get(tabId);
    if (tab.active === true && typeof tab.windowId === 'number') {
      await browserAction.openPopup({ windowId: tab.windowId });
    }
  } catch (error) {
    logger.warn('Failed to open previous recording resolution popup', error);
  }
}

export async function activateVideoRecordingSurface(tabId: number) {
  const settings = await loadVideoSettings();
  const existingLease = await ensureVideoRecordingSurfaceLeaseHydrated();
  const lease =
    existingLease?.tabId === tabId
      ? existingLease
      : await requestVideoRecordingSurface({ entry: 'manual', tabId });
  const readyLease = (await updateVideoRecordingSurface(lease.surfaceSessionId, {
    lifecycle: 'ready',
    toolbarRequested: true,
  }))!;
  return {
    success: true,
    snapshot: createVideoRecordingSurfaceSnapshot(readyLease, settings),
    surfaceSessionId: readyLease.surfaceSessionId,
    surfaceToken: readyLease.surfaceToken,
  };
}

export async function openVideoRecordingSurfaceFromPopup(tabId: number): Promise<void> {
  const settings = await loadVideoSettings();
  const lease = await requestVideoRecordingSurface({
    entry: 'popup',
    tabId,
    toolbarRequested: true,
  });
  const readyLease = (await updateVideoRecordingSurface(lease.surfaceSessionId, {
    lifecycle: 'ready',
  }))!;
  await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
    snapshot: createVideoRecordingSurfaceSnapshot(readyLease, settings),
    surfaceToken: readyLease.surfaceToken,
  });
}

export async function startSavedTabVideoRecording(
  tabId: number,
  ownerSenderUrl: string | undefined
) {
  if (!ownerSenderUrl) throw new Error('Unauthorized recording surface sender');
  const existingLease = await ensureVideoRecordingSurfaceLeaseHydrated();
  const lease =
    existingLease?.tabId === tabId
      ? existingLease
      : await requestVideoRecordingSurface({ entry: 'manual', tabId });
  await ensureActivePageAccessRuntime(tabId, 'Page access is required for tab recording.');
  await ensureMediaHubStorageHeadroom();
  const [settings, appSettings, uiState] = await Promise.all([
    loadVideoSettings(),
    loadSettings(),
    loadVideoUiState(),
  ]);
  const viewportPresetId = await resolveVideoRecordingViewportPreset(appSettings);
  if (uiState.viewportPresetId && !viewportPresetId) {
    throw new Error('Saved viewport preset is unavailable');
  }
  const result = await startRecording(
    tabId,
    settings,
    CaptureMode.TAB,
    viewportPresetId,
    ownerSenderUrl
  );
  if (result.result === 'failed') {
    if (result.error === PREVIOUS_RECORDING_ERROR) {
      await openPreviousRecordingResolution(tabId);
    }
    throw new Error(result.error);
  }
  const recordingId = result.result === 'accepted' ? result.recordingId : null;
  const next = (await updateVideoRecordingSurface(lease.surfaceSessionId, {
    lifecycle: result.result === 'accepted' ? 'ready' : 'degraded',
    recordingId,
  }))!;
  return {
    success: result.result === 'accepted',
    snapshot: createVideoRecordingSurfaceSnapshot(next, settings),
    surfaceSessionId: next.surfaceSessionId,
    surfaceToken: next.surfaceToken,
  };
}
