import { AI_OWNER_MAPPINGS } from './ai.mjs';
import { AS_NEVER_REMOVAL_OWNER_MAPPINGS } from './as-never.mjs';
import { AUDIT_OWNER_MAPPINGS } from './audit.mjs';
import { AUDIT_MEDIA_OWNER_MAPPINGS } from './audit-media.mjs';
import { AUDIT_STORAGE_OWNER_MAPPINGS } from './audit-storage.mjs';
import { BACKGROUND_STORAGE_OWNER_MAPPINGS } from './background-storage.mjs';
import { BG_RUNTIME_MESSAGING_OWNER_MAPPINGS } from './background-runtime-messaging.mjs';
import { CAST_CLEANUP_OWNER_MAPPINGS } from './cast-cleanup.mjs';
import { CONTENT_ROOT_OWNER_MAPPINGS } from './content-root.mjs';
import { COVERAGE_ROLLOUT_OWNER_MAPPINGS } from './coverage-rollout.mjs';
import { FOCUSED_COVERAGE_DB_OWNER_MAPPINGS } from './db.mjs';
import { EDITOR_OWNER_MAPPINGS } from './editor.mjs';
import { EFFECT_V1_OWNER_MAPPINGS } from './effect-v1.mjs';
import { EXTENSION_UI_ENTRYPOINT_OWNER_MAPPINGS } from './extension-ui-entrypoints.mjs';
import { LOCAL_OWNER_MAPPINGS } from './local.mjs';
import { MESSAGING_OWNER_MAPPINGS } from './messaging.mjs';
import { PAGE_ACCESS_OWNER_MAPPINGS } from './page-access.mjs';
import { PAGE_STYLE_OWNER_MAPPINGS } from './page-style.mjs';
import { PLATFORM_BACKUP_OWNER_MAPPINGS } from './platform-backup.mjs';
import { SCENARIO_OWNER_MAPPINGS } from './scenario.mjs';
import { SCENARIO_STAGE_OWNER_MAPPINGS } from './scenario-stage.mjs';
import { SETTINGS_OWNER_MAPPINGS } from './settings.mjs';
import { SHARED_FACADE_OWNER_MAPPINGS } from './shared-facade.mjs';
import { VIDEO_EDITOR_ARCHITECTURE_OWNER_MAPPINGS } from './video-editor-architecture.mjs';
import { VIDEO_RECORDING_OWNER_MAPPINGS } from './video-recording.mjs';

export const FOCUSED_COVERAGE_OWNER_MAPPINGS = [
  ...MESSAGING_OWNER_MAPPINGS,
  ...VIDEO_RECORDING_OWNER_MAPPINGS,
  ...FOCUSED_COVERAGE_DB_OWNER_MAPPINGS,
  ...PLATFORM_BACKUP_OWNER_MAPPINGS,
  ...CONTENT_ROOT_OWNER_MAPPINGS,
  ...EXTENSION_UI_ENTRYPOINT_OWNER_MAPPINGS,
  ...COVERAGE_ROLLOUT_OWNER_MAPPINGS,
  ...EFFECT_V1_OWNER_MAPPINGS,
  ...AI_OWNER_MAPPINGS,
  ...EDITOR_OWNER_MAPPINGS,
  ...VIDEO_EDITOR_ARCHITECTURE_OWNER_MAPPINGS,
  ...PAGE_STYLE_OWNER_MAPPINGS,
  ...PAGE_ACCESS_OWNER_MAPPINGS,
  ...BACKGROUND_STORAGE_OWNER_MAPPINGS,
  ...BG_RUNTIME_MESSAGING_OWNER_MAPPINGS,
  ...AS_NEVER_REMOVAL_OWNER_MAPPINGS,
  ...CAST_CLEANUP_OWNER_MAPPINGS,
  ...SCENARIO_OWNER_MAPPINGS,
  ...SCENARIO_STAGE_OWNER_MAPPINGS,
  ...AUDIT_OWNER_MAPPINGS,
  ...AUDIT_MEDIA_OWNER_MAPPINGS,
  ...AUDIT_STORAGE_OWNER_MAPPINGS,
  ...SETTINGS_OWNER_MAPPINGS,
  ...SHARED_FACADE_OWNER_MAPPINGS,
  ...LOCAL_OWNER_MAPPINGS,
];
