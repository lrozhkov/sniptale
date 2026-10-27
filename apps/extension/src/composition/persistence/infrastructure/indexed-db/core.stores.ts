// This is the first stable beta persistence generation. Alpha databases use a different name and
// are intentionally excluded from the supported migration graph.
export const DB_NAME = 'sniptale-db';
export const DB_VERSION = 42;
export const LEGACY_ALPHA_DB_NAMES = ['sniptale-video-db'] as const;
export const ALPHA_RESET_JOURNAL_KEY = 'sniptale.persistence.alpha-reset.v1';
export const DATABASE_RESET_JOURNAL_KEY = 'sniptale.persistence.database-reset.v1';
export const DATABASE_BACKUP_RECEIPT_KEY = 'sniptale.persistence.backup-receipt.v1';

export const VOICE_INPUT_HISTORY_STORE = 'voice_input_history';
export const STORE_NAME = 'recordings';
export const RECORDING_RECOVERY_SESSIONS_STORE = 'recording_recovery_sessions';
export const RECORDING_RECOVERY_BLOCKS_STORE = 'recording_recovery_blocks';
export const RECORDING_TELEMETRY_STORE = 'recording_telemetry';
export const DIAGNOSTICS_META_STORE = 'diagnostics_meta';
export const DIAGNOSTICS_EVENTS_STORE = 'diagnostics_events';
export const VIDEO_PROJECTS_STORE = 'video_projects';
export const VIDEO_PROJECT_REVISIONS_STORE = 'video_project_revisions';
export const SCENARIO_PROJECTS_STORE = 'scenario_projects';
export const SCENARIO_PROJECT_HISTORY_STORE = 'scenario_project_history';
export const SCENARIO_PROJECT_UNITS_STORE = 'scenario_project_units';
export const PROJECT_ASSETS_STORE = 'project_assets';
export const SCENARIO_ASSETS_STORE = 'scenario_assets';
export const SCENARIO_PENDING_ASSETS_STORE = 'scenario_pending_assets';
export const PROJECT_EXPORTS_STORE = 'project_exports';
export const SCENARIO_EXPORTS_STORE = 'scenario_exports';
export const SCENARIO_STEP_EDITOR_DOCUMENTS_STORE = 'scenario_step_editor_documents';
export const MEDIA_LIBRARY_STORE = 'media_library';
export const THUMBNAILS_STORE = 'thumbnails';
export const IMAGE_WORKSPACES_STORE = 'image_workspaces';
export const VIDEO_WORKSPACES_STORE = 'video_workspaces';
export const VIDEO_WORKSPACE_HISTORY_STORE = 'video_workspace_history';
export const VIDEO_WORKSPACE_DRAFTS_STORE = 'video_workspace_drafts';
export const AGGREGATE_PRESENTATIONS_STORE = 'aggregate_presentations';
export const WEB_SNAPSHOTS_STORE = 'web_snapshots';
export const VIDEO_EFFECT_BUNDLES_STORE = 'video_effect_bundles';
export const PROJECT_EXPORT_INPUTS_STORE = 'project_export_inputs';
export const FRAME_ANNOTATION_RASTER_JOBS_STORE = 'frame_annotation_raster_jobs';
export const EDITOR_CUSTOM_SHAPES_STORE = 'editor_custom_shapes';
export const STATE_MANAGER_STORE = 'state_manager';
export const NATIVE_TRANSFER_SESSIONS_STORE = 'native_transfer_sessions';
export const NATIVE_TRANSFER_CHUNKS_STORE = 'native_transfer_chunks';
export const ASSET_REFS_STORE = 'asset_refs';
export const ASSET_OWNERS_STORE = 'asset_owners';
export const ASSET_OPERATIONS_STORE = 'asset_operations';
export const SYNC_CAPTURE_STORE = 'sync_capture';
export const SYNC_OUTBOX_STORE = 'sync_outbox';
export const SYNC_CATALOG_CACHE_STORE = 'sync_catalog_cache';
export const SCHEMA_CONTRACTS_STORE = 'schema_contracts';

