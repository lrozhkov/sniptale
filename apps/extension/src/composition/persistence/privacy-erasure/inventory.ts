import { EXPECTED_STORES } from '../infrastructure/indexed-db/core.stores.ts';
import {
  AI_CHROME_ENABLED_KEY,
  AI_DEFAULT_MODEL_KEY,
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_MODELS_KEY,
  AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_PROVIDERS_KEY,
  AI_SECRET_PROTECTION_KEY,
  AI_SECRET_PROTECTION_TRANSITION_KEY,
  AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY,
  AI_STORAGE_MIGRATION_PHASE_KEY,
  AI_STORAGE_VERSION_KEY,
  LEGACY_AI_MASTER_KEY_STORAGE_KEY,
} from '../ai-settings/constants';
import type {
  BrowserStorageErasurePlan,
  LocalExtensionDataErasureOptions,
} from '@sniptale/runtime-contracts/privacy-erasure/types';

export const LOCAL_EXTENSION_PAGE_STORAGE_KEYS = [
  'sniptale-theme-preference',
  'sniptale-locale-preference',
  'sniptale.popup.trace',
  'sniptale.popup.perf',
  'sniptale:trace:namespaces',
] as const;

export const LOCAL_EXTENSION_PAGE_STORAGE_PREFIXES = [
  'sniptale-editor-inspector-template-view:',
] as const;

const localPreferenceKeys = [
  'sniptale-theme-preference',
  'sniptale-locale-preference',
  'sniptale_ai_modal_spoiler_open',
  'sniptale_export_json_spoiler_open',
  'sniptale_export_md_spoiler_open',
  'sniptale_editor_file_menu_save_to_folder_open',
  'sniptale_popup_export_preferences',
  'sniptale_video_editor_preview_preferences',
  'sniptale_scenario_editor_navigator_collapsed',
  'sniptale_video_settings',
  'sniptale_video_ui_state',
  'sniptale_editor_export_settings',
  'sniptale_editor_workspace_defaults',
  'sniptale_editor_presets',
  'sniptale_quick_actions',
  'sniptale_quick_actions_display_mode',
] as const;

const syncPreferenceKeys = [
  'sniptale_settings',
  'sniptale_highlighter_settings',
  'sniptale_auto_blur_settings',
] as const;

const aiProviderConfigurationKeys = [
  AI_PROVIDERS_KEY,
  AI_MODELS_KEY,
  AI_DEFAULT_MODEL_KEY,
  AI_CHROME_ENABLED_KEY,
  AI_STORAGE_VERSION_KEY,
] as const;

const aiProviderSecretKeys = [
  AI_PROVIDER_SECRETS_KEY,
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_SECRET_PROTECTION_KEY,
  AI_SECRET_PROTECTION_TRANSITION_KEY,
  AI_STORAGE_MIGRATION_PHASE_KEY,
  LEGACY_AI_MASTER_KEY_STORAGE_KEY,
] as const;

const localSensitiveKeys = [
  'llm_request_history',
  'sniptale_ai_global_prompt',
  'sniptale_ai_scenario_editor_prompt',
  'sniptale_last_save_as_dir',
  'sniptale_prompt_templates',
  'sniptale_template_order',
  'sniptale_page_style_registry',
  'sniptale_editor_recent_colors',
  'sniptale_editor_floating_layers',
  'sniptale.editor.command-palette',
  'sniptale.gallery.command-palette',
  'sniptale.popup.command-palette',
  'sniptale.settings.command-palette',
  'sniptale.video-editor.command-palette',
] as const;

const sessionSensitiveKeys = [
  'diagnostics-active-sessions',
  'scenario-tab-sessions',
  'video-active-recording-lease',
  'video-project-export-capabilities',
  'sniptale_page_access_active_tabs',
  'sniptale_popup_export_tab_selection_session',
  'sniptale_project_export_active_job',
  AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY,
  AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY,
] as const;

const localSensitiveKeyPrefixes = ['sniptale_video_editor_track_panel_prefs:'] as const;
const sessionSensitiveKeyPrefixes = [
  'scenarioPresentationSession:',
  'sniptale.content.pin-to-tab:tab:',
] as const;

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function removePreservedKeys(keys: readonly string[], preserved: readonly string[]): string[] {
  const preservedSet = new Set(preserved);
  return keys.filter((key) => !preservedSet.has(key));
}

export function getIndexedDbStoresForLocalExtensionDataErasure(): readonly string[] {
  return EXPECTED_STORES;
}

export function buildBrowserStorageErasurePlan(
  options: LocalExtensionDataErasureOptions
): BrowserStorageErasurePlan {
  const preservedLocalKeys = [
    ...(options.preservePreferences ? localPreferenceKeys : []),
    ...(!options.includeAiProviderSecrets
      ? [...aiProviderConfigurationKeys, ...aiProviderSecretKeys]
      : []),
  ];
  const localKeys = uniqueStrings([
    ...localPreferenceKeys,
    ...localSensitiveKeys,
    ...aiProviderConfigurationKeys,
    ...aiProviderSecretKeys,
  ]);

  return {
    local: removePreservedKeys(localKeys, preservedLocalKeys),
    localPrefixes: [...localSensitiveKeyPrefixes],
    session: [...sessionSensitiveKeys],
    sessionPrefixes: [...sessionSensitiveKeyPrefixes],
    sync: options.preservePreferences ? [] : [...syncPreferenceKeys],
    syncPrefixes: [],
  };
}
