import {
  resolveClipAnnotationScene,
  shouldUseLegacyAnnotationRenderer,
} from '../../project/annotation-engine';
import { resolveAnnotationPresentation } from '../../project/annotation/template';
import type { VideoProject, VideoProjectAnnotationClip } from '../../project/types';
import type { VideoCompositionResolvedAnnotationClip } from '../types';

export function resolveCompositionAnnotationClip(
  clip: VideoProjectAnnotationClip,
  currentTime: number,
  project: VideoProject
): VideoCompositionResolvedAnnotationClip {
  const presentation = resolveAnnotationPresentation(project, clip, currentTime);
  const scene = shouldUseLegacyAnnotationRenderer(clip)
    ? undefined
    : resolveClipAnnotationScene({ clip, currentTime, project });

  return {
    calloutDecor: clip.calloutDecor,
    content: clip.content,
    id: clip.id,
    leaderLine: clip.leaderLine,
    presentation,
    renderFamily: clip.renderFamily,
    ...(scene ? { scene } : {}),
    target: clip.target,
    targetPoint: clip.targetPoint,
    targetRect: clip.targetRect,
    templateKind: clip.templateKind,
    trackId: clip.trackId,
  };
}
