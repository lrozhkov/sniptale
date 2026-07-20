import type { BrowserStorageAreaAdapter } from '@sniptale/platform/browser/storage-types';

import { browserStorage } from '../infrastructure/browser-storage';
import {
  parseCompleteVideoEditorPreviewPreferences,
  parseVideoEditorPreviewPreferences,
  type VideoEditorPreviewPreferences,
} from './model';

export const VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY =
  'sniptale_video_editor_preview_preferences';

type PreviewPreferenceStorageArea = Pick<BrowserStorageAreaAdapter, 'get' | 'set'>;

export interface VideoEditorPreviewPreferencesStorage {
  load(): Promise<ReturnType<typeof parseVideoEditorPreviewPreferences>>;
  save(preferences: VideoEditorPreviewPreferences): Promise<void>;
}

export function createVideoEditorPreviewPreferencesStorage(
  area: PreviewPreferenceStorageArea = browserStorage.local
): VideoEditorPreviewPreferencesStorage {
  let writeQueue = Promise.resolve();

  return {
    async load() {
      const values = await area.get([VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY]);
      return parseVideoEditorPreviewPreferences(
        values[VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY]
      );
    },
    save(input) {
      const preferences = parseCompleteVideoEditorPreviewPreferences(input);
      if (!preferences) {
        return Promise.reject(new Error('Invalid video editor preview preferences'));
      }

      const operation = writeQueue.then(() =>
        area.set({ [VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY]: preferences })
      );
      writeQueue = operation.catch(() => undefined);
      return operation;
    },
  };
}
