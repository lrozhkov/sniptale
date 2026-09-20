import { reviewSelectFieldClassName } from './controls';
import { translate } from '../../platform/i18n';
import { SelectField } from '../../ui/compact-inspector-controls';
import { ReviewNumberRow } from './number-row';
import { clampQuickEditSpotlightArea } from '../../features/video/review/advanced/focus';
import type { QuickEditSpotlight } from '../../features/video/review/advanced/types';

/** Settings for a source-area opening and the scene outside it. */
export function ReviewSpotlightInspector(props: {
  value: QuickEditSpotlight;
  onChange(value: QuickEditSpotlight): void;
}) {
  const { value, onChange } = props;
  const fields = [
    ['x', 'focusAreaX'],
    ['y', 'focusAreaY'],
    ['width', 'focusAreaWidth'],
    ['height', 'focusAreaHeight'],
  ] as const;
  return (
    <div className="space-y-3">
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.focusOutside')}
        value={value.effect}
        options={[
          { value: 'dim', label: translate('gallery.videoReview.focusDim') },
          { value: 'blur', label: translate('gallery.videoReview.focusBlur') },
        ]}
        onChange={(effect: QuickEditSpotlight['effect']) => onChange({ ...value, effect })}
      />
      {value.effect === 'dim' ? (
        <ReviewNumberRow
          label={translate('gallery.videoReview.focusStrength')}
          min={0}
          max={100}
          step={1}
          precision={0}
          unit="%"
          value={value.strength * 100}
          onChange={(strength) => onChange({ ...value, strength: strength / 100 })}
        />
      ) : (
        <ReviewNumberRow
          label={translate('gallery.videoReview.focusBlurRadius')}
          min={0}
          max={40}
          step={1}
          precision={1}
          unit="px"
          value={value.blur}
          onChange={(blur) => onChange({ ...value, blur })}
        />
      )}
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.focusReveal')}
        value={value.reveal}
        options={[
          { value: 'fade', label: translate('gallery.videoReview.focusFade') },
          { value: 'contract', label: translate('gallery.videoReview.focusContract') },
        ]}
        onChange={(reveal: QuickEditSpotlight['reveal']) => onChange({ ...value, reveal })}
      />
      {fields.map(([field, label]) => (
        <ReviewNumberRow
          key={field}
          label={translate(`gallery.videoReview.${label}`)}
          min={field === 'x' || field === 'y' ? 0 : 1}
          max={100}
          step={1}
          precision={1}
          unit="%"
          value={value.area[field] * 100}
          onChange={(next) =>
            onChange({
              ...value,
              area: clampQuickEditSpotlightArea({ ...value.area, [field]: next / 100 }),
            })
          }
        />
      ))}
      <ReviewNumberRow
        label={translate('gallery.videoReview.focusRoundness')}
        min={0}
        max={50}
        step={1}
        precision={0}
        unit="%"
        value={value.roundness * 100}
        onChange={(roundness) => onChange({ ...value, roundness: roundness / 100 })}
      />
    </div>
  );
}
