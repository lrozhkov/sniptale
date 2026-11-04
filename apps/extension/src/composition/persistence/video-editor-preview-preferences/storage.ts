import { browserStorage } from '../infrastructure/browser-storage';
import { tryRunWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  parseCompleteVideoEditorPreviewPreferences,
  parseVideoEditorPreviewPreferences,
  type VideoEditorPreviewPreferences,
} from './model';

export const VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY =
  'sniptale_video_editor_preview_preferences';

type PreviewPreferenceStorageArea = Pick<typeof browserStorage.local, 'get' | 'set'>;

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

      const previous = writeQueue;
      // Admit before the local queue so erasure drains every accepted snapshot.
      const operation = tryRunWithPersistenceMutationPermit(async (permit) => {
        await previous;
        await area.set({ [VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY]: preferences }, permit);
        return true;
      }).then((admitted) => {
        if (admitted === null)
          throw new Error('Video editor preview preference save refused during erasure');
      });
      writeQueue = operation.catch(() => undefined);
      return operation;
    },
  };
}
