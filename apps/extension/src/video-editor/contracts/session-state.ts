import type { VideoProject } from '../../features/video/project/types';
import type { AssetRef } from '../../composition/persistence/assets';

/** Canonical native predecessor and acknowledged runtime identity; live history stays in its own owner. */
export interface VideoEditorNativeWorkspace {
  project: VideoProject;
  workspaceRevision: number;
  savedRuntimeProject: VideoProject;
  historyStatus: 'absent' | 'unavailable' | 'ready';
  historyAssetsByValue: ReadonlyMap<string, AssetRef>;
}

export type VideoEditorSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';
