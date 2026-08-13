import 'fabric';
import type { EditorFrameSettings, EditorObjectType } from '../../features/editor/document/types';
import type { BlurSettings } from '../../features/highlighter/contracts';
import type { EditorGradientColorStop } from '../../features/editor/document/gradient';
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
    sniptaleBackgroundBlurAmount?: number;
    sniptaleBackgroundFit?: EditorFrameSettings['backgroundImageFit'];
    sniptaleBackgroundImageData?: string | null;
    sniptaleBackgroundColor?: string;
    sniptaleBackgroundGradientFrom?: string;
    sniptaleBackgroundGradientTo?: string;
    sniptaleBackgroundGradientStops?: string[] | undefined;
    sniptaleBackgroundGradientColorStops?: EditorGradientColorStop[] | undefined;
    sniptaleBackgroundGradientAngle?: number;
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
    sniptaleFrameAnnotationRevision?: number;
    sniptaleFrameAnnotationJson?: string;
    sniptaleDrawingJson?: string;
    sniptaleDrawingTextAutoWidth?: boolean;
    sniptaleDrawingTextMaxWidth?: number;
  }
}
