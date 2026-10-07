import { normalizePaintColor } from '@sniptale/foundation/paint';
import { useEffect, useState } from 'react';
import {
  ColorField,
  NumericRow,
  SelectField,
  type NumericRowProps,
} from '../../ui/compact-inspector-controls';
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

// Slider limits are deliberately narrower than the persisted/manual-input bounds.
const CLICK_SCRUB = {
  radius: [2, 80, 1],
  stroke: [0.5, 8, 0.5],
  opacity: [0, 1, 0.01],
  before: [0, 0.5, 0.01],
  after: [0.05, 1.5, 0.01],
  offset: [-0.25, 0.25, 0.01],
  x: [-0.1, 0.1, 0.001],
  y: [-0.1, 0.1, 0.001],
  pulses: [1, 5, 1],
} as const;

/** Keep a drag local until release; batch editing must not write history for every tick. */
function ClickNumberRow(props: Omit<NumericRowProps, 'onPreviewValue'>) {
  const [draft, setDraft] = useState<number>();
  useEffect(() => setDraft(undefined), [props.value]);
  return (
    <NumericRow
      {...props}
      enterBehavior="blur"
      value={draft ?? props.value}
      onPreviewValue={setDraft}
      onCommitValue={(value) => {
        setDraft(undefined);
        props.onCommitValue(value);
      }}
    />
  );
}

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
  // Legacy projects keep their multiplier until the color is explicitly edited.
  const colors = props.values.map((style) => {
    const color = normalizePaintColor(style.color)!;
    const alpha = Math.round(parseInt(color.slice(7, 9), 16) * style.opacity);
    return `${color.slice(0, 7)}${alpha.toString(16).padStart(2, '0')}`;
  });
  const color = colors.every((value) => value === colors[0]) ? colors[0] : undefined;
  const number = (
    key: keyof typeof REVIEW_CLICK_BOUNDS,
    label: Parameters<typeof translate>[0],
    factor = 1,
    unit: '%' | 'px' | '' = ''
  ) => {
    const value = common(key);
    const [min, max] = REVIEW_CLICK_BOUNDS[key];
    const [scrubMin, scrubMax, scrubStep] = CLICK_SCRUB[key];
    return (
      <ClickNumberRow
        key={key}
        appearance="plain"
        focusAppearance="accent-box"
        className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
        label={translate(label)}
        value={value === null ? null : value * factor}
        min={min * factor}
        max={max * factor}
        step={key === 'stroke' ? 0.5 : key === 'x' || key === 'y' ? 0.1 : 1}
        precision={key === 'stroke' || key === 'x' || key === 'y' ? 1 : 0}
        unit={unit}
        scrub={{ min: scrubMin * factor, max: scrubMax * factor, step: scrubStep * factor }}
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
            {color === undefined ? (
              <p className="text-xs text-[var(--sniptale-color-text-muted)]">
                {translate('gallery.videoReview.clickMixed')}
              </p>
            ) : null}
            <ColorField
              label={translate('gallery.videoReview.clickColor')}
              title={translate('gallery.videoReview.clickColor')}
              value={color ?? '#ffffff'}
              onChange={(color) => props.onChange({ color, opacity: 1 })}
            />
            {number('radius', 'gallery.videoReview.clickRadius', 1, 'px')}
            {props.values.some((value) => value.effect === 'ripple')
              ? number('stroke', 'gallery.videoReview.clickStroke', 1, 'px')
              : null}
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
