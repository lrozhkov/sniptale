import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  loadVideoSettings,
  loadVideoUiState,
} from '../../../../composition/persistence/capture-settings';
import { loadSettings } from '../../../../composition/persistence/settings';
import { ensureMediaHubStorageHeadroom } from '../../../../features/media-hub/storage-capacity';
import { ensureActivePageAccessRuntime } from '../../../runtime/page-access/service';
import { resolveContextMenuVideoPreset } from '../../../runtime/context-menu/action-helpers';
import { startRecording } from '../manager';
import { createVideoRecordingSurfaceSnapshot } from './snapshot';
import { requestVideoRecordingSurface, updateVideoRecordingSurface } from './surface-lease';

export async function activateVideoRecordingSurface(tabId: number) {
  const settings = await loadVideoSettings();
  const lease = await requestVideoRecordingSurface({ entry: 'manual', tabId });
  const readyLease = (await updateVideoRecordingSurface(lease.surfaceSessionId, {
    lifecycle: 'ready',
  }))!;
  return {
    success: true,
    snapshot: createVideoRecordingSurfaceSnapshot(readyLease, settings),
    surfaceSessionId: readyLease.surfaceSessionId,
    surfaceToken: readyLease.surfaceToken,
  };
}

export async function startSavedTabVideoRecording(
  tabId: number,
  ownerSenderUrl: string | undefined
) {
  if (!ownerSenderUrl) throw new Error('Unauthorized recording surface sender');
  const lease = await requestVideoRecordingSurface({ entry: 'manual', tabId });
  await ensureActivePageAccessRuntime(tabId, 'Page access is required for tab recording.');
  await ensureMediaHubStorageHeadroom();
  const [settings, appSettings, uiState] = await Promise.all([
    loadVideoSettings(),
    loadSettings(),
    loadVideoUiState(),
  ]);
  const viewportPresetId = await resolveContextMenuVideoPreset(appSettings);
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
  if (result.result === 'failed') throw new Error(result.error);
  const recordingId = result.result === 'accepted' ? result.recordingId : null;
  const next = (await updateVideoRecordingSurface(lease.surfaceSessionId, {
    lifecycle: result.result === 'accepted' ? 'ready' : 'degraded',
    recordingId,
  }))!;
  return {
    success: result.result === 'accepted',
    result: result.result,
    snapshot: createVideoRecordingSurfaceSnapshot(next, settings),
    surfaceSessionId: next.surfaceSessionId,
    surfaceToken: next.surfaceToken,
  };
}
