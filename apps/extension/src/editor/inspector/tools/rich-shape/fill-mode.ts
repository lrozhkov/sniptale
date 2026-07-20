import { translate } from '../../../../platform/i18n';
import type { RichShapeControlsProps } from './types';

export type FillMode = 'none' | 'solid' | 'gradient' | 'sketch';

export function getFillMode(props: RichShapeControlsProps): FillMode {
  if (props.shape.style.fillTransparency >= 1) {
    return 'none';
  }
  if (props.shape.rough.enabled) {
    return 'sketch';
  }
  return props.shape.style.fill.type === 'gradient' ? 'gradient' : 'solid';
}

export function syncFillMode(
  fillTransparency: number,
  fillType: RichShapeControlsProps['shape']['style']['fill']['type'],
  roughEnabled: boolean
): FillMode {
  if (fillTransparency >= 1) {
    return 'none';
  }
  return roughEnabled ? 'sketch' : fillType === 'gradient' ? 'gradient' : 'solid';
}

export function createFillModeOptions(roughAvailable: boolean) {
  const options: Array<{ value: FillMode; label: string }> = [
    { value: 'none', label: translate('editor.compact.richShapeFillNone') },
    { value: 'solid', label: translate('editor.compact.richShapeFillSolid') },
    { value: 'gradient', label: translate('editor.compact.richShapeFillGradient') },
  ];

  if (roughAvailable) {
    options.push({
      value: 'sketch',
      label: translate('editor.compact.richShapeRoughFillStyle'),
    });
  }

  return options;
}
