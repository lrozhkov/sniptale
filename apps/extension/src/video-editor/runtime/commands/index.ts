import { useAssetHandlers } from './assets';
import { useExportHandlers } from './export';
import { useProjectHandlers } from './project';
import type { UseVideoEditorActionHandlersParams, VideoEditorActionHandlers } from './types';
import type { VideoEditorConfirmDialogState } from '../controller/workspace-state';

export type { VideoEditorActionHandlers } from './types';

interface VideoEditorActionConfirmHandlers {
  requestConfirm: (dialog: VideoEditorConfirmDialogState) => Promise<boolean>;
}

/**
 * Binds project, import, and export commands to the current editor workspace state.
 */
export function useVideoEditorActionHandlers(
  params: UseVideoEditorActionHandlersParams,
  confirmHandlers: VideoEditorActionConfirmHandlers
): VideoEditorActionHandlers {
  return {
    ...useProjectHandlers(params, confirmHandlers),
    ...useAssetHandlers(params),
    ...useExportHandlers(params),
  };
}
