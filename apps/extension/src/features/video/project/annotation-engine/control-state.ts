import {
  VideoAnnotationControlBindingKind,
  type VideoAnnotationPackTheme,
  type VideoAnnotationPrimitiveValue,
  type VideoAnnotationTemplate,
  type VideoAnnotationTemplateControl,
  type VideoAnnotationTemplateControlValues,
} from './types';
import type { AnnotationSceneResolvableClip } from './scene';
import type { VideoProjectAnnotationContent } from '../types/annotation';
import type { VideoProjectAnnotationStyle } from '../types/layout';
import { resolveAnnotationControlValues } from './control-values';

export interface ResolvedControlState {
  content: VideoProjectAnnotationContent;
  nodeValues: Map<string, Record<string, VideoAnnotationPrimitiveValue>>;
  themeTokens: Map<string, VideoAnnotationPrimitiveValue>;
}

export function resolveControlState(params: {
  clip: AnnotationSceneResolvableClip;
  style: VideoProjectAnnotationStyle;
  template: VideoAnnotationTemplate;
  theme?: VideoAnnotationPackTheme | undefined;
}): ResolvedControlState {
  const values = resolveAnnotationControlValues(params.template, params.clip);
  const content = { ...params.clip.content };
  const nodeValues = new Map<string, Record<string, VideoAnnotationPrimitiveValue>>();
  const themeTokens = createThemeTokens(params.theme);

  params.template.controls.forEach((control) => {
    const value = resolveControlValue(control, params.clip, params.style, values);
    if (control.binding.kind === VideoAnnotationControlBindingKind.TEMPLATE_FIELD) {
      applyTemplateField(content, params.style, control.binding.field, value);
    }
    if (control.binding.kind === VideoAnnotationControlBindingKind.NODE_PROPERTY) {
      const current = nodeValues.get(control.binding.nodeId) ?? {};
      nodeValues.set(control.binding.nodeId, { ...current, [control.binding.property]: value });
    }
    if (control.binding.kind === VideoAnnotationControlBindingKind.THEME_TOKEN) {
      themeTokens.set(control.binding.tokenId, value);
    }
  });

  return { content, nodeValues, themeTokens };
}

function resolveControlValue(
  control: VideoAnnotationTemplateControl,
  clip: AnnotationSceneResolvableClip,
  style: VideoProjectAnnotationStyle,
  values: VideoAnnotationTemplateControlValues
): VideoAnnotationPrimitiveValue {
  const clipValue = readOwnControlValue(clip.templateControlValues, control.id);
  if (clipValue.found) {
    return clipValue.value;
  }
  const snapshotValue = readOwnControlValue(clip.templateSnapshot?.controls, control.id);
  if (snapshotValue.found) {
    return snapshotValue.value;
  }
  if (control.binding.kind !== VideoAnnotationControlBindingKind.TEMPLATE_FIELD) {
    return values[control.id] ?? control.defaultValue;
  }
  return (
    resolveTemplateFieldValue(clip.content, style, control.binding.field) ?? control.defaultValue
  );
}

function readOwnControlValue(
  values: VideoAnnotationTemplateControlValues | undefined,
  controlId: string
): { found: boolean; value: VideoAnnotationPrimitiveValue } {
  if (!values || !Object.prototype.hasOwnProperty.call(values, controlId)) {
    return { found: false, value: null };
  }
  return { found: true, value: values[controlId] ?? null };
}

function createThemeTokens(
  theme: VideoAnnotationPackTheme | undefined
): Map<string, VideoAnnotationPrimitiveValue> {
  const values = new Map<string, VideoAnnotationPrimitiveValue>();
  Object.entries(theme?.defaults ?? {}).forEach(([id, value]) => values.set(id, value));
  theme?.tokens.forEach((token) => values.set(token.id, token.value));
  return values;
}

function applyTemplateField(
  content: VideoProjectAnnotationContent,
  style: VideoProjectAnnotationStyle,
  field: string,
  value: VideoAnnotationPrimitiveValue
): void {
  if (field === 'content.badge') {
    content.badge = typeof value === 'string' && value !== '' ? value : null;
  }
  if (field === 'content.headline' && typeof value === 'string') {
    content.headline = value;
  }
  if (field === 'content.subline' && typeof value === 'string') {
    content.subline = value;
  }
  if (field === 'style.accentColor' && typeof value === 'string') {
    style.accentColor = value;
  }
  if (field === 'style.backgroundColor' && typeof value === 'string') {
    style.backgroundColor = value;
  }
  if (field === 'style.badgeTextColor' && typeof value === 'string') {
    style.badgeTextColor = value;
  }
  if (field === 'style.headlineColor' && typeof value === 'string') {
    style.headlineColor = value;
  }
  if (field === 'style.sublineColor' && typeof value === 'string') {
    style.sublineColor = value;
  }
  if (field === 'style.borderRadius' && typeof value === 'number') {
    style.borderRadius = value;
  }
  if (field === 'style.padding' && typeof value === 'number') {
    style.padding = value;
  }
}

function resolveTemplateFieldValue(
  content: VideoProjectAnnotationContent,
  style: VideoProjectAnnotationStyle,
  field: string
): VideoAnnotationPrimitiveValue {
  switch (field) {
    case 'content.badge':
      return content.badge;
    case 'content.headline':
      return content.headline;
    case 'content.subline':
      return content.subline;
    case 'style.accentColor':
      return style.accentColor;
    case 'style.backgroundColor':
      return style.backgroundColor;
    case 'style.badgeTextColor':
      return style.badgeTextColor;
    case 'style.borderRadius':
      return style.borderRadius;
    case 'style.headlineColor':
      return style.headlineColor;
    case 'style.padding':
      return style.padding;
    case 'style.sublineColor':
      return style.sublineColor;
    default:
      return null;
  }
}
