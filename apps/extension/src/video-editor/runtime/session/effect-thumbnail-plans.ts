import { resolveEffectRuntimeFramePlans } from '../../../features/video/composition/effect-runtime/frame/plan';
import type { VideoProject } from '../../../features/video/project/types';
import type { TimelinePreviewViewport } from '../../contracts/timeline-preview';

/** One representative source frame, independent of playhead and timeline zoom. */
export function buildEffectThumbnailPlans(
  project: VideoProject | null,
  viewport: TimelinePreviewViewport | null
) {
  if (!project) return [];
  return project.clips.flatMap((clip) => {
    if (
      clip.type !== 'EFFECT' ||
      (viewport &&
        (clip.startTime > viewport.endTime || clip.startTime + clip.duration < viewport.startTime))
    )
      return [];
    const instance = project.effectInstances?.find(
      (instance) => instance.id === clip.effectInstanceId
    );
    const track = project.tracks.find((track) => track.id === clip.trackId);
    if (!instance || !track) return [];
    try {
      const plan = resolveEffectRuntimeFramePlans(
        {
          ...project,
          clips: [clip],
          tracks: [{ ...track, visible: true }],
          transitions: [],
          effectInstances: [{ ...instance, enabled: true }],
        },
        clip.startTime + clip.duration * 0.5
      )[0];
      if (!plan) return [];
      const scale = Math.min(
        160 / plan.renderDimensions.width,
        90 / plan.renderDimensions.height,
        1
      );
      const thumbnail = {
        ...plan,
        renderDimensions: {
          width: Math.max(1, Math.round(plan.renderDimensions.width * scale)),
          height: Math.max(1, Math.round(plan.renderDimensions.height * scale)),
        },
      };
      const key = JSON.stringify([
        project.id,
        plan.documentSha256,
        plan.time,
        plan.fps,
        plan.dimensions,
        plan.bitmapBounds,
        plan.controls,
      ]);
      return [{ clipId: clip.id, projectId: project.id, key, plan: thumbnail }];
    } catch {
      return [];
    }
  });
}
