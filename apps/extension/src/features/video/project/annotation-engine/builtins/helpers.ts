import {
  VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
  type VideoAnnotationElementKind,
  type VideoAnnotationLocalizedText,
  type VideoAnnotationPack,
  type VideoAnnotationPrimitiveValue,
  type VideoAnnotationRenderNode,
  type VideoAnnotationTargetBindingKind,
  type VideoAnnotationTemplate,
  type VideoAnnotationTemplateControl,
  type VideoAnnotationTimelineEasing,
  type VideoAnnotationTimelineTrack,
} from '../types';
import { createTimeline } from './timeline';
import { createContentControls } from './control-helpers';
export { createContentControls } from './control-helpers';

const ANNOTATION_TEMPLATE_KEY_PREFIX = 'videoEditor.sidebar.annotationTemplates';

interface BuiltInContentTemplateParams {
  catalog: BuiltInContentTemplateCatalog;
  defaults?: {
    description: string;
    headline: string;
    label: string;
    subline: string;
  };
  durationMs: number;
  elementKind: VideoAnnotationElementKind;
  id: string;
  renderTree: VideoAnnotationRenderNode;
  targetKind: VideoAnnotationTargetBindingKind;
  tracks: readonly VideoAnnotationTimelineTrack[];
}

interface BuiltInContentTemplateCatalog {
  accent: string;
  background: string;
  defaultDescription: string;
  defaultHeadline: string;
  defaultSubline: string;
  easing: VideoAnnotationTimelineEasing;
  headlineColor: string;
  radius: number;
  sublineColor: string;
}

type BuiltInContentTemplateDefaults = NonNullable<BuiltInContentTemplateParams['defaults']>;

export function localized(key: string, fallback: string): VideoAnnotationLocalizedText {
  return { fallback, key: `${ANNOTATION_TEMPLATE_KEY_PREFIX}.${key}` };
}

function createTemplate(params: {
  controls: readonly VideoAnnotationTemplateControl[];
  description: VideoAnnotationLocalizedText;
  durationMs: number;
  elementKind: VideoAnnotationElementKind;
  id: string;
  label: VideoAnnotationLocalizedText;
  renderTree: VideoAnnotationRenderNode;
  targetKind: VideoAnnotationTargetBindingKind;
  tracks: readonly VideoAnnotationTimelineTrack[];
}): VideoAnnotationTemplate {
  return {
    controls: params.controls,
    description: params.description,
    elementKind: params.elementKind,
    id: params.id,
    label: params.label,
    renderTree: params.renderTree,
    target: {
      kind: params.targetKind,
      required: params.targetKind !== 'none',
    },
    timeline: createTimeline(params.durationMs, params.tracks),
  };
}

function createBuiltInContentTemplate(
  params: BuiltInContentTemplateParams
): VideoAnnotationTemplate {
  const { catalog, defaults } = params;
  return createTemplate({
    controls: createContentControls({
      accent: catalog.accent,
      background: catalog.background,
      durationMs: params.durationMs,
      easing: catalog.easing,
      headline: defaults?.headline ?? catalog.defaultHeadline,
      headlineColor: catalog.headlineColor,
      radius: catalog.radius,
      subline: defaults?.subline ?? catalog.defaultSubline,
      sublineColor: catalog.sublineColor,
    }),
    description: localized(
      `${params.id}Description`,
      defaults?.description ?? catalog.defaultDescription
    ),
    durationMs: params.durationMs,
    elementKind: params.elementKind,
    id: params.id,
    label: localized(`${params.id}Label`, defaults?.label ?? params.id),
    renderTree: params.renderTree,
    targetKind: params.targetKind,
    tracks: params.tracks,
  });
}

export function createBuiltInContentTemplateFactory(params: {
  catalog: BuiltInContentTemplateCatalog;
  defaultTracks: () => readonly VideoAnnotationTimelineTrack[];
  resolveDefaults: (id: string) => BuiltInContentTemplateDefaults | undefined;
  resolveElementKind: (key: string) => VideoAnnotationElementKind;
}) {
  return (
    id: string,
    key: string,
    renderTree: VideoAnnotationRenderNode,
    durationMs: number,
    targetKind: VideoAnnotationTargetBindingKind,
    tracks: readonly VideoAnnotationTimelineTrack[] = params.defaultTracks()
  ): VideoAnnotationTemplate => {
    const defaults = params.resolveDefaults(id);
    return createBuiltInContentTemplate({
      catalog: params.catalog,
      ...(defaults ? { defaults } : {}),
      durationMs,
      elementKind: params.resolveElementKind(key),
      id,
      renderTree,
      targetKind,
      tracks,
    });
  };
}

export function createPack(params: {
  description: VideoAnnotationLocalizedText;
  label: VideoAnnotationLocalizedText;
  packId: string;
  templates: VideoAnnotationPack['templates'];
  theme: VideoAnnotationPack['theme'];
}): VideoAnnotationPack {
  return {
    description: params.description,
    label: params.label,
    packId: params.packId,
    schemaVersion: VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
    templates: params.templates,
    theme: params.theme,
  };
}

export function group(children: readonly VideoAnnotationRenderNode[]): VideoAnnotationRenderNode {
  return { children, id: 'root', nodeType: 'group' };
}

export function textNode(
  id: string,
  text: string,
  frame: VideoAnnotationRenderNode['frame'],
  style: Record<string, VideoAnnotationPrimitiveValue>
): VideoAnnotationRenderNode {
  return { frame, id, nodeType: 'text', props: { text }, style };
}

export function rectNode(
  id: string,
  frame: VideoAnnotationRenderNode['frame'],
  style: Record<string, VideoAnnotationPrimitiveValue>,
  children?: readonly VideoAnnotationRenderNode[],
  props?: Record<string, VideoAnnotationPrimitiveValue>
): VideoAnnotationRenderNode {
  return { children, frame, id, nodeType: 'rect', props, style };
}
