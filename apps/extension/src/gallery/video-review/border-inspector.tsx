import { ReviewFocusRoundness, ReviewFocusAreaFields } from './focus-area-fields';
import { RotateCw, RotateCcw } from 'lucide-react';
import { ColorField, SegmentedRow, SelectField } from '../../ui/compact-inspector-controls';
import { translate } from '../../platform/i18n';
import type {
  QuickEditBorder,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';

import { ReviewPreviewNumberRow } from './number-row';
import { ReviewDetails, reviewSelectFieldClassName } from './controls';

/** Source geometry and stroke appearance share the selected effect's draft owner. */
export function ReviewBorderInspector(props: {
  value: QuickEditBorder;
  onChange(value: QuickEditBorder): void;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
}) {
  const { value, onChange } = props;
  return (
    <div className="sniptale-parameter-stack">
      <ColorField
        label={translate('gallery.videoReview.borderColor')}
        title={translate('gallery.videoReview.borderColor')}
        value={value.color}
        onChange={(color) => onChange({ ...value, color })}
        onPreviewChange={(color) => props.onPreview?.({ border: { ...value, color } })}
        onPreviewReset={() => props.onPreview?.(null)}
      />
      <ReviewPreviewNumberRow
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
      <ReviewFocusRoundness
        value={value.roundness}
        onPreview={(roundness) =>
          props.onPreview?.(roundness === null ? null : { border: { ...value, roundness } })
        }
        onChange={(roundness) => onChange({ ...value, roundness })}
      />
      <ReviewDetails
        preferenceId="gallery.videoReview.borderPreciseArea"
        label={translate('gallery.videoReview.preciseArea')}
      >
        <ReviewFocusAreaFields
          area={value.area}
          onPreview={(area) =>
            props.onPreview?.(area === null ? null : { border: { ...value, area } })
          }
          onChange={(area) => onChange({ ...value, area })}
        />
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
        const label = translate(
          phase === 'hold'
            ? 'gallery.videoReview.borderHold'
            : phase === 'enter'
              ? 'gallery.videoReview.zoomTransitionIn'
              : 'gallery.videoReview.zoomTransitionOut'
        );
        if (phase === 'hold')
          return (
            <ReviewDetails
              key={phase}
              preferenceId="gallery.videoReview.border.hold"
              label={label}
              initiallyOpen
            >
              <fieldset aria-label={label} className="review-inspector-phase min-w-0 space-y-2">
                <BorderHold border={border} onChange={onChange} onPreview={props.onPreview} />
              </fieldset>
            </ReviewDetails>
          );
        const clock = region[phase];
        const reveal = phase === 'enter' ? border.reveal : border.exitReveal;
        return (
          <ReviewDetails
            key={phase}
            preferenceId={`gallery.videoReview.border.${phase}`}
            label={label}
            initiallyOpen
          >
            <fieldset aria-label={label} className="review-inspector-phase min-w-0 space-y-2">
              <SegmentedRow<'none' | 'fade' | 'draw'>
                columns={3}
                layout="stacked"
                ariaLabel={translate('gallery.videoReview.focusReveal')}
                label={translate('gallery.videoReview.focusReveal')}
                value={clock.type === 'none' ? 'none' : reveal === 'fade' ? 'fade' : 'draw'}
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
                    value: 'draw',
                    label: translate(
                      phase === 'enter'
                        ? 'gallery.videoReview.borderDrawing'
                        : 'gallery.videoReview.borderErasing'
                    ),
                  },
                ]}
                onChange={(value) =>
                  onChange({
                    [phase]: { ...clock, type: value === 'none' ? 'none' : 'ease-in-out' },
                    border: {
                      ...border,
                      [phase === 'enter' ? 'reveal' : 'exitReveal']:
                        value === 'none'
                          ? reveal
                          : value === 'fade'
                            ? 'fade'
                            : phase === 'enter'
                              ? reveal.endsWith('-ccw')
                                ? 'draw-ccw'
                                : 'draw'
                              : reveal.endsWith('-ccw')
                                ? 'erase-ccw'
                                : 'erase',
                    },
                  })
                }
              />
              {clock.type !== 'none' && reveal !== 'fade' ? (
                <BorderDirection
                  counterclockwise={reveal.endsWith('-ccw')}
                  onChange={(counterclockwise) =>
                    onChange({
                      border: {
                        ...border,
                        [phase === 'enter' ? 'reveal' : 'exitReveal']:
                          phase === 'enter'
                            ? counterclockwise
                              ? 'draw-ccw'
                              : 'draw'
                            : counterclockwise
                              ? 'erase-ccw'
                              : 'erase',
                      },
                    })
                  }
                />
              ) : null}
              <ReviewPreviewNumberRow
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
          </ReviewDetails>
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
      <SegmentedRow<'still' | 'rotate' | 'pulse' | 'ripple'>
        columns={border.style === 'solid' ? 3 : 4}
        layout="stacked"
        ariaLabel={translate('gallery.videoReview.focusReveal')}
        label={translate('gallery.videoReview.focusReveal')}
        value={
          moving
            ? border.motion === 'pulse'
              ? 'pulse'
              : border.motion === 'ripple'
                ? 'ripple'
                : 'rotate'
            : 'still'
        }
        options={[
          { value: 'still', label: translate('gallery.videoReview.borderStill') },
          ...(border.style === 'solid'
            ? []
            : [
                {
                  value: 'rotate' as const,
                  label: translate('gallery.videoReview.borderRotation'),
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
              motion:
                value === 'still'
                  ? border.motion
                  : value === 'rotate'
                    ? border.motion === 'counterclockwise'
                      ? 'counterclockwise'
                      : 'clockwise'
                    : value,
            },
          })
        }
      />
      {moving && rotating ? (
        <BorderDirection
          counterclockwise={border.motion === 'counterclockwise'}
          onChange={(counterclockwise) =>
            onChange({
              border: { ...border, motion: counterclockwise ? 'counterclockwise' : 'clockwise' },
            })
          }
        />
      ) : null}
      {moving ? (
        <>
          {rotating ? (
            <ReviewPreviewNumberRow
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
          <ReviewPreviewNumberRow
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

function BorderDirection(props: { counterclockwise: boolean; onChange(value: boolean): void }) {
  return (
    <SegmentedRow
      columns={2}
      layout="inline"
      ariaLabel={translate('gallery.videoReview.borderDirection')}
      label={translate('gallery.videoReview.borderDirection')}
      value={props.counterclockwise ? 'counterclockwise' : 'clockwise'}
      options={[
        {
          value: 'clockwise',
          label: translate('gallery.videoReview.borderClockwise'),
          icon: <RotateCw size={16} aria-hidden="true" />,
        },
        {
          value: 'counterclockwise',
          label: translate('gallery.videoReview.borderCounterclockwise'),
          icon: <RotateCcw size={16} aria-hidden="true" />,
        },
      ]}
      onChange={(value) => props.onChange(value === 'counterclockwise')}
    />
  );
}
