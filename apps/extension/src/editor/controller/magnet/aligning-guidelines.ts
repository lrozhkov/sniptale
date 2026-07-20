import type { BasicTransformEvent, FabricObject, TPointerEvent } from 'fabric';
import {
  AligningGuidelines,
  type AligningGuidelines as FabricAligningGuidelines,
  type AligningLineConfig,
} from '../../fabric/vendor/fabric/aligning-guidelines.mjs';

export type EditorMagnetTransformEvent = BasicTransformEvent<TPointerEvent> & {
  target: FabricObject;
};

export type EditorMagnetGuidelineConfig = AligningLineConfig;

export type EditorMagnetAligningGuidelines = FabricAligningGuidelines;
export { AligningGuidelines };
