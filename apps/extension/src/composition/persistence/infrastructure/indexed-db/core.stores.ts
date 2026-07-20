// Keep the IndexedDB name stable so existing user media/projects remain readable across rebrands.
export const DB_NAME = 'sniptale-video-db';
export const DB_VERSION = 21;

export const STORE_NAME = 'recordings';
export const RECORDING_TELEMETRY_STORE = 'recording_telemetry';
export const DIAGNOSTICS_META_STORE = 'diagnostics_meta';
export const DIAGNOSTICS_EVENTS_STORE = 'diagnostics_events';
export const VIDEO_PROJECTS_STORE = 'video_projects';
export const SCENARIO_PROJECTS_STORE = 'scenario_projects';
export const PROJECT_ASSETS_STORE = 'project_assets';
export const SCENARIO_ASSETS_STORE = 'scenario_assets';
export const SCENARIO_PENDING_ASSETS_STORE = 'scenario_pending_assets';
export const PROJECT_EXPORTS_STORE = 'project_exports';
export const SCENARIO_EXPORTS_STORE = 'scenario_exports';
export const SCENARIO_STEP_EDITOR_DOCUMENTS_STORE = 'scenario_step_editor_documents';
export const MEDIA_LIBRARY_STORE = 'media_library';
export const THUMBNAILS_STORE = 'thumbnails';
export const EDITOR_SESSIONS_STORE = 'editor_sessions';
export const WEB_SNAPSHOTS_STORE = 'web_snapshots';
export const VIDEO_EFFECT_BUNDLES_STORE = 'video_effect_bundles';
export const PROJECT_EXPORT_INPUTS_STORE = 'project_export_inputs';
export const PAGE_STYLE_ASSETS_STORE = 'page_style_assets';
export const EDITOR_CUSTOM_SHAPES_STORE = 'editor_custom_shapes';
export const STATE_MANAGER_STORE = 'state_manager';
export const NATIVE_TRANSFER_SESSIONS_STORE = 'native_transfer_sessions';
export const NATIVE_TRANSFER_CHUNKS_STORE = 'native_transfer_chunks';

export const EXPECTED_STORES = [
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  DIAGNOSTICS_META_STORE,
  DIAGNOSTICS_EVENTS_STORE,
  VIDEO_PROJECTS_STORE,
  SCENARIO_PROJECTS_STORE,
  PROJECT_ASSETS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PENDING_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
  EDITOR_SESSIONS_STORE,
  WEB_SNAPSHOTS_STORE,
  VIDEO_EFFECT_BUNDLES_STORE,
  PROJECT_EXPORT_INPUTS_STORE,
  PAGE_STYLE_ASSETS_STORE,
  EDITOR_CUSTOM_SHAPES_STORE,
  STATE_MANAGER_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
  NATIVE_TRANSFER_CHUNKS_STORE,
] as const;

export const EXPECTED_INDEXES = {
  [STORE_NAME]: ['createdAt'],
  [RECORDING_TELEMETRY_STORE]: ['updatedAt'],
  [DIAGNOSTICS_EVENTS_STORE]: ['recordingId'],
  [VIDEO_PROJECTS_STORE]: ['updatedAt'],
  [SCENARIO_PROJECTS_STORE]: ['updatedAt'],
  [PROJECT_ASSETS_STORE]: ['createdAt'],
  [SCENARIO_ASSETS_STORE]: ['projectId', 'createdAt'],
  [SCENARIO_PENDING_ASSETS_STORE]: ['tabId', 'createdAt'],
  [PROJECT_EXPORTS_STORE]: ['projectId', 'createdAt'],
  [SCENARIO_EXPORTS_STORE]: ['projectId', 'createdAt'],
  [SCENARIO_STEP_EDITOR_DOCUMENTS_STORE]: ['projectId', 'updatedAt'],
  [MEDIA_LIBRARY_STORE]: ['createdAt', 'kind'],
  [EDITOR_SESSIONS_STORE]: ['updatedAt'],
  [WEB_SNAPSHOTS_STORE]: ['createdAt'],
  [VIDEO_EFFECT_BUNDLES_STORE]: ['enabled', 'updatedAt'],
  [PROJECT_EXPORT_INPUTS_STORE]: ['createdAt'],
  [PAGE_STYLE_ASSETS_STORE]: ['createdAt', 'kind'],
  [EDITOR_CUSTOM_SHAPES_STORE]: ['enabled', 'updatedAt'],
  [STATE_MANAGER_STORE]: ['domain', 'updatedAtEpochMs'],
  [NATIVE_TRANSFER_SESSIONS_STORE]: ['createdAt', 'updatedAt'],
  [NATIVE_TRANSFER_CHUNKS_STORE]: ['sessionId'],
} as const satisfies Partial<Record<(typeof EXPECTED_STORES)[number], readonly string[]>>;
