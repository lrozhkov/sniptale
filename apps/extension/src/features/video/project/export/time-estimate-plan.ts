import { buildProjectTransitionSegments } from '../transition/project';
import { createVideoCompositionTimelineIndex } from '../../composition/timeline/frame/index';
import { resolveVideoCompositionRenderPasses } from '../../composition/timeline/render';
import type { VideoProject } from '../types/model';
import type { VideoProjectExportSettings } from '../types/export';
import { resolveProjectExportRange } from './range';
import { planExportTimeWork } from './time-estimate';

/** Uses the renderer's own pass planner, including real motion-blur and transition work. */
export function planProjectExportTime(
  project: VideoProject,
  settings: VideoProjectExportSettings,
  routeBoundaries: readonly number[] = []
) {
  const range = resolveProjectExportRange(project, settings);
  const boundaries = [range.start, range.end, ...routeBoundaries];
  for (let i = 1; i < 64; i++) boundaries.push(range.start + (range.duration * i) / 64);
  for (const clip of project.clips) boundaries.push(clip.startTime, clip.startTime + clip.duration);
  for (const region of project.motionRegions ?? []) {
    boundaries.push(
      region.startTime,
      region.startTime + region.zoomInDuration,
      region.startTime + region.duration - region.zoomOutDuration,
      region.startTime + region.duration
    );
  }
  for (const effect of project.effectInstances ?? [])
    boundaries.push(effect.startTime, effect.startTime + effect.duration);
  for (const transition of buildProjectTransitionSegments(project))
    boundaries.push(transition.start, transition.end);
  const timelineIndex = createVideoCompositionTimelineIndex(project);
  return planExportTimeWork(range.start, range.end, boundaries, (time) => {
    const { visualPasses, overlayFrame } = resolveVideoCompositionRenderPasses(project, time, {
      timelineIndex,
      includeSubtitles: settings.burnInSubtitles !== false,
    });
    const layers = Math.max(1, overlayFrame.visualLayers.length);
    // Priors describe work, not promised speedups; actual per-class measurements replace them.
    return (
      1 +
      (visualPasses.length - 1) * 0.5 +
      (layers - 1) * 0.25 +
      overlayFrame.effectRuntimePlans.length * 0.5 +
      Math.max(0, ...visualPasses.map((pass) => pass.transitionOverlays.length)) * 0.5
    );
  });
}
