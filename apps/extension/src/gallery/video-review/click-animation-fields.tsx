import { ColorField, NumericRow, SelectField } from '../../ui/compact-inspector-controls';
import { translate } from '../../platform/i18n';
import {
  REVIEW_CLICK_BOUNDS,
  type ReviewClickStyle,
} from '../../features/video/review/advanced/click-animation';
import {
  ReviewButton,
  ReviewDetails,
  reviewSelectFieldClassName,
  reviewTextButtonClassName,
} from './controls';

/** Mixed batch fields patch only the changed value, preserving every other click setting. */
export function ReviewClickFields(props: {
  values: readonly ReviewClickStyle[];
  onChange(patch: Partial<ReviewClickStyle> | null): void;
}) {
  const common = <K extends keyof ReviewClickStyle>(key: K): ReviewClickStyle[K] | null => {
    const first = props.values[0]?.[key];
    return first !== undefined && props.values.every((value) => value[key] === first)
      ? first
      : null;
  };
  const number = (
    key: keyof typeof REVIEW_CLICK_BOUNDS,
    label: Parameters<typeof translate>[0],
    factor = 1,
    unit: '%' | 'px' | '' = ''
  ) => {
    const value = common(key);
    const [min, max] = REVIEW_CLICK_BOUNDS[key];
    return (
      <NumericRow
        key={key}
        appearance="plain"
        focusAppearance="accent-box"
        className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
        label={translate(label)}
        value={value === null ? null : value * factor}
        min={min * factor}
        max={max * factor}
        step={key === 'stroke' ? 0.5 : 1}
        precision={key === 'stroke' ? 1 : 0}
        unit={unit}
        onPreviewValue={() => undefined}
        onCommitValue={(next) => props.onChange({ [key]: next / factor })}
      />
    );
  };
  return (
    <div className="space-y-3" data-ui="gallery.videoReview.clickFields">
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.clickEffect')}
        value={common('effect') ?? ''}
        options={(['off', 'ripple', 'press', 'glow'] as const).map((value) => ({
          value,
          label: translate(`gallery.videoReview.click_${value}`),
        }))}
        onChange={(effect: ReviewClickStyle['effect']) => props.onChange({ effect })}
      />
      {common('effect') !== 'off' ? (
        <>
          <ReviewDetails
            preferenceId="click-appearance"
            label={translate('gallery.videoReview.clickAppearance')}
          >
            {common('color') === null ? (
              <p className="text-xs text-[var(--sniptale-color-text-muted)]">
                {translate('gallery.videoReview.clickMixed')}
              </p>
            ) : null}
            <ColorField
              label={translate('gallery.videoReview.clickColor')}
              title={translate('gallery.videoReview.clickColor')}
              value={common('color') ?? '#ffffff'}
              onChange={(color) => props.onChange({ color })}
            />
            {number('radius', 'gallery.videoReview.clickRadius', 1, 'px')}
            {number('stroke', 'gallery.videoReview.clickStroke', 1, 'px')}
            {number('opacity', 'gallery.videoReview.clickOpacity', 100, '%')}
          </ReviewDetails>
          <ReviewDetails
            preferenceId="click-timing"
            label={translate('gallery.videoReview.clickTiming')}
          >
            {number('before', 'gallery.videoReview.clickBefore', 1000)}
            {number('after', 'gallery.videoReview.clickAfter', 1000)}
            {number('pulses', 'gallery.videoReview.clickPulses')}
            <SelectField
              className={reviewSelectFieldClassName}
              label={translate('gallery.videoReview.clickEasing')}
              value={common('easing') ?? ''}
              options={(['linear', 'ease-out', 'ease-in-out'] as const).map((value) => ({
                value,
                label: translate(`gallery.videoReview.click_${value}`),
              }))}
              onChange={(easing: ReviewClickStyle['easing']) => props.onChange({ easing })}
            />
          </ReviewDetails>
          <ReviewDetails
            preferenceId="click-offset"
            label={translate('gallery.videoReview.clickPosition')}
          >
            {number('offset', 'gallery.videoReview.clickOffset', 1000)}
            {number('x', 'gallery.videoReview.clickX', 100, '%')}
            {number('y', 'gallery.videoReview.clickY', 100, '%')}
          </ReviewDetails>
        </>
      ) : null}
      <ReviewButton
        className={reviewTextButtonClassName}
        label={translate('gallery.videoReview.clickReset')}
        onClick={() => props.onChange(null)}
      />
    </div>
  );
}
