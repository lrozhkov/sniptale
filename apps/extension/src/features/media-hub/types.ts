import type { MediaAssetKind } from './media-types';

type StorageCleanupGroupId =
  | 'orphaned-raw-recordings'
  | 'heavy-files'
  | 'old-screenshots'
  | 'orphaned-project-assets'
  | 'broken-media-mirrors'
  | 'orphaned-thumbnails'
  | 'stale-editor-drafts'
  | 'orphaned-scenario-pending-assets'
  | 'orphaned-scenario-artifacts'
  | 'old-diagnostics';

type StorageCleanupTarget =
  | 'asset'
  | 'recording'
  | 'project-asset'
  | 'thumbnail'
  | 'editor-session'
  | 'scenario-pending-asset'
  | 'scenario-asset'
  | 'scenario-export'
  | 'scenario-step-document'
  | 'diagnostics';

export interface StorageCleanupCandidate {
  id: string;
  filename: string;
  size: number;
  createdAt: number;
  kind:
    | MediaAssetKind
    | 'recording'
    | 'thumbnail'
    | 'editor-session'
    | 'scenario-asset'
    | 'scenario-export'
    | 'scenario-step-document'
    | 'diagnostics';
  target: StorageCleanupTarget;
}

export interface StorageCleanupGroup {
  id: StorageCleanupGroupId;
  title: string;
  description: string;
  irreversibleLabel: string;
  potentialBytes: number;
  items: StorageCleanupCandidate[];
}

export interface StorageCleanupReport {
  groups: StorageCleanupGroup[];
  potentialBytes: number;
}
