import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  loadVideoSettings,
  loadVideoUiState,
  patchVideoSettings,
} from '../../../../composition/persistence/capture-settings';
import { loadSettings } from '../../../../composition/persistence/settings';
import { ensureMediaHubStorageHeadroom } from '../../../../features/media-hub/storage-capacity';
import { ensureActivePageAccessRuntime } from '../../../page-access/service';
import { startRecording } from '../manager';
import { runSerializedVideoRecordingMediaMutation } from './mutation-queue';
import { resolveVideoRecordingViewportPreset } from './preset';
import { createVideoRecordingSurfaceSnapshot } from './snapshot';
import { resolveRecordingMediaAccess } from './media-access';
import {
  ensureVideoRecordingSurfaceLeaseHydrated,
  requestVideoRecordingSurface,
  updateVideoRecordingSurface,
  type VideoRecordingSurfaceLease,
} from './surface-lease';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { browserAction } from '@sniptale/platform/browser/action';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { StartSavedTabVideoRecordingMessage } from '@sniptale/runtime-contracts/video/types/messages.surface';
import {
  ensureCurrentRecordingDocument,
  VideoRecordingStartFailure,
} from '../manager/start-failure';
import type { RecordingStartResult } from '../manager/start-delivery';

const PREVIOUS_RECORDING_ERROR = 'Resolve the previous recording before starting another.';
const logger = createLogger({ namespace: 'VideoRecordingContentSurfaceStart' });
const pendingSavedStarts = Object.assign(new Map<number, { cancelled: boolean }>(), {
  policyStateId: 'video-recording-surface-lease',
});

/** Reports a pending saved-tab start before the runtime reaches PREPARING. */
export function isSavedTabVideoRecordingStartPending(tabId: number): boolean {
  return pendingSavedStarts.has(tabId);
}

export function cancelSavedTabVideoRecordingStart(tabId: number): void {
  const attempt = pendingSavedStarts.get(tabId);
  if (attempt) attempt.cancelled = true;
}

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
  const stored = await loadVideoSettings();
  const existingLease = await ensureVideoRecordingSurfaceLeaseHydrated();
  const settings = existingLease?.recordingId ? stored : await resolveRecordingMediaAccess(stored);
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
  const settings = await resolveRecordingMediaAccess(await loadVideoSettings());
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
  ownerDocumentId: string | undefined,
  confirmation: Pick<
    StartSavedTabVideoRecordingMessage,
    'confirmedWithoutMicrophone' | 'rememberWithoutMicrophone' | 'captureMode'
  > = {}
) {
  if (pendingSavedStarts.has(tabId)) {
    return { success: false, failureCode: 'duplicate-preparing' as const };
  }
  const attempt = { cancelled: false };
  pendingSavedStarts.set(tabId, attempt);
  try {
    const runStart = () =>
      runSavedTabVideoRecordingStart(tabId, ownerSenderUrl, ownerDocumentId, confirmation, attempt);
    const lease = await ensureVideoRecordingSurfaceLeaseHydrated();
    return await (lease?.tabId === tabId
      ? runSerializedVideoRecordingMediaMutation(lease.surfaceSessionId, runStart)
      : runStart());
  } finally {
    if (pendingSavedStarts.get(tabId) === attempt) pendingSavedStarts.delete(tabId);
  }
}

async function runSavedTabVideoRecordingStart(
  tabId: number,
  ownerSenderUrl: string | undefined,
  ownerDocumentId: string | undefined,
  confirmation: Pick<
    StartSavedTabVideoRecordingMessage,
    'confirmedWithoutMicrophone' | 'rememberWithoutMicrophone' | 'captureMode'
  >,
  attempt: { cancelled: boolean }
) {
  if (!ownerSenderUrl || !ownerDocumentId) {
    throw new VideoRecordingStartFailure('stale-context');
  }
  await ensureCurrentRecordingDocument(tabId, ownerDocumentId);
  const settings = await loadConfirmedRecordingSettings(confirmation);
  if (!settings) return { success: true, confirmationRequired: true as const };
  await ensureCurrentRecordingDocument(tabId, ownerDocumentId);
  if (attempt.cancelled) return { success: false, failureCode: 'cancelled' as const };
  const { lease, viewportPresetId } = await prepareSavedRecordingSource(tabId, ownerDocumentId);
  if (attempt.cancelled) return { success: false, failureCode: 'cancelled' as const };
  const result = await startRecording(
    tabId,
    settings,
    confirmation.captureMode ?? CaptureMode.TAB,
    viewportPresetId,
    ownerSenderUrl,
    ownerDocumentId
  );
  return projectSavedRecordingStart(tabId, settings, lease, result);
}

async function loadConfirmedRecordingSettings(
  confirmation: Pick<
    StartSavedTabVideoRecordingMessage,
    'confirmedWithoutMicrophone' | 'rememberWithoutMicrophone' | 'captureMode'
  >
): Promise<VideoRecordingSettings | null> {
  const settings = await resolveRecordingMediaAccess(await loadVideoSettings());
  if (settings.microphoneEnabled || settings.warnWithoutMicrophone === false) return settings;
  if (confirmation.confirmedWithoutMicrophone !== true) return null;
  return confirmation.rememberWithoutMicrophone === true
    ? resolveRecordingMediaAccess(await patchVideoSettings({ warnWithoutMicrophone: false }))
    : settings;
}

async function prepareSavedRecordingSource(tabId: number, ownerDocumentId: string) {
  const existingLease = await ensureVideoRecordingSurfaceLeaseHydrated();
  const lease =
    existingLease?.tabId === tabId
      ? existingLease
      : await requestVideoRecordingSurface({ entry: 'manual', tabId });
  await ensureActivePageAccessRuntime(tabId, 'Page access is required for tab recording.');
  await ensureCurrentRecordingDocument(tabId, ownerDocumentId);
  await ensureMediaHubStorageHeadroom();
  const [appSettings, uiState] = await Promise.all([loadSettings(), loadVideoUiState()]);
  const viewportPresetId = await resolveVideoRecordingViewportPreset(appSettings);
  if (uiState.viewportPresetId && !viewportPresetId) {
    throw new Error('Saved viewport preset is unavailable');
  }
  await ensureCurrentRecordingDocument(tabId, ownerDocumentId);
  return { lease, viewportPresetId };
}

async function projectSavedRecordingStart(
  tabId: number,
  settings: VideoRecordingSettings,
  lease: VideoRecordingSurfaceLease,
  result: RecordingStartResult
) {
  if (result.result !== 'accepted') {
    if (result.result === 'failed' && result.error === PREVIOUS_RECORDING_ERROR) {
      await openPreviousRecordingResolution(tabId);
    }
    const failureCode =
      result.result === 'failed'
        ? result.error === PREVIOUS_RECORDING_ERROR
          ? 'already-active'
          : (result.failureCode ?? 'internal-error')
        : result.result;
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
