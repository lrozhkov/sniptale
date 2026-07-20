import { createVideoEditorPreviewPreferencesStorage } from './storage';

export * from './model';
export { VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY } from './storage';
export type { VideoEditorPreviewPreferencesStorage } from './storage';

const defaultStorage = createVideoEditorPreviewPreferencesStorage();

export const loadVideoEditorPreviewPreferences = () => defaultStorage.load();
export const saveVideoEditorPreviewPreferences = defaultStorage.save;
export { createVideoEditorPreviewPreferencesStorage };
