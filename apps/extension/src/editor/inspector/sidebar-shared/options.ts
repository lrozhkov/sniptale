import {
  EDITOR_BRUSH_SHAPE_CORRECTION,
  type EditorArrowType,
  type EditorArrowHead,
  type EditorBrushShapeCorrectionMode,
  type EditorFrameSettings,
} from '../../../features/editor/document/types';
import { type BlurType } from '../../../features/highlighter/contracts';
import {
  type EditorLineCornerStyle,
  type EditorLineFillMode,
  type EditorLineRoughFillStyle,
  type EditorLineStyle,
} from '../../../features/editor/document/line-types';
import { type EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import { type EditorTextCalloutFormat } from '../../../features/editor/document/text';
import { translate } from '../../../platform/i18n';
import type { CompactSelectOption } from '../../chrome/ui';
import { createRoughFillStyleOptions } from '../tools/rough-fill-options';
export { GRID_COLOR_PALETTE, WORKSPACE_BACKGROUND_PALETTE } from './data';
import { FRAME_GRADIENT_PRESET_DATA } from './data';
export { loadRecentColors, pushRecentColor } from '../../../composition/persistence/recent-colors';

export const GRID_SIZE_MIN = 8;
export const GRID_SIZE_MAX = 160;

export function clampGridSize(value: number): number {
  return Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, Math.round(value)));
}

export function getArrowModeOptions(): CompactSelectOption<'straight' | 'curve'>[] {
  return [
    { value: 'straight', label: translate('editor.compact.arrowModeStraight') },
    { value: 'curve', label: translate('editor.compact.arrowModeCurve') },
  ];
}

export function getArrowTypeOptions(): CompactSelectOption<EditorArrowType>[] {
  return [
    { value: 'sharp', label: translate('editor.compact.arrowTypeSharp') },
    { value: 'curved', label: translate('editor.compact.arrowTypeCurved') },
    { value: 'elbow', label: translate('editor.compact.arrowTypeElbow') },
  ];
}

export function getBlurTypeOptions(): CompactSelectOption<BlurType>[] {
  return [
    { value: 'gaussian', label: translate('editor.compact.blurTypeGaussian') },
    { value: 'distortion', label: translate('editor.compact.blurTypeDistortion') },
    { value: 'pixelate', label: translate('editor.compact.blurTypePixelate') },
    { value: 'solid', label: translate('editor.compact.blurTypeSolid') },
  ];
}

export function getArrowVariantOptions(): CompactSelectOption<'standard' | 'tapered'>[] {
  return [
    { value: 'standard', label: translate('editor.compact.arrowVariantStandard') },
    { value: 'tapered', label: translate('editor.compact.arrowVariantTapered') },
  ];
}

export function getArrowHeadOptions(): CompactSelectOption<EditorArrowHead>[] {
  return [
    { value: 'none', label: translate('editor.compact.arrowHeadNone') },
    { value: 'arrow', label: translate('editor.compact.arrowHeadArrow') },
    { value: 'triangle', label: translate('editor.compact.arrowHeadTriangle') },
    { value: 'triangle-outline', label: translate('editor.compact.arrowHeadTriangleOutline') },
    { value: 'bar', label: translate('editor.compact.arrowHeadBar') },
    { value: 'circle', label: translate('editor.compact.arrowHeadCircle') },
    { value: 'circle-outline', label: translate('editor.compact.arrowHeadCircleOutline') },
    { value: 'diamond', label: translate('editor.compact.arrowHeadDiamond') },
    { value: 'diamond-outline', label: translate('editor.compact.arrowHeadDiamondOutline') },
    { value: 'block', label: translate('editor.compact.arrowHeadBlock') },
  ];
}

export function getLineStyleOptions(): CompactSelectOption<EditorLineStyle>[] {
  return [
    { value: 'solid', label: translate('editor.compact.lineStyleSolid') },
    { value: 'dash', label: translate('editor.compact.lineStyleDash') },
    { value: 'dot', label: translate('editor.compact.lineStyleDot') },
    { value: 'dash-dot', label: translate('editor.compact.lineStyleDashDot') },
    { value: 'long-dash', label: translate('editor.compact.lineStyleLongDash') },
  ];
}

export function getLineCornerOptions(): CompactSelectOption<EditorLineCornerStyle>[] {
  return [
    { value: 'round', label: translate('editor.compact.lineCornersRound') },
    { value: 'sharp', label: translate('editor.compact.lineCornersSharp') },
  ];
}

export function getLineFillModeOptions(): CompactSelectOption<EditorLineFillMode>[] {
  return [
    { value: 'none', label: translate('editor.compact.none') },
    { value: 'color', label: translate('editor.compact.lineFillColor') },
    { value: 'gradient', label: translate('editor.compact.lineFillGradient') },
    { value: 'rough', label: translate('editor.compact.lineFillRough') },
  ];
}

export function getLineRoughFillStyleOptions(): CompactSelectOption<EditorLineRoughFillStyle>[] {
  return createRoughFillStyleOptions<EditorLineRoughFillStyle>();
}

