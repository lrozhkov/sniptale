import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ColorField, SelectField, NumericRow } from '../../ui/compact-inspector-controls';
import { translate } from '../../platform/i18n';
import type {
  QuickEditBorder,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { clampQuickEditSpotlightArea } from '../../features/video/review/advanced/focus';
import type { ReviewNumberRow } from './number-row';
import { ReviewDetails, reviewSelectFieldClassName } from './controls';

// Override inspector wrapping for long motion labels while retaining the shared overflow tooltip.
const borderAnimationSelectClassName =
  '[&_.truncate]:whitespace-nowrap! [&_.truncate]:overflow-hidden! [&_.truncate]:text-ellipsis!';

/** Source geometry and stroke appearance share the selected effect's draft owner. */
export function ReviewBorderInspector(props: {
  value: QuickEditBorder;
  onChange(value: QuickEditBorder): void;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
}) {
  const { value, onChange } = props;
  return (
    <div className="space-y-3">
      <ColorField
        label={translate('gallery.videoReview.borderColor')}
        title={translate('gallery.videoReview.borderColor')}
        value={value.color}
        onChange={(color) => onChange({ ...value, color })}
        onPreviewChange={(color) => props.onPreview?.({ border: { ...value, color } })}
        onPreviewReset={() => props.onPreview?.(null)}
      />
      <BorderNumberRow
        label={translate('gallery.videoReview.borderWidth')}
        min={1}
        max={24}
        step={1}
        precision={1}
        unit="px"
        value={value.width}
        onPreview={(width) =>
          props.onPreview?.(width === null ? null : { border: { ...value, width } })
        }
        onChange={(width) => onChange({ ...value, width })}
      />
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.borderStyle')}
        value={value.style}
        options={(['solid', 'dashed', 'dotted'] as const).map((style) => ({
          value: style,
          label: translate(`gallery.videoReview.borderStyle_${style}`),
        }))}
        onChange={(style: QuickEditBorder['style']) =>
          onChange({
            ...value,
            style,
            loop:
              value.loop &&
              (style !== 'solid' || value.motion === 'pulse' || value.motion === 'ripple'),
          })
        }
      />
      <BorderNumberRow
        label={translate('gallery.videoReview.focusRoundness')}
        min={0}
        max={50}
        step={1}
        precision={0}
        unit="%"
        value={value.roundness * 100}
        onPreview={(roundness) =>
          props.onPreview?.(
            roundness === null ? null : { border: { ...value, roundness: roundness / 100 } }
          )
        }
        onChange={(roundness) => onChange({ ...value, roundness: roundness / 100 })}
      />
      <ReviewDetails
        preferenceId="gallery.videoReview.borderPreciseArea"
        label={translate('gallery.videoReview.preciseArea')}
      >
        {(
          [
            ['x', 'focusAreaX'],
            ['y', 'focusAreaY'],
            ['width', 'focusAreaWidth'],
            ['height', 'focusAreaHeight'],
          ] as const
        ).map(([field, label]) => (
          <BorderNumberRow
            key={field}
            label={translate(`gallery.videoReview.${label}`)}
            min={field === 'x' || field === 'y' ? 0 : 1}
            max={100}
            step={1}
            precision={1}
            unit="%"
            value={value.area[field] * 100}
            onPreview={(next) =>
              props.onPreview?.(
                next === null
                  ? null
                  : {
                      border: {
                        ...value,
                        area: clampQuickEditSpotlightArea({ ...value.area, [field]: next / 100 }),
                      },
                    }
              )
            }
            onChange={(next) =>
              onChange({
                ...value,
                area: clampQuickEditSpotlightArea({ ...value.area, [field]: next / 100 }),
              })
            }
          />
        ))}
      </ReviewDetails>
    </div>
  );
}

/** Entrance and exit use the existing coupled phase clocks. */
export function ReviewBorderAnimation(props: {
  region: QuickEditZoomRegion;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
  onChange(patch: QuickEditZoomRegionPatch): void;
}) {
  const { region, onChange } = props;
  const border = region.border!;
  const interval = region.sourceAnchor ?? region;
  return (
    <div className="review-inspector-columns">
      {(['enter', 'hold', 'exit'] as const).map((phase) => {
        if (phase === 'hold')
          return (
            <fieldset key={phase} className="review-inspector-phase min-w-0 space-y-2">
              <legend>{translate('gallery.videoReview.borderHold')}</legend>
              <BorderHold border={border} onChange={onChange} onPreview={props.onPreview} />
            </fieldset>
          );
        const clock = region[phase];
        const reveal = phase === 'enter' ? border.reveal : border.exitReveal;
        return (
          <fieldset key={phase} className="review-inspector-phase min-w-0 space-y-2">
            <legend>
              {translate(
                phase === 'enter'
                  ? 'gallery.videoReview.zoomTransitionIn'
                  : 'gallery.videoReview.zoomTransitionOut'
              )}
            </legend>
            <SelectField
              className={reviewSelectFieldClassName}
              selectClassName={borderAnimationSelectClassName}
              label={translate('gallery.videoReview.focusReveal')}
              value={clock.type === 'none' ? 'none' : reveal}
              options={[
                {
                  value: 'none',
                  label: translate(
                    phase === 'enter'
                      ? 'gallery.videoReview.borderAppear'
                      : 'gallery.videoReview.borderDisappear'
                  ),
                },
                { value: 'fade', label: translate('gallery.videoReview.focusFade') },
                {
                  value: phase === 'enter' ? 'draw' : 'erase',
                  label: translate(
                    phase === 'enter'
                      ? 'gallery.videoReview.borderDraw'
                      : 'gallery.videoReview.borderErase'
                  ),
                },
                {
                  value: phase === 'enter' ? 'draw-ccw' : 'erase-ccw',
                  label: translate(
                    phase === 'enter'
                      ? 'gallery.videoReview.borderDrawCounterclockwise'
                      : 'gallery.videoReview.borderEraseCounterclockwise'
                  ),
                },
              ]}
              onChange={(value) =>
                onChange({
                  [phase]: { ...clock, type: value === 'none' ? 'none' : 'ease-in-out' },
                  border: {
                    ...border,
                    [phase === 'enter' ? 'reveal' : 'exitReveal']:
                      value === 'none' ? reveal : value,
                  },
                })
              }
            />
            <BorderNumberRow
              label={translate('gallery.videoReview.zoomTransitionDuration')}
              min={0}
              max={Math.min(
                60,
                Math.max(
                  0,
                  interval.end -
                    interval.start -
                    region[phase === 'enter' ? 'exit' : 'enter'].duration
                )
              )}
              unit="s"
              step={0.1}
              precision={2}
              scrubStep={0.01}
              disabled={clock.type === 'none'}
              value={clock.duration}
              onPreview={(duration) =>
                props.onPreview?.(duration === null ? null : { [phase]: { ...clock, duration } })
              }
              onChange={(duration) => onChange({ [phase]: { ...clock, duration } })}
            />
          </fieldset>
        );
      })}
    </div>
  );
}

/** Hold uses the persisted period as its single clock; the inspector exposes a speed multiplier. */
function BorderHold(props: {
  border: QuickEditBorder;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
}) {
  const { border, onChange } = props;
  const rotating = border.motion === 'clockwise' || border.motion === 'counterclockwise';
  const moving = border.loop && (!rotating || border.style !== 'solid');
  return (
    <>
      <SelectField<QuickEditBorder['motion'] | 'still'>
        className={reviewSelectFieldClassName}
        selectClassName={borderAnimationSelectClassName}
        label={translate('gallery.videoReview.focusReveal')}
        value={moving ? border.motion : 'still'}
        options={[
          { value: 'still', label: translate('gallery.videoReview.borderStill') },
          ...(border.style === 'solid'
            ? []
            : [
                {
                  value: 'clockwise' as const,
                  label: translate('gallery.videoReview.borderRotateClockwise'),
                },
                {
                  value: 'counterclockwise' as const,
                  label: translate('gallery.videoReview.borderRotateCounterclockwise'),
                },
              ]),
          { value: 'pulse', label: translate('gallery.videoReview.borderPulse') },
          { value: 'ripple', label: translate('gallery.videoReview.borderRipple') },
        ]}
        onChange={(value) =>
          onChange({
            border: {
              ...border,
              loop: value !== 'still',
              motion: value === 'still' ? border.motion : value,
            },
          })
        }
      />
      {moving ? (
        <>
          {rotating ? (
            <BorderNumberRow
              label={translate('gallery.videoReview.borderSegmentPercent')}
              min={1}
              max={100}
              step={1}
              precision={0}
              unit="%"
              value={border.segmentPercent}
              onPreview={(segmentPercent) =>
                props.onPreview?.(
                  segmentPercent === null ? null : { border: { ...border, segmentPercent } }
                )
              }
              onChange={(segmentPercent) => onChange({ border: { ...border, segmentPercent } })}
            />
          ) : null}
          <BorderNumberRow
            label={translate('gallery.videoReview.borderSpeed')}
            title={translate(
              border.motion === 'ripple'
                ? 'gallery.videoReview.borderRippleSpeedHint'
                : border.motion === 'pulse'
                  ? 'gallery.videoReview.borderPulseSpeedHint'
                  : 'gallery.videoReview.borderRotationSpeedHint'
            )}
            min={0.1}
            max={4}
            step={0.1}
            precision={1}
            unit="x"
            value={2 / border.period}
            onPreview={(speed) =>
              props.onPreview?.(
                speed === null ? null : { border: { ...border, period: 2 / speed } }
              )
            }
            onChange={(speed) => onChange({ border: { ...border, period: 2 / speed } })}
          />
        </>
      ) : null}
    </>
  );
}

/** A numeric gesture previews locally and commits once; cancellation clears the effect draft. */
function BorderNumberRow(
  props: ComponentProps<typeof ReviewNumberRow> & {
    onPreview?(value: number | null): void;
    title?: string;
  }
) {
  const [draft, setDraft] = useState(props.value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(props.value), [props.value]);
  const cancel = () => {
    cancelled.current = true;
    setDraft(props.value);
    props.onPreview?.(null);
  };
  return (
    <div
      title={props.title}
      onPointerDownCapture={() => {
        cancelled.current = false;
      }}
      onPointerCancelCapture={cancel}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') {
          cancel();
          event.preventDefault();
          event.stopPropagation();
        } else cancelled.current = false;
      }}
    >
      <NumericRow
        appearance="plain"
        focusAppearance="accent-box"
        className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
        label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        precision={props.precision}
        unit={props.unit}
        value={draft}
        disabled={props.disabled}
        scrub={{
          min: props.min,
          max: props.scrubMax ?? props.max,
          step: props.scrubStep ?? props.step,
        }}
        onPreviewValue={(value) => {
          if (!cancelled.current) {
            setDraft(value);
            props.onPreview?.(value);
          }
        }}
        onCommitValue={(value) => {
          if (cancelled.current) return;
          setDraft(value);
          props.onPreview?.(null);
          if (value !== props.value) props.onChange(value);
        }}
      />
    </div>
  );
}
