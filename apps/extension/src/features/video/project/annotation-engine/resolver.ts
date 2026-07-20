import { resolveAnnotationPresentationState } from '../annotation/presentation';
import { getClipCompositeVisualOpacity } from '../timeline/presentation';
import { type VideoProject, type VideoProjectAnnotationClip } from '../types/index';
import { createVideoAnnotationPackRegistry, resolveVideoAnnotationTemplate } from './registry';
import { flattenResolvedAnnotationNodes, resolveAnnotationRenderTree } from './nodes';
import { resolveAnnotationSceneTarget } from './target';
import { resolveAnnotationTimelineState } from './timeline';
import { resolveTemplateTimeline } from './timeline-controls';
import type { AnnotationSceneTargetGeometry, ResolvedAnnotationScene } from './scene';
import type {
  VideoAnnotationPackTheme,
  VideoAnnotationTemplate,
  VideoAnnotationTemplateRef,
} from './types';

export interface ResolveAnnotationSceneParams {
  clip: VideoProjectAnnotationClip;
  currentTime: number;
  project: VideoProject;
  targetGeometry?: AnnotationSceneTargetGeometry | undefined;
  template: VideoAnnotationTemplate;
  templateRef?: VideoAnnotationTemplateRef | undefined;
  theme?: VideoAnnotationPackTheme | undefined;
}

export function resolveAnnotationScene(
  params: ResolveAnnotationSceneParams
): ResolvedAnnotationScene {
  const presentation = resolveScenePresentation(params.project, params.clip, params.currentTime);
  const controlledTimeline = resolveTemplateTimeline({
    clip: params.clip,
    template: params.template,
  });
  const timeline = resolveAnnotationTimelineState({
    clipDurationSeconds: params.clip.duration,
    currentTime: params.currentTime,
    startTime: params.clip.startTime,
    timeline: controlledTimeline,
  });
  const renderTree = resolveAnnotationRenderTree({
    clip: params.clip,
    labelFrame: {
      ...presentation.labelFrame,
      opacity: 1,
      rotation: presentation.frame.rotation,
    },
    style: { ...presentation.style },
    template: params.template,
    theme: params.theme,
    timeline,
  });

  return {
    clipId: params.clip.id,
    effects: presentation.effects,
    frame: presentation.frame,
    nodes: flattenResolvedAnnotationNodes(renderTree),
    presentation,
    renderTree,
    target: resolveAnnotationSceneTarget(params),
    timeline,
  };
}

export function resolveClipAnnotationScene(params: {
  clip: VideoProjectAnnotationClip;
  currentTime: number;
  project: VideoProject;
  targetGeometry?: AnnotationSceneTargetGeometry | undefined;
}): ResolvedAnnotationScene {
  const registry = createVideoAnnotationPackRegistry();
  const resolution = resolveVideoAnnotationTemplate(params.clip, registry);
  const template =
    resolution.status === 'resolved' ? resolution.template : resolution.fallbackTemplate;
  const pack =
    resolution.status === 'resolved'
      ? resolution.pack
      : registry.getPack(resolution.fallbackRef.packId);

  if (!template) {
    throw new Error('Annotation scene resolver could not resolve a compatible template.');
  }

  return resolveAnnotationScene({
    ...params,
    template,
    templateRef: resolution.status === 'resolved' ? resolution.ref : resolution.fallbackRef,
    theme:
      resolution.status === 'fallback' && template === params.clip.templateSnapshot?.template
        ? params.clip.templateSnapshot.packTheme
        : pack?.theme,
  });
}

function resolveScenePresentation(
  project: VideoProject,
  clip: VideoProjectAnnotationClip,
  currentTime: number
) {
  return resolveAnnotationPresentationState({
    clip,
    compositeOpacity: resolveCompositeOpacity(project, clip, currentTime),
    currentTime,
    project,
  });
}

function resolveCompositeOpacity(
  project: VideoProject,
  clip: VideoProjectAnnotationClip,
  currentTime: number
): number {
  if (!Array.isArray(project.clips) || !Array.isArray(project.tracks)) {
    return 1;
  }
  return getClipCompositeVisualOpacity(project, clip, currentTime);
}