export function getTextCalloutFormatOptions(): CompactSelectOption<EditorTextCalloutFormat>[] {
  return [
    { value: 'plain', label: translate('editor.compact.calloutFormatPlain') },
    { value: 'panel', label: translate('editor.compact.calloutFormatPanel') },
    { value: 'bubble', label: translate('editor.compact.calloutFormatBubble') },
    { value: 'pointer', label: translate('editor.compact.calloutFormatPointer') },
    { value: 'flag', label: translate('editor.compact.calloutFormatFlag') },
    { value: 'arrow-bubble', label: translate('editor.compact.calloutFormatArrowBubble') },
  ];
}

export function getTextAlignOptions(): CompactSelectOption<'left' | 'center' | 'right'>[] {
  return [
    { value: 'left', label: translate('editor.compact.textAlignLeft') },
    { value: 'center', label: translate('editor.compact.textAlignCenter') },
    { value: 'right', label: translate('editor.compact.textAlignRight') },
  ];
}

export function getTextVerticalAlignOptions(): CompactSelectOption<'top' | 'center' | 'bottom'>[] {
  return [
    { value: 'top', label: translate('editor.compact.verticalAlignTop') },
    { value: 'center', label: translate('editor.compact.verticalAlignCenter') },
    { value: 'bottom', label: translate('editor.compact.verticalAlignBottom') },
  ];
}

export function getTextLayoutModeOptions(): CompactSelectOption<'auto' | 'fixed-width'>[] {
  return [
    { value: 'auto', label: translate('editor.compact.layoutModeAuto') },
    { value: 'fixed-width', label: translate('editor.compact.layoutModeFixedWidth') },
  ];
}

export function getFontOptions(): CompactSelectOption<'sans' | 'serif' | 'mono'>[] {
  return [
    { value: 'sans', label: translate('editor.compact.fontSans') },
    { value: 'serif', label: translate('editor.compact.fontSerif') },
    { value: 'mono', label: translate('editor.compact.fontMono') },
  ];
}

export function getBrushShapeCorrectionOptions(): CompactSelectOption<EditorBrushShapeCorrectionMode>[] {
  return [
    {
      value: EDITOR_BRUSH_SHAPE_CORRECTION.OFF,
      label: translate('editor.compact.shapeCorrectionOff'),
    },
    {
      value: EDITOR_BRUSH_SHAPE_CORRECTION.SUBTLE,
      label: translate('editor.compact.shapeCorrectionSubtle'),
    },
    {
      value: EDITOR_BRUSH_SHAPE_CORRECTION.STRONG,
      label: translate('editor.compact.shapeCorrectionStrong'),
    },
  ];
}

export function getStepTypeOptions(): CompactSelectOption<EditorToolSettings['step']['type']>[] {
  return [
    { value: 'number', label: '123' },
    { value: 'letter', label: 'ABC' },
    { value: 'manual', label: translate('editor.compact.stepManual') },
  ];
}

export function getStepAlphabetOptions(): CompactSelectOption<'cyrillic' | 'latin'>[] {
  return [
    { value: 'cyrillic', label: 'RU' },
    { value: 'latin', label: 'EN' },
  ];
}

export function getBrowserCanvasModeOptions(): CompactSelectOption<'resize' | 'keep-size'>[] {
  return [
    { value: 'resize', label: translate('editor.compact.browserCanvasModeResize') },
    { value: 'keep-size', label: translate('editor.compact.browserCanvasModeKeepSize') },
  ];
}

export function getBrowserContentModeOptions(): CompactSelectOption<'push-down' | 'fit-content'>[] {
  return [
    { value: 'push-down', label: translate('editor.compact.browserContentModePushDown') },
    { value: 'fit-content', label: translate('editor.compact.browserContentModeFitContent') },
  ];
}

export function getFrameBackgroundModeOptions(): CompactSelectOption<
  EditorFrameSettings['backgroundMode']
>[] {
  return [
    { value: 'color', label: translate('editor.compact.frameBackgroundModeColor') },
    { value: 'gradient', label: translate('editor.compact.frameBackgroundModeGradient') },
    { value: 'image', label: translate('editor.compact.frameBackgroundModeImage') },
  ];
}

export function getFrameLayoutModeOptions(): CompactSelectOption<
  EditorFrameSettings['layoutMode']
>[] {
  return [
    { value: 'expand-canvas', label: translate('editor.compact.frameLayoutExpandCanvas') },
    { value: 'fit-image', label: translate('editor.compact.frameLayoutFitImage') },
  ];
}

export function getFrameBackgroundImageFitOptions(): CompactSelectOption<
  EditorFrameSettings['backgroundImageFit']
>[] {
  return [
    { value: 'cover', label: translate('editor.compact.frameBackgroundImageFitCover') },
    { value: 'contain', label: translate('editor.compact.frameBackgroundImageFitContain') },
    { value: 'stretch', label: translate('editor.compact.frameBackgroundImageFitStretch') },
    { value: 'tile', label: translate('editor.compact.frameBackgroundImageFitTile') },
    { value: 'fit-width', label: translate('editor.compact.frameBackgroundImageFitWidth') },
    { value: 'fit-height', label: translate('editor.compact.frameBackgroundImageFitHeight') },
  ];
}

export interface BackgroundGradientPreset {
  id: string;
  label: string;
  from: string;
  to: string;
  angle: number;
}

export function getFrameGradientPresets(): BackgroundGradientPreset[] {
  return FRAME_GRADIENT_PRESET_DATA.map(({ labelKey, ...preset }) => ({
    ...preset,
    label: translate(labelKey),
  }));
}
