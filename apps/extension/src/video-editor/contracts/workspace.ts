import type { MotionSpatialEdit } from '../../features/video/project/motion/spatial';
import type { VideoProject } from '../../features/video/project/types';

export type VideoEditorInspectorMode = 'selection';

/** A disposable inspector gesture belongs to one accepted document snapshot. */
export interface VideoEditorMotionSpatialPreview {
  project: VideoProject;
  regionId: string;
  edit: MotionSpatialEdit;
}

/** A scene draft is valid only for its accepted document snapshot. */
export interface VideoEditorWatermarkPreview {
  project: VideoProject;
  settings: NonNullable<VideoProject['watermark']>;
}

/** The workspace owns preview admission and cancellation before a project transition. */
export interface VideoEditorWatermarkInspectorRuntime {
  onPreview(preview: VideoEditorWatermarkPreview | null): void;
  registerAbort(abort: () => void): () => void;
  imagePreviewUrl?: string;
}
