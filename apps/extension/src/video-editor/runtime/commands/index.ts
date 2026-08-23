import { useAssetHandlers } from './assets';
import { useExportHandlers } from './export';
import { useProjectHandlers } from './project';
import type {
  AssetHandlerPort,
  ExportHandlerPort,
  ProjectHandlerPort,
  VideoEditorCommandHandlers,
} from './types';
import type { VideoEditorConfirmDialogState } from '../controller/workspace-state';

export type { VideoEditorActionHandlers, VideoEditorCommandHandlers } from './types';

interface VideoEditorActionConfirmHandlers {
  requestConfirm: (dialog: VideoEditorConfirmDialogState) => Promise<boolean>;
}

/**
 * Binds project, import, and export commands to the current editor workspace state.
 */
export function useVideoEditorActionHandlers(
  ports: {
    assets: AssetHandlerPort;
    export: ExportHandlerPort;
    project: ProjectHandlerPort;
  },
  confirmHandlers: VideoEditorActionConfirmHandlers
): VideoEditorCommandHandlers {
  return {
    assets: useAssetHandlers(ports.assets),
    export: useExportHandlers(ports.export),
    project: useProjectHandlers(ports.project, confirmHandlers),
  };
}
