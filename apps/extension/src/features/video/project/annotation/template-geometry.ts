import {
  VideoAnnotationElementKind,
  VideoAnnotationTargetBindingKind,
  type VideoAnnotationTemplate,
} from '../annotation-engine';
import { getAnnotationTransformPreset } from './presets';
import {
  VideoAnnotationTargetKind,
  type VideoOverlayTemplateKind,
  type VideoProjectAnnotationClip,
  type VideoProjectTransform,
} from '../types/index';

type ModernTransformPreset = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export function applyModernTemplateGeometry(
  clip: VideoProjectAnnotationClip,
  template: VideoAnnotationTemplate,
  fallbackKind: VideoOverlayTemplateKind
): VideoProjectAnnotationClip {
  const projectSize = inferProjectSize(clip.transform, fallbackKind);
  const transform = createModernTemplateTransform(projectSize, template);
  return {
    ...clip,
    ...createModernTargetPatch(transform, template),
    transform,
  };
}

function inferProjectSize(
  transform: VideoProjectTransform,
  fallbackKind: VideoOverlayTemplateKind
) {
  const preset = getAnnotationTransformPreset(fallbackKind);
  return {
    height: Math.max(1, Math.round(transform.height / preset.heightPercent)),
    width: Math.max(1, Math.round(transform.width / preset.widthPercent)),
  };
}

function createModernTemplateTransform(
  project: { height: number; width: number },
  template: VideoAnnotationTemplate
): VideoProjectTransform {
  const preset = resolveModernTransformPreset(template);
  return {
    height: Math.round(project.height * preset.height),
    opacity: 1,
    rotation: 0,
    width: Math.round(project.width * preset.width),
    x: Math.round(project.width * preset.x),
    y: Math.round(project.height * preset.y),
  };
}

function resolveModernTransformPreset(template: VideoAnnotationTemplate): ModernTransformPreset {
  return resolveTemplateIdPreset(template) ?? resolveElementKindPreset(template);
}

function resolveTemplateIdPreset(template: VideoAnnotationTemplate): ModernTransformPreset | null {
  switch (template.id) {
    case 'inline-symbol-pointer':
      return { height: 0.24, width: 0.7, x: 0.12, y: 0.22 };
    case 'scan-selection-frame':
      return { height: 0.32, width: 0.72, x: 0.12, y: 0.34 };
    case 'diagnostic-stack-callout':
      return { height: 0.34, width: 0.7, x: 0.12, y: 0.24 };
    case 'crawling-arrow-card':
      return { height: 0.3, width: 0.72, x: 0.12, y: 0.22 };
    default:
      return null;
  }
}

function resolveElementKindPreset(template: VideoAnnotationTemplate): ModernTransformPreset {
  switch (template.elementKind) {
    case VideoAnnotationElementKind.INTRO:
      return { height: 0.24, width: 0.64, x: 0.06, y: 0.14 };
    case VideoAnnotationElementKind.LOWER_THIRD:
      return { height: 0.14, width: 0.66, x: 0.06, y: 0.74 };
    case VideoAnnotationElementKind.TITLE:
      return { height: 0.24, width: 0.68, x: 0.16, y: 0.16 };
    case VideoAnnotationElementKind.SCENE:
      return { height: 0.26, width: 0.68, x: 0.16, y: 0.18 };
    case VideoAnnotationElementKind.FOCUS:
      return { height: 0.3, width: 0.7, x: 0.12, y: 0.34 };
    case VideoAnnotationElementKind.CALLOUT:
      return template.target.kind === VideoAnnotationTargetBindingKind.POINT
        ? { height: 0.28, width: 0.66, x: 0.14, y: 0.16 }
        : { height: 0.32, width: 0.68, x: 0.14, y: 0.16 };
  }
}

function createModernTargetPatch(
  transform: VideoProjectTransform,
  template: VideoAnnotationTemplate
): Pick<VideoProjectAnnotationClip, 'target' | 'targetPoint' | 'targetRect'> {
  if (template.target.kind === VideoAnnotationTargetBindingKind.POINT) {
    return {
      target: VideoAnnotationTargetKind.POINT,
      targetPoint: {
        x: Math.round(transform.x + transform.width * 0.18),
        y: Math.round(transform.y + transform.height * 0.5),
      },
      targetRect: null,
    };
  }

  if (template.target.kind === VideoAnnotationTargetBindingKind.RECT) {
    const focusTarget = template.elementKind === VideoAnnotationElementKind.FOCUS;
    return {
      target: VideoAnnotationTargetKind.RECT,
      targetPoint: null,
      targetRect: {
        height: Math.round(transform.height * (focusTarget ? 0.44 : 0.34)),
        width: Math.round(transform.width * (focusTarget ? 0.34 : 0.26)),
        x: Math.round(transform.x + transform.width * 0.06),
        y: Math.round(transform.y + transform.height * (focusTarget ? 0.22 : 0.26)),
      },
    };
  }

  return {
    target: VideoAnnotationTargetKind.NONE,
    targetPoint: null,
    targetRect: null,
  };
}
