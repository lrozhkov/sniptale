import type { MotionSpatialEdit } from '../../features/video/project/motion/spatial';
import type { VideoProject } from '../../features/video/project/types';

export type VideoEditorInspectorMode = 'selection';

/** A disposable inspector gesture belongs to one accepted document snapshot. */
export interface VideoEditorMotionSpatialPreview {
  project: VideoProject;
  regionId: string;
  edit: MotionSpatialEdit;
}
