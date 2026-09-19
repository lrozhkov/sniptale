import {
  QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
  type QuickEditAdvancedState,
  type QuickEditAdvancedContent,
} from './types';

/** Defaults for workspaces persisted before advanced quick-editor state existed. */
export function createQuickEditAdvancedState(): QuickEditAdvancedState {
  return {
    schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
    ui: {
      mode: 'basic',
      tracks: { actions: true, zoom: false, audio: false },
      overlaysVisible: true,
    },
    zoom: { enabled: false, regions: [] },
    background: { enabled: false },
    audio: { original: { muted: false, volume: 1 }, voiceover: [], music: [] },
  };
}

/** Content defaults: the identity every advancedContent history replay starts from. */
export function createQuickEditAdvancedContent(): QuickEditAdvancedContent {
  const state = createQuickEditAdvancedState();
  return {
    schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
    zoom: state.zoom,
    background: state.background,
    audio: state.audio,
  };
}
