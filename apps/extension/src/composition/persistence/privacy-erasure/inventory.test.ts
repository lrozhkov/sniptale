import { expect, it } from 'vitest';

import { EXPECTED_STORES } from '../infrastructure/indexed-db/core.stores.ts';
import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_PROVIDERS_KEY,
  AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY,
} from '../ai-settings/constants';
import {
  buildBrowserStorageErasurePlan,
  getIndexedDbStoresForLocalExtensionDataErasure,
  LOCAL_EXTENSION_PAGE_STORAGE_KEYS,
} from './inventory';

it('uses the canonical IndexedDB store inventory for local data erasure', () => {
  expect(getIndexedDbStoresForLocalExtensionDataErasure()).toEqual(EXPECTED_STORES);
});

it('preserves preferences and AI provider secrets for the default delete-data mode', () => {
  const plan = buildBrowserStorageErasurePlan({
    includeAiProviderSecrets: false,
    preservePreferences: true,
  });

  expect(plan.local).not.toContain('sniptale-theme-preference');
  expect(plan.local).not.toContain('sniptale_ai_modal_spoiler_open');
  expect(plan.local).not.toContain('sniptale_editor_file_menu_save_to_folder_open');
  expect(plan.local).not.toContain('sniptale_popup_export_preferences');
  expect(plan.local).not.toContain('sniptale_video_editor_preview_preferences');
  expect(plan.local).not.toContain('sniptale_video_settings');
  expect(plan.local).not.toContain(AI_PROVIDERS_KEY);
  expect(plan.local).not.toContain(AI_PROVIDER_SECRETS_KEY);
  expect(plan.local).not.toContain(AI_LOCAL_SECRET_KEY_STORAGE_KEY);
  expect(plan.local).toContain('llm_request_history');
  expect(plan.local).toContain('sniptale_prompt_templates');
  expect(plan.local).toContain('sniptale.gallery.command-palette');
  expect(plan.local).toContain('sniptale.settings.command-palette');
  expect(plan.local).toContain('sniptale.video-editor.command-palette');
  expect(plan.localPrefixes).toContain('sniptale_video_editor_track_panel_prefs:');
  expect(plan.session).toContain('diagnostics-active-sessions');
  expect(plan.session).toContain('video-project-export-capabilities');
  expect(plan.session).toContain('sniptale_page_access_active_tabs');
  expect(plan.session).toContain('sniptale_popup_export_tab_selection_session');
  expect(plan.session).toContain(AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY);
  expect(plan.session).toContain(AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY);
  expect(plan.sessionPrefixes).toContain('scenarioPresentationSession:');
  expect(plan.sessionPrefixes).toContain('sniptale.content.pin-to-tab:tab:');
  expect(plan.sync).toEqual([]);
});

it('removes preferences and AI provider secrets for factory reset mode', () => {
  const plan = buildBrowserStorageErasurePlan({
    includeAiProviderSecrets: true,
    preservePreferences: false,
  });

  expect(plan.local).toContain('sniptale-theme-preference');
  expect(plan.local).toContain('sniptale_ai_modal_spoiler_open');
  expect(plan.local).toContain('sniptale_export_json_spoiler_open');
  expect(plan.local).toContain('sniptale_export_md_spoiler_open');
  expect(plan.local).toContain('sniptale_editor_file_menu_save_to_folder_open');
  expect(plan.local).toContain('sniptale_popup_export_preferences');
  expect(plan.local).toContain('sniptale_video_editor_preview_preferences');
  expect(plan.local).toContain('sniptale_scenario_editor_navigator_collapsed');
  expect(plan.local).toContain('sniptale_video_settings');
  expect(plan.local).toContain('sniptale.editor.command-palette');
  expect(plan.local).toContain('sniptale.gallery.command-palette');
  expect(plan.local).toContain('sniptale.popup.command-palette');
  expect(plan.local).toContain('sniptale.settings.command-palette');
  expect(plan.local).toContain('sniptale.video-editor.command-palette');
  expect(plan.local).toContain(AI_PROVIDERS_KEY);
  expect(plan.local).toContain(AI_PROVIDER_SECRETS_KEY);
  expect(plan.local).toContain(AI_LOCAL_SECRET_KEY_STORAGE_KEY);
  expect(plan.localPrefixes).toContain('sniptale_video_editor_track_panel_prefs:');
  expect(plan.sync).toContain('sniptale_settings');
  expect(plan.sync).toContain('sniptale_auto_blur_settings');
});

it('includes extension-page trace localStorage in the page-local erasure inventory', () => {
  expect(LOCAL_EXTENSION_PAGE_STORAGE_KEYS).toContain('sniptale:trace:namespaces');
});
