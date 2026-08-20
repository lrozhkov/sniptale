import type { ScenarioExportFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { EditorDocument } from '../../../features/editor/document/types';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';
import type { LibraryLifecycle } from '../library-lifecycle/contracts';
import type { AssetRef } from '../assets';
import type { PersistedEditorDocumentV3 } from '../document-assets';

export interface ScenarioProjectEntry {
  id: string;
  project: ScenarioProject | ScenarioProjectV3;
  createdAt: number;
  updatedAt: number;
  lifecycle?: LibraryLifecycle;
  /** Missing only on legacy rows; parsed as revision 0. */
  workspaceRevision?: number;
}

export interface ScenarioAssetEntry {
  assetId: string;
  id: string;
  projectId: string;
  galleryAssetId: string | null;
  mimeType: string;
  width: number;
  height: number;
  createdAt: number;
  size: number;
}

export interface HydratedScenarioAssetEntry extends ScenarioAssetEntry {
  file: File;
}

export interface PreparedScenarioAssetEntry extends ScenarioAssetEntry {
  assetRef: AssetRef;
}

export interface PendingScenarioAssetEntry {
  id: string;
  tabId: number;
  galleryAssetId: string | null;
  blob: Blob;
  mimeType: string;
  createdAt: number;
  size: number;
}

export interface ScenarioExportEntry {
  id: string;
  projectId: string;
  format: ScenarioExportFormat;
  filename: string;
  createdAt: number;
  size: number;
}

export interface ScenarioStepEditorDocumentEntry {
  stepId: string;
  projectId: string;
  document: EditorDocument;
  createdAt: number;
  updatedAt: number;
  releaseDocumentAssets?(): void;
}

export interface StoredScenarioStepEditorDocumentEntry extends Omit<
  ScenarioStepEditorDocumentEntry,
  'document'
> {
  document: PersistedEditorDocumentV3;
}
