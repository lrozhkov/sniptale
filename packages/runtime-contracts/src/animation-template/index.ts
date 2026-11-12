export {
  ANIMATION_TEMPLATE_FORMAT,
  ANIMATION_TEMPLATE_VERSION,
  ANIMATION_TEMPLATE_LIMITS,
} from './types.js';
export type {
  AnimationTemplate,
  AnimationTemplateSlot,
  LottieAnimation,
  AnimationSlotBinding,
  AnimationResource,
  AnimationObjectLayout,
  AnimationObjectHandle,
  AnimationDiagnostic,
  AnimationValidationResult,
} from './types.js';
export {
  validateAnimationTemplate,
  listAnimationTemplateSlots,
  parseAnimationTemplateSource,
  parseAnimationTemplateJson,
} from './validation.js';
export { isAnimationResourcePath, verifyAnimationResource } from './assets.js';
export {
  layoutAnimationText,
  layoutAnimationPointer,
  layoutAnimationArrow,
  resolveAnimationObjectRenderBounds,
  mapAnimationScenePoint,
  mapAnimationObjectPoint,
} from './layout.js';
export type { AnimationTextMeasure, AnimationTextLayout } from './layout.js';
