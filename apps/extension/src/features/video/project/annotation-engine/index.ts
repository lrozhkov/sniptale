export {
  APPLE_GLASS_ANNOTATION_PACK,
  APPLE_GLASS_ANNOTATION_PACK_ID,
  BUILT_IN_VIDEO_ANNOTATION_PACKS,
  CURSOR_OPS_ANNOTATION_PACK,
  CURSOR_OPS_ANNOTATION_PACK_ID,
  createBuiltInAnnotationControlValues,
} from './builtins/index';
export {
  LEGACY_TEMPLATE_ELEMENT_KIND,
  LEGACY_TEMPLATE_TARGET_KIND,
  SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID,
  SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID,
  getLegacyAnnotationTemplateRef,
  getLegacyAnnotationTemplateRefs,
  isLegacyAnnotationTemplateRef,
  isLegacyAnnotationTemplateKind,
  shouldUseLegacyAnnotationRenderer,
} from './legacy';
export {
  createEmptyVideoAnnotationTemplateGroups,
  createVideoAnnotationControlValues,
  parseVideoAnnotationPack,
} from './parser';
export {
  DEFAULT_VIDEO_ANNOTATION_TEMPLATE_REF,
  createTemplateRefKey,
  createVideoAnnotationPackRegistry,
  createVideoAnnotationTemplateSnapshot,
  resolveClipTemplateRef,
  resolveVideoAnnotationTemplate,
  type VideoAnnotationPackRegistry,
  type VideoAnnotationTemplateResolvableClip,
  type VideoAnnotationTemplateResolution,
} from './registry';
export {
  resolveAnnotationScene,
  resolveClipAnnotationScene,
  type ResolveAnnotationSceneParams,
} from './resolver';
export {
  clampAnnotationProgress,
  mapAnnotationSceneFrame,
  readAnnotationBoolean,
  readAnnotationNumber,
  readAnnotationProgress,
  readAnnotationString,
  resolveAnnotationNodeRenderFrame,
  type AnnotationSceneRenderFrame,
} from './render-values';
export type {
  AnnotationSceneTargetGeometry,
  ResolvedAnnotationFrame,
  ResolvedAnnotationPresentationSnapshot,
  ResolvedAnnotationRenderNode,
  ResolvedAnnotationScene,
  ResolvedAnnotationTarget,
  ResolvedAnnotationTimelineState,
  ResolvedAnnotationTimelineTrackState,
  ResolvedAnnotationTransform,
} from './scene';
export type {
  VideoAnnotationControlBinding,
  VideoAnnotationControlOption,
  VideoAnnotationLocalizedText,
  VideoAnnotationNodeFrame,
  VideoAnnotationPack,
  VideoAnnotationPackParseResult,
  VideoAnnotationPackTheme,
  VideoAnnotationPackValidationError,
  VideoAnnotationPrimitiveValue,
  VideoAnnotationRenderNode,
  VideoAnnotationTargetBinding,
  VideoAnnotationTemplate,
  VideoAnnotationTemplateControl,
  VideoAnnotationTemplateControlValues,
  VideoAnnotationTemplateGroups,
  VideoAnnotationTemplateRef,
  VideoAnnotationTemplateSnapshot,
  VideoAnnotationTemplateTimeline,
  VideoAnnotationThemeToken,
  VideoAnnotationTimelineEasing,
  VideoAnnotationTimelineExtrapolate,
  VideoAnnotationTimelineKeyframe,
  VideoAnnotationTimelineLabel,
  VideoAnnotationTimelinePhase,
  VideoAnnotationTimelinePhaseRange,
  VideoAnnotationTimelineStagger,
  VideoAnnotationTimelineTrack,
} from './types';
export {
  VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlSection,
  VideoAnnotationControlType,
  VideoAnnotationElementKind,
  VideoAnnotationRenderNodeKind,
  VideoAnnotationTargetBindingKind,
} from './types';
export {
  VIDEO_ANNOTATION_NODE_PROPERTIES,
  type VideoAnnotationNodeProperty,
} from './node-properties';
