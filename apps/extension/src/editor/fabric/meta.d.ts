import 'fabric';
import type {
  EditorArrowHead,
  EditorArrowMode,
  EditorArrowType,
  EditorArrowVariant,
  EditorFrameSettings,
  EditorObjectType,
} from '../../features/editor/document/types';
import type { BlurSettings } from '../../features/highlighter/contracts';
import type { EditorGradientColorStop } from '../../features/editor/document/gradient';
import type {
  EditorLineCornerStyle,
  EditorLineFillMode,
  EditorLineRoughFillStyle,
  EditorLineSettings,
  EditorLineStyle,
} from '../../features/editor/document/line-types';
import type { EditorRasterEffect } from '../../features/editor/document/effects';
import type { EditorRichShapeDocumentObject } from '../../features/editor/document/rich-shape';
import type {
  StepBadgeAlphabet,
  StepBadgeSizeLevel,
  StepBadgeType,
} from '../../features/highlighter/contracts';

declare module 'fabric' {
  interface FabricObject {
    sniptaleId?: string;
    sniptaleType?: EditorObjectType;
    sniptaleLabel?: string;
    sniptaleLocked?: boolean;
    sniptaleRole?:
      | 'annotation'
      | 'background'
      | 'frame'
      | 'browser-frame'
      | 'source'
      | 'stamp'
      | 'crop-guide';
    sniptaleBackgroundMode?: EditorFrameSettings['backgroundMode'];
    sniptaleBackgroundFit?: EditorFrameSettings['backgroundImageFit'];
    sniptaleBackgroundImageData?: string | null;
    sniptaleBackgroundColor?: string;
    sniptaleBackgroundGradientFrom?: string;
    sniptaleBackgroundGradientTo?: string;
    sniptaleBackgroundGradientStops?: string[] | undefined;
    sniptaleBackgroundGradientColorStops?: EditorGradientColorStop[] | undefined;
    sniptaleBackgroundGradientAngle?: number;
    sniptaleTextCalloutFormat?: string;
    sniptaleTextLayoutMode?: 'auto' | 'fixed-width';
    sniptaleTextVerticalAlign?: 'top' | 'center' | 'bottom';
    sniptaleTextInitialInsertPending?: boolean;
    sniptaleTextOpacity?: number;
    sniptaleTextBackgroundOpacity?: number;
    sniptaleTextCalloutShadow?: number;
    sniptaleTextShadowAngle?: number;
    sniptaleTextShadowBlur?: number;
    sniptaleTextShadowColor?: string;
    sniptaleTextShadowDistance?: number;
    sniptaleTextCalloutWidth?: number;
    sniptaleTextCalloutHeight?: number;
    sniptaleBrushShadow?: number;
    sniptaleBrushShadowAngle?: number;
    sniptaleBrushShadowBlur?: number;
    sniptaleBrushShadowColor?: string;
    sniptaleBrushShadowDistance?: number;
    sniptaleBrushSmoothing?: number;
    sniptaleBrushDynamicWidth?: boolean;
    sniptaleBrushWidth?: number;
    sniptaleBrushPointsJson?: string;
    sniptaleBrushSamplesJson?: string;
    sniptaleCropGuideMode?: 'preview' | 'selection';
    sniptaleBorderPresetId?: string | null;
    sniptaleShapeStrokeStyle?: 'solid' | 'dashed' | 'dotted';
    sniptaleShapeRadius?: number;
    sniptaleShapeShadow?: number;
    sniptaleShapeShadowAngle?: number;
    sniptaleShapeShadowBlur?: number;
    sniptaleShapeShadowColor?: string;
    sniptaleShapeShadowDistance?: number;
    sniptaleShapeStrokeOpacity?: number;
    sniptaleShapeFillOpacity?: number;
    sniptaleShapeCustomCss?: string;
    sniptaleShapeInheritCustomCss?: boolean;
    sniptaleImageOpacity?: number;
    sniptaleImageRadius?: number;
    sniptaleImageShadow?: number;
    sniptaleImageShadowAngle?: number;
    sniptaleImageShadowBlur?: number;
    sniptaleImageShadowColor?: string;
    sniptaleImageShadowDistance?: number;
    sniptaleImageStrokeColor?: string;
    sniptaleImageStrokeOpacity?: number;
    sniptaleImageStrokeStyle?: BlurSettings['strokeStyle'];
    sniptaleImageStrokeWidth?: number;
    sniptaleBlurAmount?: number;
    sniptaleBlurType?: 'gaussian' | 'distortion' | 'pixelate' | 'solid';
    sniptaleBlurShowBorder?: boolean;
    sniptaleBlurStrokeColor?: string;
    sniptaleBlurStrokeStyle?: BlurSettings['strokeStyle'];
    sniptaleBlurStrokeWidth?: number;
    sniptaleBlurSourceData?: string | null;
    sniptaleBlurSourceLeft?: number;
    sniptaleBlurSourceTop?: number;
    sniptaleBlurSourceWidth?: number;
    sniptaleBlurSourceHeight?: number;
    sniptaleArrowWidth?: number;
    sniptaleArrowStyle?: EditorLineStyle;
    sniptaleArrowVariant?: EditorArrowVariant;
    sniptaleArrowMode?: EditorArrowMode;
    sniptaleArrowType?: EditorArrowType;
    sniptaleArrowDynamicWidth?: boolean;
    sniptaleArrowClickMode?: boolean;
    sniptaleArrowDrawing?: boolean;
    sniptaleArrowEditMode?: boolean;
    sniptaleArrowPointerMoved?: boolean;
    sniptaleArrowDraftPoints?: Array<{ x: number; y: number }>;
    sniptaleArrowStartHead?: EditorArrowHead;
    sniptaleArrowStartHeadSize?: number;
    sniptaleArrowEndHead?: EditorArrowHead;
    sniptaleArrowEndHeadSize?: number;
    sniptaleArrowColor?: string;
    sniptaleArrowOpacity?: number;
    sniptaleArrowShadow?: number;
    sniptaleArrowShadowAngle?: number;
    sniptaleArrowShadowBlur?: number;
    sniptaleArrowShadowColor?: string;
    sniptaleArrowShadowDistance?: number;
    sniptaleArrowRoughness?: number;
    sniptaleArrowBowing?: number;
    sniptaleArrowPointsJson?: string;
    sniptaleArrowStartX?: number;
    sniptaleArrowStartY?: number;
    sniptaleArrowEndX?: number;
    sniptaleArrowEndY?: number;
    sniptaleArrowControlX?: number;
    sniptaleArrowControlY?: number;
    sniptaleLineClosed?: boolean;
    sniptaleLineClickMode?: boolean;
    sniptaleLineDrawing?: boolean;
    sniptaleLinePointerMoved?: boolean;
    sniptaleLineEditMode?: boolean;
    sniptaleLinePoints?: Array<{ x: number; y: number }>;
    sniptaleLineSettings?: EditorLineSettings;
    sniptaleLinePointsJson?: string;
    sniptaleLineColor?: string;
    sniptaleLineWidth?: number;
    sniptaleLineOpacity?: number;
    sniptaleLineShadow?: number;
    sniptaleLineShadowAngle?: number;
    sniptaleLineShadowBlur?: number;
    sniptaleLineShadowColor?: string;
    sniptaleLineShadowDistance?: number;
    sniptaleLineStyle?: EditorLineStyle;
    sniptaleLineCorners?: EditorLineCornerStyle;
    sniptaleLineRoughness?: number;
    sniptaleLineBowing?: number;
    sniptaleLineFillMode?: EditorLineFillMode;
    sniptaleLineFillColor?: string;
    sniptaleLineFillOpacity?: number;
    sniptaleLineGradientFrom?: string;
    sniptaleLineGradientTo?: string;
    sniptaleLineGradientStops?: EditorGradientColorStop[];
    sniptaleLineGradientAngle?: number;
    sniptaleLineRoughFillStyle?: EditorLineRoughFillStyle;
    sniptaleLineRoughFillColor?: string;
    sniptaleLineRoughFillGap?: number;
    sniptaleLineRoughFillAngle?: number;
    sniptaleLineRoughFillWeight?: number;
    sniptaleLineRoughFillRoughness?: number;
    sniptaleLineRoughFillBowing?: number;
    sniptaleLineRoughFillOpacity?: number;
    sniptaleStepValue?: string;
    sniptaleStepType?: StepBadgeType;
    sniptaleStepAlphabet?: StepBadgeAlphabet;
    sniptaleStepSizeLevel?: StepBadgeSizeLevel;
    sniptaleStepColor?: string;
    sniptaleStepOpacity?: number;
    sniptaleStepTextColor?: string;
    sniptaleStepStrokeColor?: string;
    sniptaleStepStrokeOpacity?: number;
    sniptaleStepStrokeWidth?: number;
    sniptaleMetaKind?: 'url' | 'date' | 'browser';
    sniptaleEffects?: EditorRasterEffect[];
    sniptaleRichShape?: EditorRichShapeDocumentObject;
    sniptaleRichShapeCatalogId?: string;
  }
}
