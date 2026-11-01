import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

/** Private native storage metadata. This field is not part of portable source documents. */
export const ROW_REFERENCE_FIELD = '__sniptaleRetentionIndexV1';
export const ROW_REFERENCE_INDEX = 'retentionReferenceKeys';
export const UNKNOWN_ASSET_REFERENCES = 'unknown:asset';
export const UNKNOWN_MEDIA_REFERENCES = 'unknown:media';
export const UNKNOWN_HISTORY_REFERENCES = 'unknown:history';

export const REFERENCE_INDEX_STORES = [
  'asset_refs',
  'asset_owners',
  'asset_operations',
  'recordings',
  'project_assets',
  'project_exports',
  'scenario_assets',
  'scenario_exports',
  'scenario_step_editor_documents',
  'image_workspaces',
  'web_snapshots',
  'media_library',
  'sync_capture',
  'video_projects',
  'video_workspaces',
  'video_workspace_history',
  'project_export_inputs',
] as const;

type ReferenceKind =
  | 'asset'
  | 'media'
  | 'recording'
  | 'project-asset'
  | 'scenario-asset'
  | 'scenario-project';

/** Encode the namespace separately from the complete, unmodified source identity. */
export function rowReferenceKey(kind: ReferenceKind, id: string): string {
  return `${kind}:${id}`;
}

/** Preserve every source field except the single reserved native projection field. */
export function stripRowReferenceMetadata(value: unknown): unknown {
  if (!isRecord(value) || !Object.hasOwn(value, ROW_REFERENCE_FIELD)) return value;
  const result = { ...value };
  delete result[ROW_REFERENCE_FIELD];
  return result;
}

/** Replace imported projection data with keys derived by the admitted native writer. */
export function withRowReferenceMetadata(value: unknown, keys: readonly string[]): unknown {
  const source = stripRowReferenceMetadata(value);
  if (!isRecord(source)) throw new Error('Indexed source row must be an object.');
  return { ...source, [ROW_REFERENCE_FIELD]: [...new Set(keys)] };
}
