export interface VideoEditorImportPlacement {
  destination?: 'materials' | 'timeline';
  startTime?: number;
  timelineLaneId?: string | null;
  trackId?: string | null;
}

export type VideoEditorImportKind = 'audio' | 'image' | 'video';

/** Half-open interval in source seconds, independent of the montage playhead. */
export interface VideoEditorMaterialSourceRange {
  start: number;
  end: number;
}

export type VideoEditorMaterialPlacementResult =
  | { status: 'placed'; clipId: string }
  | {
      status: 'rejected';
      reason: 'no-project' | 'missing-material' | 'locked-track' | 'invalid-cut' | 'invalid-range';
    };

type VideoEditorImportHandler = (
  file: File,
  placement?: VideoEditorImportPlacement
) => Promise<void> | void;

export interface PreviewStageImportHandlers {
  audio: VideoEditorImportHandler;
  image: VideoEditorImportHandler;
  video: VideoEditorImportHandler;
}

export type VideoEditorImportDispatchResult =
  | { status: 'dispatched'; kind: VideoEditorImportKind }
  | { status: 'unsupported'; reason: 'unsupported-media-type' };
