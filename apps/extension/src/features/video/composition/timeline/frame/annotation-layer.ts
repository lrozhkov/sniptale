import { resolveCompositionAnnotationClip } from '../../annotation/resolved-clip';
import { resolveClipTransitionVisualState } from '../../../project/transition/presentation';
import type { VideoProject, VideoProjectAnnotationClip } from '../../../project/types/index';
import type { VideoCompositionVisualLayer } from '../../types';

export function createAnnotationVisualLayer(
  clip: VideoProjectAnnotationClip,
  currentTime: number,
  project: VideoProject,
  zIndex: number
): Extract<VideoCompositionVisualLayer, { kind: 'annotation' }> {
  const resolvedClip = resolveCompositionAnnotationClip(clip, currentTime, project);
  const layerFrame = resolvedClip.scene
    ? resolvedClip.presentation.labelFrame
    : resolvedClip.presentation.frame;

  return {
    clip: resolvedClip,
    clipId: clip.id,
    height: layerFrame.height,
    kind: 'annotation',
    opacity: resolvedClip.presentation.frame.opacity,
    renderState: resolveClipTransitionVisualState(project, clip, currentTime),
    rotation: resolvedClip.presentation.frame.rotation,
    width: layerFrame.width,
    x: layerFrame.x,
    y: layerFrame.y,
    zIndex,
  };
}
