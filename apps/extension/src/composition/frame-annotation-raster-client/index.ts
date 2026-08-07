import {
  runFrameAnnotationRasterTransition,
  type FrameAnnotationRasterTransitionOptions,
} from './orchestrator';

export function rasterizeFrameAnnotations(options: FrameAnnotationRasterTransitionOptions) {
  return runFrameAnnotationRasterTransition(options);
}
