import {
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlSection,
  type VideoAnnotationTemplate,
  type VideoAnnotationTemplateControl,
  type VideoAnnotationPrimitiveValue,
} from '../../../../../features/video/project/annotation-engine';
import type { VideoAnnotationRenderNode } from '../../../../../features/video/project/annotation-engine/types';

export const MODERN_ANNOTATION_CONTROL_SECTIONS = [
  VideoAnnotationControlSection.CONTENT,
  VideoAnnotationControlSection.PLACEMENT,
  VideoAnnotationControlSection.APPEARANCE,
  VideoAnnotationControlSection.MOTION,
  VideoAnnotationControlSection.ADVANCED,
] as const;

export function getTemplateControlsForSection(
  template: VideoAnnotationTemplate,
  section: VideoAnnotationControlSection
): readonly VideoAnnotationTemplateControl[] {
  return getVisibleTemplateControls(template).filter(
    (control) => resolveControlSection(control) === section
  );
}

export function getVisibleTemplateControls(
  template: VideoAnnotationTemplate
): readonly VideoAnnotationTemplateControl[] {
  return template.controls.filter((control) => isTemplateControlRelevant(template, control));
}

export function resolveControlSection(
  control: VideoAnnotationTemplateControl
): VideoAnnotationControlSection {
  if (control.section) {
    return control.section;
  }

  if (control.binding.kind === VideoAnnotationControlBindingKind.TEMPLATE_FIELD) {
    return control.binding.field.startsWith('content.')
      ? VideoAnnotationControlSection.CONTENT
      : VideoAnnotationControlSection.APPEARANCE;
  }

  if (control.binding.kind === VideoAnnotationControlBindingKind.THEME_TOKEN) {
    return VideoAnnotationControlSection.APPEARANCE;
  }

  if (control.binding.kind === VideoAnnotationControlBindingKind.TIMELINE_PROPERTY) {
    return VideoAnnotationControlSection.MOTION;
  }

  return resolveNodePropertySection(control);
}

function isTemplateControlRelevant(
  template: VideoAnnotationTemplate,
  control: VideoAnnotationTemplateControl
): boolean {
  if (control.binding.kind === VideoAnnotationControlBindingKind.TEMPLATE_FIELD) {
    return isTemplateFieldUsed(template.renderTree, control.binding.field);
  }

  if (control.binding.kind === VideoAnnotationControlBindingKind.THEME_TOKEN) {
    return isPrimitiveValueUsed(template.renderTree, `token:${control.binding.tokenId}`);
  }

  if (control.binding.kind === VideoAnnotationControlBindingKind.NODE_PROPERTY) {
    return Boolean(findRenderNode(template.renderTree, control.binding.nodeId));
  }

  if (control.binding.kind === VideoAnnotationControlBindingKind.TIMELINE_PROPERTY) {
    return template.timeline.tracks.length > 0;
  }

  return true;
}

function isTemplateFieldUsed(root: VideoAnnotationRenderNode, field: string): boolean {
  if (!field.startsWith('content.')) {
    return true;
  }
  return isPrimitiveValueUsed(root, `field:${field.slice('content.'.length)}`);
}

function isPrimitiveValueUsed(
  node: VideoAnnotationRenderNode,
  value: VideoAnnotationPrimitiveValue
): boolean {
  return (
    Object.values(node.props ?? {}).includes(value) ||
    Object.values(node.style ?? {}).includes(value) ||
    (node.children ?? []).some((child) => isPrimitiveValueUsed(child, value))
  );
}

function findRenderNode(
  node: VideoAnnotationRenderNode,
  nodeId: string
): VideoAnnotationRenderNode | null {
  if (node.id === nodeId) {
    return node;
  }
  for (const child of node.children ?? []) {
    const result = findRenderNode(child, nodeId);
    if (result) {
      return result;
    }
  }
  return null;
}

function resolveNodePropertySection(
  control: VideoAnnotationTemplateControl
): VideoAnnotationControlSection {
  if (control.binding.kind !== VideoAnnotationControlBindingKind.NODE_PROPERTY) {
    return VideoAnnotationControlSection.ADVANCED;
  }

  switch (control.binding.property) {
    case 'height':
    case 'width':
    case 'x':
    case 'y':
      return VideoAnnotationControlSection.PLACEMENT;
    case 'align':
    case 'backgroundFill':
    case 'fill':
    case 'fontFamily':
    case 'fontSize':
    case 'lineHeight':
    case 'opacity':
    case 'radius':
    case 'shadowBlur':
    case 'shadowColor':
    case 'shadowY':
    case 'stroke':
    case 'strokeWidth':
    case 'weight':
      return VideoAnnotationControlSection.APPEARANCE;
    case 'arrowEnd':
    case 'drawProgress':
    case 'maskDirection':
    case 'maskProgress':
    case 'path':
    case 'progress':
      return VideoAnnotationControlSection.ADVANCED;
    case 'text':
      return VideoAnnotationControlSection.CONTENT;
    default:
      return VideoAnnotationControlSection.ADVANCED;
  }
}
