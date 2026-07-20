import type React from 'react';
import { syncProjectSceneBackground } from '../../../features/video/project/scene/background';
import type { SaveStateMeta, VideoEditorLibrariesState } from '../app-model/types';
import type { VideoEditorActionHandlers } from '../commands';
import type { VideoEditorCursorDetectionController } from '../cursor-detection/analysis';
import type { VideoEditorRuntimeController } from '../session';
import type { VideoEditorSelections } from './selections';
import type { VideoEditorWorkspaceState } from './workspace-state';
import type { VideoEditorControllerStorePort } from '../../contracts/controller-store';
import { createSelectedClipActions } from './selected-clip-actions';
import { createWorkspaceProjectUpdaters } from './shared-actions';
import type { VideoEditorController } from './contracts/surface';
import type { VideoEditorWorkspaceController } from './contracts/workspace';
import {
  createVideoEditorCommandPaletteController,
  createVideoEditorOverlaysController,
  createVideoEditorShellController,
} from './shell';
import {
  createWorkspaceDiagnosticsController,
  createWorkspaceHeaderController,
  createWorkspaceLayoutController,
  createWorkspacePreviewController,
  createWorkspaceSidebarController,
  createWorkspaceTimelineController,
} from './workspace';

interface CreateVideoEditorControllerArgs {
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

export function createVideoEditorWorkspaceController(
  args: CreateVideoEditorControllerArgs
): VideoEditorWorkspaceController | null {
  const project = args.store.project;

  if (!project) {
    return null;
  }

  const workspaceProject = args.workspace.sceneBackgroundColors.preview
    ? {
        ...project,
        ...syncProjectSceneBackground(project, args.workspace.sceneBackgroundColors.preview),
      }
    : project;
  const projectUpdaters = createWorkspaceProjectUpdaters(args.store);
  const selectedClipActions = createSelectedClipActions(args.store);

  return {
    diagnostics: createWorkspaceDiagnosticsController(args.store),
    header: createWorkspaceHeaderController(args, workspaceProject),
    layout: createWorkspaceLayoutController(args.workspace),
    preview: createWorkspacePreviewController(
      args,
      args.runtime,
      workspaceProject,
      projectUpdaters
    ),
    sidebar: createWorkspaceSidebarController(args, workspaceProject, projectUpdaters),
    timeline: createWorkspaceTimelineController(
      args.store,
      args.runtime,
      project,
      args.actions,
      args.workspace,
      projectUpdaters,
      selectedClipActions
    ),
  };
}

export function createVideoEditorController(
  args: CreateVideoEditorControllerArgs
): VideoEditorController {
  return {
    overlays: createVideoEditorOverlaysController(args),
    palette: createVideoEditorCommandPaletteController({
      runtime: args.runtime,
      store: args.store,
      workspace: args.workspace,
    }),
    shell: createVideoEditorShellController(args.store),
    workspace: createVideoEditorWorkspaceController(args),
  };
}

export {
  createVideoEditorCommandPaletteController,
  createVideoEditorOverlaysController,
} from './shell';
