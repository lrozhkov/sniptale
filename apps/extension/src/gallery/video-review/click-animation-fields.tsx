import { reviewGestureAreaBounds } from '../../features/video/project/action-feedback/validation';
import { reviewInformationSections } from './inspector-sections';
import { MousePointer2, Palette, Clock3, Move, RotateCcw } from 'lucide-react';
import { reviewInspectorActions, ReviewInspectorSections } from './inspector-sections';
import { normalizePaintColor } from '@sniptale/foundation/paint';
import { useEffect, useState, type ReactNode } from 'react';
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
  ReviewDetails,
  ReviewButton,
  reviewSelectFieldClassName,
  reviewTextButtonClassName,
} from './controls';

// Slider limits are deliberately narrower than the persisted/manual-input bounds.
const CLICK_BOUNDS = {
  ...REVIEW_CLICK_BOUNDS,
  magnification: [1, 3],
  lensShadow: [0, 100],
} as const;
const CLICK_SCRUB = {
  magnification: [1, 2.5, 0.1],
  lensShadow: [0, 50, 1],
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
export function ReviewClickFields(props: Parameters<typeof reviewClickSections>[0]) {
  return (
    <div className="min-w-0" data-ui="gallery.videoReview.clickFields">
      <ReviewInspectorSections sections={reviewClickSections(props)} />
    </div>
  );
}

export function reviewClickSections(props: {
  information?: ReactNode;
  gesture?: boolean;
  extraSections?: Parameters<typeof ReviewInspectorSections>[0]['sections'];
  values: readonly ReviewClickStyle[];
  onChange(patch: Partial<ReviewClickStyle> | null): void;
}) {
  const { magnify: inferredMagnify, common, color } = clickFieldValues(props.values);
  const magnify = !props.gesture && inferredMagnify;
  const number = (
    key: keyof typeof CLICK_BOUNDS,
    label: Parameters<typeof translate>[0],
    factor = 1,
    unit: '%' | 'px' | 'x' | '' = ''
  ) => {
    return (
      <ClickSettingNumber
        field={key}
        value={common(key)}
        label={label}
        factor={factor}
        unit={unit}
        magnify={magnify}
        onChange={props.onChange}
      />
    );
  };
  const sections = reviewInformationSections(props.information);
  sections.push({
    id: 'animation',
    label: translate('gallery.videoReview.clickEffect'),
    icon: MousePointer2,
    content: <ClickAnimation props={props} common={common} />,
  });
  if (common('effect') !== 'off')
    sections.push(
      {
        id: 'appearance',
        label: translate('gallery.videoReview.clickAppearance'),
        icon: Palette,
        content: (
          <ClickAppearance
            magnify={magnify}
            color={color}
            lensShape={common('lensShape')}
            stroke={
              props.gesture
                ? common('gestureAppearance') === 'path' || common('gestureAppearance') === 'area'
                : props.values.some(
                    (value) => value.effect === 'ripple' || value.effect === 'magnify'
                  )
            }
            number={number}
            onChange={props.onChange}
          />
        ),
      },
      {
        id: 'timing',
        label: translate('gallery.videoReview.clickTiming'),
        icon: Clock3,
        content: (
          <ClickTiming
            magnify={magnify}
            easing={common('easing')}
            number={number}
            onChange={props.onChange}
          />
        ),
      },
      {
        id: 'position',
        label: translate('gallery.videoReview.clickPosition'),
        icon: Move,
        content: (
          <>
            {number('x', 'gallery.videoReview.clickX', 100, '%')}
            {number('y', 'gallery.videoReview.clickY', 100, '%')}
          </>
        ),
      }
    );
  if (props.extraSections) sections.push(...props.extraSections);
  sections.push(
    reviewInspectorActions(
      <>
        <ReviewButton
          className={`${reviewTextButtonClassName} !w-full justify-start`}
          label={translate('gallery.videoReview.clickReset')}
          onClick={() => props.onChange(null)}
        >
          <RotateCcw size={15} aria-hidden="true" />
          {translate('gallery.videoReview.clickReset')}
        </ReviewButton>
      </>
    )
  );
  return props.gesture
    ? sections.filter((section) => section.id !== 'timing' && section.id !== 'position')
    : sections;
}

/** Temporal fields retain their source-time units and per-property commit behavior. */
function ClickTiming({
  magnify,
  easing,
  number,
  onChange,
}: {
  magnify: boolean;
  easing: ReviewClickStyle['easing'] | null;
  onChange: Parameters<typeof reviewClickSections>[0]['onChange'];
  number: Parameters<typeof ClickAppearance>[0]['number'];
}) {
  return (
    <>
      {number('before', 'gallery.videoReview.clickBefore', 1000)}
      {number('after', 'gallery.videoReview.clickAfter', 1000)}
      {!magnify ? number('pulses', 'gallery.videoReview.clickPulses') : null}
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.clickEasing')}
        value={easing ?? ''}

        options={(['linear', 'ease-out', 'ease-in-out'] as const).map((value) => ({
          value,
          label: translate(`gallery.videoReview.click_${value}`),
        }))}
        onChange={(easing: ReviewClickStyle['easing']) => onChange({ easing })}
      />
      {easing === null ? (
        <p className="text-right text-xs italic text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.clickMixed')}
        </p>
      ) : null}
      {number('offset', 'gallery.videoReview.clickOffset', 1000)}
    </>
  );
}

/** Mixed state and legacy opacity resolve once for both single-event and batch surfaces. */
function clickFieldValues(styles: readonly ReviewClickStyle[]) {
  const values = styles.map((value) => ({
    magnification: 1.6,
    lensShadow: 20,
    lensShape: 'circle' as const,
    ...value,
  }));
  const magnify = values.every((value) => value.effect === 'magnify');
  const common = <K extends keyof ReviewClickStyle>(key: K): ReviewClickStyle[K] | null => {
    const first = values[0]?.[key];
    return first !== undefined && values.every((value) => value[key] === first) ? first : null;
  };
  // Legacy projects keep their multiplier until the color is explicitly edited.
  const colors = styles.map((style) => {
    const color = normalizePaintColor(style.color)!;
    const alpha = Math.round(parseInt(color.slice(7, 9), 16) * style.opacity);
    return `${color.slice(0, 7)}${alpha.toString(16).padStart(2, '0')}`;
  });
  const color = colors.every((value) => value === colors[0]) ? colors[0] : undefined;
  return { magnify, common, color };
}

/** Lens and cue appearance change independently of section navigation and timing. */
function ClickAppearance({
  magnify,
  color,
  lensShape,
  stroke,
  number,
  onChange,
}: {
  magnify: boolean;
  color: string | undefined;
  lensShape: ReviewClickStyle['lensShape'] | null;
  stroke: boolean;
  onChange: Parameters<typeof reviewClickSections>[0]['onChange'];
  number(
    key: keyof typeof CLICK_BOUNDS,
    label: Parameters<typeof translate>[0],
    factor?: number,
    unit?: '%' | 'px' | 'x' | ''
  ): ReactNode;
}) {
  return (
    <>
      {magnify ? (
        <>
          {number('magnification', 'gallery.videoReview.clickMagnification', 1, 'x')}
          <SelectField
            className={reviewSelectFieldClassName}
            label={translate('gallery.videoReview.clickLensShape')}
            value={lensShape ?? ''}

            options={(['circle', 'rounded'] as const).map((value) => ({
              value,
              label: translate(`gallery.videoReview.clickLens_${value}`),
            }))}
            onChange={(lensShape: 'circle' | 'rounded') => onChange({ lensShape })}
          />
          {lensShape === null ? (
            <p className="text-right text-xs italic text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.videoReview.clickMixed')}
            </p>
          ) : null}
          {number('lensShadow', 'gallery.videoReview.clickLensShadow', 1, '%')}
        </>
      ) : null}
      {color === undefined ? (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.clickMixed')}
        </p>
      ) : null}
      <ColorField
        label={translate(
          magnify ? 'gallery.videoReview.clickLensBorder' : 'gallery.videoReview.clickColor'
        )}
        title={translate(
          magnify ? 'gallery.videoReview.clickLensBorder' : 'gallery.videoReview.clickColor'
        )}
        value={color ?? '#ffffff'}
        onChange={(color) => onChange({ color, opacity: 1 })}
      />
      {number('radius', 'gallery.videoReview.clickRadius', 1, 'px')}
      {stroke ? number('stroke', 'gallery.videoReview.clickStroke', 1, 'px') : null}
    </>
  );
}

/** Numeric policy is shared by single and batch click editing, including lens-only fields. */
function ClickSettingNumber(props: {
  field: keyof typeof CLICK_BOUNDS;
  value: number | null | undefined;
  label: Parameters<typeof translate>[0];
  factor: number;
  unit: '%' | 'px' | 'x' | '';
  magnify: boolean;
  onChange(patch: Partial<ReviewClickStyle> | null): void;
}) {
  const { field: key, value, label, factor, unit, magnify } = props;
  const [min, max] = CLICK_BOUNDS[key];
  const [scrubMin, scrubMax, scrubStep] =
    key === 'radius' && magnify ? [20, 160, 1] : CLICK_SCRUB[key];
  return (
    <>
      <ClickNumberRow
        key={key}
        appearance="plain"
        focusAppearance="accent-box"
        className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
        label={translate(label)}
        value={value === null || value === undefined ? null : value * factor}
        min={min * factor}
        max={max * factor}
        step={
          key === 'magnification'
            ? 0.1
            : key === 'stroke'
              ? 0.5
              : key === 'x' || key === 'y'
                ? 0.1
                : 1
        }
        precision={
          key === 'magnification' || key === 'stroke' || key === 'x' || key === 'y' ? 1 : 0
        }
        unit={unit}
        scrub={{ min: scrubMin * factor, max: scrubMax * factor, step: scrubStep * factor }}
        onCommitValue={(next) => props.onChange({ [key]: next / factor })}
      />
      {value === null || value === undefined ? (
        <p className="text-right text-xs italic text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.clickMixed')}
        </p>
      ) : null}
    </>
  );
}

function ClickAnimation({
  props,
  common,
}: {
  props: Parameters<typeof reviewClickSections>[0];
  common: ReturnType<typeof clickFieldValues>['common'];
}) {
  return (
    <>
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.clickEffect')}
        value={
          props.gesture && common('effect') !== null
            ? common('effect') === 'off'
              ? 'off'
              : 'press'
            : (common('effect') ?? '')
        }

        options={(props.gesture
          ? (['off', 'press'] as const)
          : (['off', 'ripple', 'press', 'glow', 'magnify'] as const)
        ).map((value) => ({
          value,
          label: translate(`gallery.videoReview.click_${value}`),
        }))}
        onChange={(effect: ReviewClickStyle['effect']) =>
          props.onChange(
            effect === 'magnify'
              ? { effect, radius: 100, before: 0.45, after: 0.6, easing: 'ease-in-out' }
              : { effect }
          )
        }
      />
      {props.gesture ? (
        <>
          <SelectField
            className={reviewSelectFieldClassName}
            label={translate('gallery.videoReview.gestureAppearance')}
            value={common('gestureAppearance') ?? 'halo'}
            options={(['halo', 'path', 'area'] as const).map((value) => ({
              value,
              label: translate(`gallery.videoReview.gesture_${value}`),
            }))}
            onChange={(gestureAppearance: NonNullable<ReviewClickStyle['gestureAppearance']>) =>
              props.onChange({ gestureAppearance })
            }
          />
          {props.values.length === 1 &&
          common('gestureAppearance') === 'area' &&
          props.values[0]?.gestureArea ? (
            <ReviewDetails
              preferenceId="review-click:gesture-area"
              label={translate('gallery.videoReview.gestureAreaDetails')}
            >
              {(['x', 'y', 'width', 'height'] as const).map((key) => {
                const area = props.values[0]!.gestureArea!;
                const { min, max } = reviewGestureAreaBounds(area, key);
                return (
                  <ClickNumberRow
                    key={key}
                    appearance="plain"
                    focusAppearance="accent-box"
                    className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
                    label={translate(`gallery.videoReview.gestureArea_${key}`)}
                    value={area[key] * 100}
                    min={min}
                    max={max}
                    step={0.1}
                    precision={1}
                    unit="%"
                    scrub={{ min, max, step: 0.1 }}
                    onCommitValue={(value) =>
                      props.onChange({ gestureArea: { ...area, [key]: value / 100 } })
                    }
                  />
                );
              })}
            </ReviewDetails>
          ) : null}
        </>
      ) : null}
      {common('effect') === null ? (
        <p className="text-right text-xs italic text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.clickMixed')}
        </p>
      ) : null}
    </>
  );
}
