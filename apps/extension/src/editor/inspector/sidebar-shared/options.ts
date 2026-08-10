import { type EditorFrameSettings } from '../../../features/editor/document/types';
import type { EditorImageSettings } from '../../../features/editor/document/image-types';
import { type EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import { translate } from '../../../platform/i18n';
import type { CompactSelectOption } from '../../chrome/ui';
export { GRID_COLOR_PALETTE, WORKSPACE_BACKGROUND_PALETTE } from './data';
import { FRAME_GRADIENT_PRESET_DATA } from './data';
export { loadRecentColors, pushRecentColor } from '../../../composition/persistence/recent-colors';

export const GRID_SIZE_MIN = 8;
export const GRID_SIZE_MAX = 160;

export function clampGridSize(value: number): number {
  return Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, Math.round(value)));
}

export function getLineStyleOptions(): CompactSelectOption<EditorImageSettings['strokeStyle']>[] {
  return [
    { value: 'solid', label: translate('editor.compact.lineStyleSolid') },
    { value: 'dash', label: translate('editor.compact.lineStyleDash') },
    { value: 'dot', label: translate('editor.compact.lineStyleDot') },
    { value: 'dash-dot', label: translate('editor.compact.lineStyleDashDot') },
    { value: 'long-dash', label: translate('editor.compact.lineStyleLongDash') },
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
