export interface VideoEditorImportPlacement {
  startTime?: number;
  timelineLaneId?: string | null;
  trackId?: string | null;
}

export type VideoEditorImportKind = 'audio' | 'image' | 'video';

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
