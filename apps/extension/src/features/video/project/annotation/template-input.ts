import {
  createVideoAnnotationControlValues,
  createVideoAnnotationTemplateSnapshot,
  VideoAnnotationControlBindingKind,
  VideoAnnotationElementKind,
  VideoAnnotationTargetBindingKind,
  type VideoAnnotationPack,
  type VideoAnnotationPrimitiveValue,
  type VideoAnnotationTemplate,
  type VideoAnnotationTemplateRef,
} from '../annotation-engine';
import { applyModernTemplateGeometry } from './template-geometry';
import { VideoOverlayTemplateKind, type VideoProjectAnnotationClip } from '../types/index';

type AnnotationTemplateKind = VideoOverlayTemplateKind;

export interface VideoAnnotationTemplateCreateInput {
  pack?: VideoAnnotationPack | undefined;
  packLabel?: VideoAnnotationPack['label'] | undefined;
  packTheme?: VideoAnnotationPack['theme'] | undefined;
  template: VideoAnnotationTemplate;
  templateRef: VideoAnnotationTemplateRef;
}

export type VideoAnnotationTemplateInput =
  | AnnotationTemplateKind
  | VideoAnnotationTemplateCreateInput;

export function isAnnotationTemplateCreateInput(
  value: VideoAnnotationTemplateInput
): value is VideoAnnotationTemplateCreateInput {
  return typeof value === 'object' && 'templateRef' in value && 'template' in value;
}

export function createTemplateRefAnnotationClip(
  input: VideoAnnotationTemplateCreateInput,
  createBaseClip: (templateKind: AnnotationTemplateKind) => VideoProjectAnnotationClip
): VideoProjectAnnotationClip {
  const fallbackKind = resolveTemplateFallbackKind(input.template);
  const baseClip = createBaseClip(fallbackKind);
  const templateControlValues = createVideoAnnotationControlValues(input.template.controls);
  const geometryClip = applyModernTemplateGeometry(baseClip, input.template, fallbackKind);
  const patchedClip = applyTemplateControlDefaults(
    geometryClip,
    input.template,
    templateControlValues
  );

  return {
    ...patchedClip,
    duration: input.template.timeline.durationMs / 1000,
    name: input.template.label.fallback,
    templateControlValues,
    templateRef: input.templateRef,
    templateSnapshot: createVideoAnnotationTemplateSnapshot(
      input.templateRef,
      templateControlValues,
      input.template,
      { label: input.packLabel, theme: input.packTheme }
    ),
  };
}

function resolveTemplateFallbackKind(template: VideoAnnotationTemplate): AnnotationTemplateKind {
  if (template.target.kind === VideoAnnotationTargetBindingKind.POINT) {
    return VideoOverlayTemplateKind.CALLOUT_CONNECTOR;
  }
  if (
    template.target.kind === VideoAnnotationTargetBindingKind.RECT &&
    template.elementKind === VideoAnnotationElementKind.FOCUS
  ) {
    return VideoOverlayTemplateKind.FOCUS_SCAN_FRAME;
  }
  if (template.target.kind === VideoAnnotationTargetBindingKind.RECT) {
    return VideoOverlayTemplateKind.CALLOUT_CARD;
  }
  switch (template.elementKind) {
    case VideoAnnotationElementKind.INTRO:
    case VideoAnnotationElementKind.TITLE:
      return VideoOverlayTemplateKind.TITLE_REVEAL;
    case VideoAnnotationElementKind.SCENE:
      return VideoOverlayTemplateKind.SCENE_PROGRESS_CARD;
    case VideoAnnotationElementKind.CALLOUT:
      return VideoOverlayTemplateKind.SIDE_NOTE;
    case VideoAnnotationElementKind.FOCUS:
      return VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD;
    case VideoAnnotationElementKind.LOWER_THIRD:
      return VideoOverlayTemplateKind.LOWER_THIRD_BASIC;
  }
}

function applyTemplateControlDefaults(
  clip: VideoProjectAnnotationClip,
  template: VideoAnnotationTemplate,
  values: Record<string, VideoAnnotationPrimitiveValue>
): VideoProjectAnnotationClip {
  return template.controls.reduce((current, control) => {
    const value = values[control.id] ?? control.defaultValue;
    if (control.binding.kind !== VideoAnnotationControlBindingKind.TEMPLATE_FIELD) {
      return current;
    }
    if (control.binding.field === 'content.headline' && typeof value === 'string') {
      return { ...current, content: { ...current.content, headline: value } };
    }
    if (control.binding.field === 'content.subline' && typeof value === 'string') {
      return { ...current, content: { ...current.content, subline: value } };
    }
    if (control.binding.field === 'content.badge') {
      return {
        ...current,
        content: { ...current.content, badge: typeof value === 'string' ? value : null },
      };
    }
    return applyTemplateStyleDefault(current, control.binding.field, value);
  }, clip);
}

function applyTemplateStyleDefault(
  clip: VideoProjectAnnotationClip,
  field: string,
  value: VideoAnnotationPrimitiveValue
): VideoProjectAnnotationClip {
  if (field === 'style.accentColor' && typeof value === 'string') {
    return { ...clip, style: { ...clip.style, accentColor: value } };
  }
  if (field === 'style.backgroundColor' && typeof value === 'string') {
    return { ...clip, style: { ...clip.style, backgroundColor: value } };
  }
  if (field === 'style.headlineColor' && typeof value === 'string') {
    return { ...clip, style: { ...clip.style, headlineColor: value } };
  }
  if (field === 'style.sublineColor' && typeof value === 'string') {
    return { ...clip, style: { ...clip.style, sublineColor: value } };
  }
  if (field === 'style.borderRadius' && typeof value === 'number') {
    return { ...clip, style: { ...clip.style, borderRadius: value } };
  }
  if (field === 'style.padding' && typeof value === 'number') {
    return { ...clip, style: { ...clip.style, padding: value } };
  }
  return clip;
}
