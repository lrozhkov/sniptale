import { translate } from '../../../../platform/i18n';
import {
  DEFAULT_CLIP_FADE_MS,
  DEFAULT_CLIP_VOLUME,
  DEFAULT_VIDEO_ANNOTATION_TEMPLATE,
} from '../defaults';
import { resolveAnnotationTemplateDefaults } from './defaults';
import {
  resolveAnnotationPresentationState,
  type ResolvedAnnotationPresentation,
} from './presentation';
import { getVideoOverlayTemplateDefinition } from '../overlay-template/registry';
import { getClipCompositeVisualOpacity } from '../timeline/presentation';
import {
  createBuiltInAnnotationControlValues,
  createVideoAnnotationPackRegistry,
  createVideoAnnotationTemplateSnapshot,
  getLegacyAnnotationTemplateRef,
} from '../annotation-engine';
import {
  createTemplateRefAnnotationClip as createTemplateInputClip,
  isAnnotationTemplateCreateInput,
  type VideoAnnotationTemplateInput,
} from './template-input';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoProjectClipType,
  type VideoOverlayTemplateKind,
  type VideoProject,
  type VideoProjectAnnotationClip,
} from '../types/index';

type AnnotationTemplateKind = VideoOverlayTemplateKind;

export type { ResolvedAnnotationPresentation } from './presentation';

export { resolveAnnotationTemplateDefaults } from './defaults';
export { isAnnotationTemplateCreateInput } from './template-input';
export type {
  VideoAnnotationTemplateCreateInput,
  VideoAnnotationTemplateInput,
} from './template-input';

function buildAnnotationTemplateFields(
  defaults: ReturnType<typeof resolveAnnotationTemplateDefaults>,
  templateKind: AnnotationTemplateKind,
  content: VideoProjectAnnotationClip['content'] = defaults.content
) {
  const engineFields = resolveAnnotationEngineFields(templateKind);

  return {
    annotationFamily: defaults.annotationFamily,
    calloutDecor: defaults.calloutDecor,
    content,
    direction: defaults.direction,
    intensity: defaults.intensity,
    introAnimation: defaults.introAnimation,
    introDurationMs: defaults.introDurationMs,
    leaderLine: defaults.leaderLine,
    motionFamily: defaults.motionFamily,
    outroAnimation: defaults.outroAnimation,
    outroDurationMs: defaults.outroDurationMs,
    renderFamily: defaults.renderFamily,
    style: defaults.style,
    target: defaults.target,
    targetPoint: defaults.targetPoint,
    targetRect: defaults.targetRect,
    ...engineFields,
    templateKind,
    transform: defaults.transform,
  };
}

function resolveAnnotationEngineFields(templateKind: AnnotationTemplateKind) {
  const templateRef = getLegacyAnnotationTemplateRef(templateKind);
  const templateControlValues = createBuiltInAnnotationControlValues(templateRef);
  const registry = createVideoAnnotationPackRegistry();
  const template = registry.getTemplate(templateRef) ?? undefined;
  const pack = registry.getPack(templateRef.packId) ?? undefined;

  return {
    templateRef,
    templateControlValues,
    templateSnapshot: createVideoAnnotationTemplateSnapshot(
      templateRef,
      templateControlValues,
      template,
      pack
    ),
  };
}

export function applyAnnotationTemplatePreset(
  clip: VideoProjectAnnotationClip,
  projectWidth: number,
  projectHeight: number,
  templateKind: AnnotationTemplateKind
): VideoProjectAnnotationClip {
  const defaults = resolveAnnotationTemplateDefaults(projectWidth, projectHeight, templateKind);

  return {
    ...clip,
    ...buildAnnotationTemplateFields(defaults, templateKind, {
      ...defaults.content,
      badge: clip.content.badge,
      headline: clip.content.headline,
      subline: clip.content.subline,
    }),
  };
}

export function applyAnnotationTemplateStyleSwap(
  clip: VideoProjectAnnotationClip,
  projectWidth: number,
  projectHeight: number,
  templateKind: AnnotationTemplateKind
): VideoProjectAnnotationClip {
  const swappedClip = applyAnnotationTemplatePreset(
    clip,
    projectWidth,
    projectHeight,
    templateKind
  );

  return {
    ...swappedClip,
    calloutDecor: clip.calloutDecor,
    direction: clip.direction,
    intensity: clip.intensity,
    introAnimation: clip.introAnimation,
    introDurationMs: clip.introDurationMs,
    leaderLine: clip.leaderLine,
    outroAnimation: clip.outroAnimation,
    outroDurationMs: clip.outroDurationMs,
    target: clip.target,
    targetPoint: clip.targetPoint,
    targetRect: clip.targetRect,
    transform: clip.transform,
  };
}

export function createAnnotationClip(
  trackId: string,
  projectWidth: number,
  projectHeight: number,
  startTime: number,
  templateInput: VideoAnnotationTemplateInput = DEFAULT_VIDEO_ANNOTATION_TEMPLATE
): VideoProjectAnnotationClip {
  if (isAnnotationTemplateCreateInput(templateInput)) {
    return createTemplateInputClip(templateInput, (templateKind) =>
      createAnnotationClip(trackId, projectWidth, projectHeight, startTime, templateKind)
    );
  }

  const templateKind = templateInput;
  const defaults = resolveAnnotationTemplateDefaults(projectWidth, projectHeight, templateKind);
  const definition = getVideoOverlayTemplateDefinition(templateKind);

  return {
    id: crypto.randomUUID(),
    trackId,
    type: VideoProjectClipType.ANNOTATION,
    name: translate(definition.labelKey),
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime,
    duration: definition.defaultDurationSeconds,
    muted: true,
    volume: DEFAULT_CLIP_VOLUME,
    volumeEnvelopeStart: 1,
    volumeEnvelopeEnd: 1,
    fadeInMs: DEFAULT_CLIP_FADE_MS,
    fadeOutMs: DEFAULT_CLIP_FADE_MS,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    ...buildAnnotationTemplateFields(defaults, templateKind),
  };
}

export function resolveAnnotationPresentation(
  project: Pick<VideoProject, 'height' | 'width'> & { clips?: VideoProject['clips'] },
  clip: VideoProjectAnnotationClip,
  currentTime: number
): ResolvedAnnotationPresentation {
  const compositeOpacity =
    'clips' in project
      ? getClipCompositeVisualOpacity(project as VideoProject, clip, currentTime)
      : 1;
  return resolveAnnotationPresentationState({ clip, compositeOpacity, currentTime, project });
}
