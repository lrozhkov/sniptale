import type { ExportTimeEstimator } from '../../../../features/video/project/export/time-estimate';
import type { ProjectExportMediaState } from '../../media';
import type { VideoProjectCaptionRenderer } from '../../../../workflows/video-review/project-captions';

/**
 * Shared render-loop state used by the composite and frame-driven renderers.
 */
export type RenderLoopJobState = Pick<
  ProjectExportMediaState,
  'clipMediaElements' | 'clipAudioNodes'
> & {
  captionRenderer?: VideoProjectCaptionRenderer;
  cancelled: boolean;
  timeEstimator?: ExportTimeEstimator;
  renderProgressRange?: { start: number; end: number };
  jobId: string;
};
