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
import {
  ensureCurrentRecordingDocument,
  VideoRecordingStartFailure,
} from '../manager/start-failure';

const PREVIOUS_RECORDING_ERROR = 'Resolve the previous recording before starting another.';
const logger = createLogger({ namespace: 'VideoRecordingContentSurfaceStart' });

async function openPreviousRecordingResolution(tabId: number): Promise<void> {
  try {
    const tab = await browserTabs.get(tabId);
    if (tab.active === true && typeof tab.windowId === 'number') {
      await browserAction.openPopup({ windowId: tab.windowId });
    }
  } catch {
    logger.warn('Failed to open previous recording resolution popup');
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
  ownerSenderUrl: string | undefined,
  ownerDocumentId: string | undefined
) {
  if (!ownerSenderUrl || !ownerDocumentId) {
    throw new VideoRecordingStartFailure('stale-context');
  }
  await ensureCurrentRecordingDocument(tabId, ownerDocumentId);
  const existingLease = await ensureVideoRecordingSurfaceLeaseHydrated();
  const lease =
    existingLease?.tabId === tabId
      ? existingLease
      : await requestVideoRecordingSurface({ entry: 'manual', tabId });
  await ensureActivePageAccessRuntime(tabId, 'Page access is required for tab recording.');
  await ensureCurrentRecordingDocument(tabId, ownerDocumentId);
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
  await ensureCurrentRecordingDocument(tabId, ownerDocumentId);
  const result = await startRecording(
    tabId,
    settings,
    CaptureMode.TAB,
    viewportPresetId,
    ownerSenderUrl,
    ownerDocumentId
  );
  if (result.result !== 'accepted') {
    if (result.result === 'failed' && result.error === PREVIOUS_RECORDING_ERROR) {
      await openPreviousRecordingResolution(tabId);
    }
    const failureCode =
      result.result === 'failed'
        ? result.error === PREVIOUS_RECORDING_ERROR
          ? 'already-active'
          : (result.failureCode ?? 'internal-error')
        : result.result === 'duplicate-preparing'
          ? 'duplicate-preparing'
          : result.result === 'already-active'
            ? 'already-active'
            : 'cancelled';
    return {
      failureCode,
      success: false,
      snapshot: createVideoRecordingSurfaceSnapshot(lease, settings),
      surfaceSessionId: lease.surfaceSessionId,
      surfaceToken: lease.surfaceToken,
    };
  }
  const next = (await updateVideoRecordingSurface(lease.surfaceSessionId, {
    lifecycle: 'ready',
    recordingId: result.recordingId,
  }))!;
  return {
    success: true,
    snapshot: createVideoRecordingSurfaceSnapshot(next, settings),
    surfaceSessionId: next.surfaceSessionId,
    surfaceToken: next.surfaceToken,
  };
}
