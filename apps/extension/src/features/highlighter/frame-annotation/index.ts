export {
  FRAME_ANNOTATION_SNAPSHOT_VERSION,
  createFrameAnnotationSnapshot,
  normalizeFrameAnnotationSnapshot,
  type FrameAnnotationRect,
  type FrameAnnotationSnapshot,
  type FrameAnnotationSnapshotV1,
  type FrameAnnotationVisualState,
} from './model';
export {
  parseFrameAnnotationSnapshot,
  parseSerializedFrameAnnotationSnapshot,
  serializeFrameAnnotationSnapshot,
} from './parser';
export { FrameAnnotationDecoration, type FrameAnnotationDecorationProps } from './decoration';
export {
  getFrameAnnotationContainerStyle,
  getFrameAnnotationFillStyle,
  getFrameAnnotationInteractiveStyle,
  getFrameAnnotationStrokeStyle,
} from './surface-style';
export { resolveFrameAnnotationVisualScene } from './render-scene';
export {
  isFrameHiddenDuringCapture,
  setBorderHiddenDuringCapture,
  setFrameHiddenDuringCapture,
} from './capture-visibility';
