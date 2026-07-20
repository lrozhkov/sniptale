import type { CaptureActionType } from '../../capture/action';
import type { ScenarioCaptureMode, ScenarioExportFormat } from './base';

export interface ScenarioSessionState {
  enabled: boolean;
  captureMode: ScenarioCaptureMode;
  projectId: string | null;
  projectName: string | null;
  rememberProjectSelection: boolean;
  pendingProjectSelection: boolean;
  sidebarVisible: boolean;
}

export interface ScenarioRecorderSurfaceState {
  screenshotMode: boolean;
  toolbarVisible: boolean;
  captureAction: CaptureActionType;
}

export interface ScenarioRestoreSnapshot {
  session: ScenarioSessionState;
  surface: ScenarioRecorderSurfaceState;
  projectRevision: number;
}

export interface ScenarioAssetMetadata {
  width: number;
  height: number;
  mimeType: string;
  size: number;
}

export interface ScenarioExportResult {
  blob: Blob;
  filename: string;
  format: ScenarioExportFormat;
}

export interface ScenarioAssetEntry extends ScenarioAssetMetadata {
  id: string;
  projectId: string;
  galleryAssetId: string | null;
  createdAt: number;
}

export interface ScenarioExportEntry {
  id: string;
  projectId: string;
  format: ScenarioExportFormat;
  filename: string;
  createdAt: number;
  size: number;
}
