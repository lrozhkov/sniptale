import { translate } from '../../../platform/i18n';
import type { CompactSelectOption } from '../../chrome/ui';

export function createRoughFillStyleOptions<
  TValue extends string,
>(): CompactSelectOption<TValue>[] {
  return [
    { value: 'hachure', label: translate('editor.compact.richShapeRoughFillHachure') },
    { value: 'solid', label: translate('editor.compact.richShapeRoughFillSolid') },
    { value: 'zigzag', label: translate('editor.compact.richShapeRoughFillZigzag') },
    { value: 'cross-hatch', label: translate('editor.compact.richShapeRoughFillCrossHatch') },
    { value: 'dots', label: translate('editor.compact.richShapeRoughFillDots') },
    { value: 'dashed', label: translate('editor.compact.richShapeRoughFillDashed') },
    { value: 'zigzag-line', label: translate('editor.compact.richShapeRoughFillZigzagLine') },
  ] as CompactSelectOption<TValue>[];
}