export const EXPECTED_STORES = [
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  RECORDING_RECOVERY_SESSIONS_STORE,
  RECORDING_RECOVERY_BLOCKS_STORE,
  DIAGNOSTICS_META_STORE,
  DIAGNOSTICS_EVENTS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_PROJECT_REVISIONS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_PROJECT_HISTORY_STORE,
  SCENARIO_PROJECT_UNITS_STORE,
  PROJECT_ASSETS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PENDING_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
  IMAGE_WORKSPACES_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  WEB_SNAPSHOTS_STORE,
  VIDEO_EFFECT_BUNDLES_STORE,
  PROJECT_EXPORT_INPUTS_STORE,
  FRAME_ANNOTATION_RASTER_JOBS_STORE,
  EDITOR_CUSTOM_SHAPES_STORE,
  STATE_MANAGER_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
  NATIVE_TRANSFER_CHUNKS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_OPERATIONS_STORE,
  VOICE_INPUT_HISTORY_STORE,
  SYNC_CAPTURE_STORE,
  SYNC_OUTBOX_STORE,
  SYNC_CATALOG_CACHE_STORE,
  SCHEMA_CONTRACTS_STORE,
] as const;

export const EXPECTED_INDEXES = {
  [STORE_NAME]: ['createdAt'],
  [RECORDING_TELEMETRY_STORE]: ['updatedAt'],
  [RECORDING_RECOVERY_SESSIONS_STORE]: ['createdAt'],
  [RECORDING_RECOVERY_BLOCKS_STORE]: ['id'],
  [DIAGNOSTICS_META_STORE]: [],
  [DIAGNOSTICS_EVENTS_STORE]: ['recordingId'],
  [VIDEO_PROJECTS_STORE]: ['updatedAt', 'usageReferenceKeys'],
  [VIDEO_PROJECT_REVISIONS_STORE]: [],
  [SCENARIO_PROJECTS_STORE]: ['updatedAt'],
  [SCENARIO_PROJECT_HISTORY_STORE]: ['projectId'],
  [SCENARIO_PROJECT_UNITS_STORE]: ['projectId'],
  [PROJECT_ASSETS_STORE]: ['createdAt', 'originMediaId'],
  [SCENARIO_ASSETS_STORE]: ['projectId', 'createdAt', 'borrowedMediaId', 'galleryAssetId'],
  [SCENARIO_PENDING_ASSETS_STORE]: ['tabId', 'createdAt'],
  [PROJECT_EXPORTS_STORE]: ['projectId', 'createdAt'],
  [SCENARIO_EXPORTS_STORE]: ['projectId', 'createdAt'],
  [SCENARIO_STEP_EDITOR_DOCUMENTS_STORE]: ['projectId', 'updatedAt'],
  [MEDIA_LIBRARY_STORE]: ['createdAt', 'kind'],
  [THUMBNAILS_STORE]: [],
  [IMAGE_WORKSPACES_STORE]: ['updatedAt'],
  [VIDEO_WORKSPACES_STORE]: ['updatedAt', 'usageReferenceKeys'],
  [VIDEO_WORKSPACE_HISTORY_STORE]: ['aggregateId'],
  [VIDEO_WORKSPACE_DRAFTS_STORE]: ['updatedAt'],
  [AGGREGATE_PRESENTATIONS_STORE]: ['updatedAt'],
  [WEB_SNAPSHOTS_STORE]: ['createdAt'],
  [VIDEO_EFFECT_BUNDLES_STORE]: ['enabled', 'updatedAt'],
  [PROJECT_EXPORT_INPUTS_STORE]: ['createdAt'],
  [FRAME_ANNOTATION_RASTER_JOBS_STORE]: ['createdAt'],
  [EDITOR_CUSTOM_SHAPES_STORE]: ['enabled', 'updatedAt'],
  [STATE_MANAGER_STORE]: ['domain', 'updatedAtEpochMs'],
  [NATIVE_TRANSFER_SESSIONS_STORE]: ['createdAt', 'updatedAt'],
  [NATIVE_TRANSFER_CHUNKS_STORE]: ['sessionId'],
  [ASSET_REFS_STORE]: ['createdAt'],
  [ASSET_OWNERS_STORE]: ['assetId'],
  [ASSET_OPERATIONS_STORE]: ['status', 'updatedAt'],
  [VOICE_INPUT_HISTORY_STORE]: [],
  [SYNC_CAPTURE_STORE]: ['kind', 'rootKey', 'createdAt'],
  [SYNC_OUTBOX_STORE]: [],
  [SYNC_CATALOG_CACHE_STORE]: [],
  [SCHEMA_CONTRACTS_STORE]: [],
} as const satisfies Record<(typeof EXPECTED_STORES)[number], readonly string[]>;
