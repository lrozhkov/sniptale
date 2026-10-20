import { clampQuickEditSpotlightArea } from '../../features/video/project/scene/focus-appearance';
import { translate } from '../../platform/i18n';

import type { QuickEditBorder } from '../../features/video/project/scene/focus-appearance';
import { PreviewNumericRow } from '../compact-inspector-controls/numeric-preview';

type FocusArea = QuickEditBorder['area'];
/** Edit normalized corner roundness through the compact percentage control. */
export function FocusRoundnessField(props: {
  value: number;
  onPreview(value: number | null): void;
  onChange(value: number): void;
}) {
  return (
    <PreviewNumericRow
      label={translate('gallery.videoReview.focusRoundness')}
      min={0}
      max={50}
      step={1}
      precision={0}
      unit="%"
      value={props.value * 100}
      onPreview={(value) => props.onPreview(value === null ? null : value / 100)}
      onChange={(value) => props.onChange(value / 100)}
    />
  );
}
/** Keep numeric area edits and pointer edits inside the same normalized bounds. */
export function FocusAreaFields(props: {
  area: FocusArea;
  onPreview(area: FocusArea | null): void;
  onChange(area: FocusArea): void;
}) {
  return (
    [
      ['x', 'focusAreaX'],
      ['y', 'focusAreaY'],
      ['width', 'focusAreaWidth'],
      ['height', 'focusAreaHeight'],
    ] as const
  ).map(([field, label]) => (
    <PreviewNumericRow
      key={field}
      label={translate(`gallery.videoReview.${label}`)}
      min={field === 'x' || field === 'y' ? 0 : 1}
      max={100}
      step={1}
      precision={1}
      unit="%"
      value={props.area[field] * 100}
      onPreview={(next) =>
        props.onPreview(
          next === null ? null : clampQuickEditSpotlightArea({ ...props.area, [field]: next / 100 })
        )
      }
      onChange={(next) =>
        props.onChange(clampQuickEditSpotlightArea({ ...props.area, [field]: next / 100 }))
      }
    />
  ));
}
