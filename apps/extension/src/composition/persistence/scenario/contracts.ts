import type { ScenarioExportFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { EditorDocument } from '../../../features/editor/document/types';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';

export interface ScenarioProjectEntry {
  id: string;
  project: ScenarioProject | ScenarioProjectV3;
  createdAt: number;
  updatedAt: number;
}

export interface ScenarioAssetEntry {
  id: string;
  projectId: string;
  galleryAssetId: string | null;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  createdAt: number;
  size: number;
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
}
