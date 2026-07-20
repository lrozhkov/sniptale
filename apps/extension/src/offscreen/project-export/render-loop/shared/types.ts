import type { ProjectExportMediaState } from '../../media';

/**
 * Shared render-loop state used by the composite and frame-driven renderers.
 */
export type RenderLoopJobState = Pick<
  ProjectExportMediaState,
  'clipMediaElements' | 'clipAudioNodes'
> & {
  cancelled: boolean;
  jobId: string;
};
