import { applyAnnotationTemplateStyleFloors } from './presets';
import { resolveAnnotationEffects, type ResolvedAnnotationEffects } from './effects';
import { resolveAnnotationFrameBounds } from './target-geometry';
import { resolveAnnotationIdleMotion } from './idle-motion';
import { resolveAnnotationMotionState } from './motion';
import {
  VideoOverlayTemplateKind,
  VideoTemplateDirection,
  type VideoProject,
  type VideoProjectAnnotationClip,
  type VideoProjectAnnotationStyle,
} from '../types/index';

export interface ResolvedAnnotationPresentation {
  effects: ResolvedAnnotationEffects;
  frame: {
    height: number;
    opacity: number;
    rotation: number;
    width: number;
    x: number;
    y: number;
  };
  labelFrame: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  style: VideoProjectAnnotationStyle;
}

export function resolveAnimationState(params: {
  animation: VideoProjectAnnotationClip['introAnimation'];
  clip: VideoProjectAnnotationClip;
  currentTime: number;
  phase: 'intro' | 'outro';
}) {
  return resolveAnnotationMotionState(params);
}

export function resolveTemplateStyle(
  clip: VideoProjectAnnotationClip
): VideoProjectAnnotationStyle {
  return applyAnnotationTemplateStyleFloors({ ...clip.style }, clip.templateKind);
}

export function resolveAnnotationPresentationState(params: {
  clip: VideoProjectAnnotationClip;
  compositeOpacity: number;
  currentTime: number;
  project: Pick<VideoProject, 'height' | 'width'>;
}): ResolvedAnnotationPresentation {
  const intro = resolveAnimationState({
    animation: params.clip.introAnimation,
    clip: params.clip,
    currentTime: params.currentTime,
    phase: 'intro',
  });
  const outro = resolveAnimationState({
    animation: params.clip.outroAnimation,
    clip: params.clip,
    currentTime: params.currentTime,
    phase: 'outro',
  });
  const idle = resolveAnnotationIdleMotion(params.clip, params.currentTime);
  const style = resolveTemplateStyle(params.clip);
  const labelFrame = resolveDirectionAwareLabelFrame(params.project, params.clip);
  const frame = resolveAnnotationFrameBounds(params.clip, labelFrame);

  return {
    effects: resolveAnnotationEffects(intro, outro, idle),
    frame: {
      height: frame.height,
      opacity: params.compositeOpacity * intro.opacityMultiplier * outro.opacityMultiplier,
      rotation: params.clip.transform.rotation,
      width: frame.width,
      x: frame.x,
      y: frame.y,
    },
    labelFrame,
    style,
  };
}

function resolveDirectionAwareLabelFrame(
  project: Pick<VideoProject, 'height' | 'width'>,
  clip: VideoProjectAnnotationClip
) {
  if (clip.templateKind !== VideoOverlayTemplateKind.SIDE_REVEAL_PANEL) {
    return {
      height: clip.transform.height,
      width: clip.transform.width,
      x: clip.transform.x,
      y: clip.transform.y,
    };
  }

  const width = Math.round(project.width * 0.34);
  return {
    height: project.height,
    width,
    x: clip.direction === VideoTemplateDirection.RIGHT ? project.width - width : 0,
    y: 0,
  };
}
