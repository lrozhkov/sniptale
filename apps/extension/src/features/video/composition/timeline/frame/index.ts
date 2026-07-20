import type { VideoProject } from '../../../project/types/index';
import { resolveVideoCompositionCamera } from '../../motion/index';
import { resolveEffectRuntimeFramePlans } from '../../effect-runtime/frame/plan';
import type { VideoCompositionFrame } from '../../types';
import { resolveVideoCompositionActions } from './actions';
import { resolveCursorSample, resolveVideoCompositionCursor } from './cursor';
import {
  resolveVideoCompositionEffectInputLayers,
  resolveVideoCompositionVisualLayers,
} from './layers';
import {
  createVideoCompositionTimelineIndex,
  type VideoCompositionTimelineIndex,
} from './composition-index';

export { getVideoCompositionActionDuration, resolveVideoCompositionActions } from './actions';
export { createVideoCompositionTimelineIndex } from './composition-index';
export type { VideoCompositionTimelineIndex } from './composition-index';
export { resolveVideoCompositionCursor } from './cursor';

export function resolveVideoCompositionFrame(
  project: VideoProject,
  currentTime: number,
  options: { includeSubtitles?: boolean; timelineIndex?: VideoCompositionTimelineIndex } = {}
): VideoCompositionFrame {
  const timelineIndex = options.timelineIndex ?? createVideoCompositionTimelineIndex(project);
  const actions = resolveVideoCompositionActions(project, currentTime);
  const cursorSample = resolveCursorSample(project, currentTime);
  const effectRuntimePlans = resolveEffectRuntimeFramePlans(project, currentTime);
  const layerOptions = { ...options, timelineIndex };

  return {
    actions,
    camera: resolveVideoCompositionCamera({
      actions,
      cursorSample,
      currentTime,
      project,
    }),
    cursor: resolveVideoCompositionCursor(project, currentTime, actions),
    effectInputLayers: resolveVideoCompositionEffectInputLayers(
      project,
      currentTime,
      effectRuntimePlans,
      layerOptions
    ),
    effectRuntimePlans,
    visualLayers: resolveVideoCompositionVisualLayers(project, currentTime, layerOptions),
  };
}
