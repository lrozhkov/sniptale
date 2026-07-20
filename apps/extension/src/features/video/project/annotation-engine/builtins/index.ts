import { APPLE_GLASS_ANNOTATION_PACK } from './apple-glass';
import { CURSOR_OPS_ANNOTATION_PACK } from './cursor-ops';

export { APPLE_GLASS_ANNOTATION_PACK, APPLE_GLASS_ANNOTATION_PACK_ID } from './apple-glass';
export { CURSOR_OPS_ANNOTATION_PACK, CURSOR_OPS_ANNOTATION_PACK_ID } from './cursor-ops';
export { createBuiltInAnnotationControlValues } from './legacy';

export const BUILT_IN_VIDEO_ANNOTATION_PACKS = [
  APPLE_GLASS_ANNOTATION_PACK,
  CURSOR_OPS_ANNOTATION_PACK,
] as const;
