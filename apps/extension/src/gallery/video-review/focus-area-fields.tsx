import { translate } from '../../platform/i18n';
import { clampQuickEditSpotlightArea } from '../../features/video/review/advanced/focus';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';
import { ReviewPreviewNumberRow } from './number-row';
export function ReviewFocusRoundness(props: {
  value: number;
  onPreview(value: number | null): void;
  onChange(value: number): void;
}) {
  return (
    <ReviewPreviewNumberRow
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
export function ReviewFocusAreaFields(props: {
  area: QuickEditRect;
  onPreview(area: QuickEditRect | null): void;
  onChange(area: QuickEditRect): void;
}) {
  return (
    [
      ['x', 'focusAreaX'],
      ['y', 'focusAreaY'],
      ['width', 'focusAreaWidth'],
      ['height', 'focusAreaHeight'],
    ] as const
  ).map(([field, label]) => (
    <ReviewPreviewNumberRow
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
