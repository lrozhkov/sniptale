import { browserStorage } from '../infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  VideoRecordingSettings,
  VideoRecordingUiState,
} from '@sniptale/runtime-contracts/video/types/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { parseStoredVideoSettings, parseStoredVideoUiState } from './guards';

const VIDEO_SETTINGS_KEY = 'sniptale_video_settings';
const VIDEO_UI_STATE_KEY = 'sniptale_video_ui_state';
const logger = createLogger({ namespace: 'SharedVideoStorage' });

/**
 * Saves video recording settings to chrome.storage.local
 */
export async function saveVideoSettings(settings: VideoRecordingSettings): Promise<void> {
  await browserStorage.local.set({ [VIDEO_SETTINGS_KEY]: settings });
  logger.debug('Saved video settings');
}

/**
 * Loads video recording settings from chrome.storage.local
 */
export async function loadVideoSettings(): Promise<VideoRecordingSettings> {
  const result = await browserStorage.local.get([VIDEO_SETTINGS_KEY]);
  const parsedSettings = parseStoredVideoSettings(result[VIDEO_SETTINGS_KEY]);

  if (parsedSettings.hasInvalidRoot) {
    logger.warn('Ignoring invalid video settings payload root from storage');
  }

  if (parsedSettings.invalidFieldCount > 0) {
    logger.warn('Dropped invalid video settings fields from storage', {
      invalidFieldCount: parsedSettings.invalidFieldCount,
    });
  }

  return { ...DEFAULT_VIDEO_SETTINGS, ...parsedSettings.value };
}

const DEFAULT_VIDEO_UI_STATE: VideoRecordingUiState = {
  captureMode: CaptureMode.TAB,
  viewportPresetId: null,
};

/**
 * Сохраняет UI-состояние popup для видеозаписи.
 */
export async function saveVideoUiState(state: VideoRecordingUiState): Promise<void> {
  await browserStorage.local.set({ [VIDEO_UI_STATE_KEY]: state });
  logger.debug('Saved video UI state');
}

/**
 * Загружает UI-состояние popup для видеозаписи.
 */
export async function loadVideoUiState(): Promise<VideoRecordingUiState> {
  const result = await browserStorage.local.get([VIDEO_UI_STATE_KEY]);
  const parsedState = parseStoredVideoUiState(result[VIDEO_UI_STATE_KEY]);

  if (parsedState.hasInvalidRoot) {
    logger.warn('Ignoring invalid video UI state payload root from storage');
  }

  if (parsedState.invalidFieldCount > 0) {
    logger.warn('Dropped invalid video UI state fields from storage', {
      invalidFieldCount: parsedState.invalidFieldCount,
    });
  }

  return { ...DEFAULT_VIDEO_UI_STATE, ...parsedState.value };
}
