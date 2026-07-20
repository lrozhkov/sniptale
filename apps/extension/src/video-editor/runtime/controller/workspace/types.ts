import type React from 'react';
import type { SaveStateMeta, VideoEditorLibrariesState } from '../../app-model/types';
import type { VideoEditorActionHandlers } from '../../commands';
import type { VideoEditorRuntimeController } from '../../session';
import type { VideoEditorCursorDetectionController } from '../../cursor-detection/analysis';
import type { VideoEditorSelections } from '../selections';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import type { VideoEditorControllerStorePort } from '../../../contracts/controller-store';

export interface CreateVideoEditorWorkspaceArgs {
  actions: VideoEditorActionHandlers;
  cursorDetection: VideoEditorCursorDetectionController;
  diagnosticsContent: React.ReactNode;
  libraries: VideoEditorLibrariesState;
  runtime: VideoEditorRuntimeController;
  saveStateMeta: SaveStateMeta;
  selections: VideoEditorSelections;
  store: VideoEditorControllerStorePort;
  workspace: VideoEditorWorkspaceState;
}
