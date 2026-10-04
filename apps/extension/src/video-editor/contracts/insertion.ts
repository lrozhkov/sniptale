export interface VideoEditorImportPlacement {
  destination?: 'materials' | 'timeline' | 'background';
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
      reason:
        | 'no-project'
        | 'missing-material'
        | 'locked-track'
        | 'invalid-cut'
        | 'invalid-range'
        | 'invalid-target'
        | 'occupied-target';
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

/** Immutable placement selected when an audio-track recording dialog opens. */
export interface VideoEditorAudioRecordingTarget {
  projectId: string;
  trackId: string;
  startTime: number;
  endTime: number;
}

/** Exact material destination; the command never redirects an incompatible or occupied target. */
export interface VideoEditorMaterialTarget {
  trackId: string;
  startTime: number;
  timelineLaneId: string;
}
