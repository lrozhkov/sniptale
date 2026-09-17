import { QUICK_EDIT_ADVANCED_SCHEMA_VERSION, type QuickEditAdvancedState } from './types';

/** Defaults for workspaces persisted before advanced quick-editor state existed. */
export function createQuickEditAdvancedState(): QuickEditAdvancedState {
  return {
    schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
    ui: {
      mode: 'basic',
      tracks: { actions: true, zoom: false, audio: false },
    },
    zoom: { enabled: false, regions: [] },
    background: { enabled: false },
    audio: { original: { muted: false, volume: 1 }, voiceover: [], music: [] },
  };
}
