import { BorderHoldFields, BorderRevealFields } from '../../ui/focus-appearance/border';
import { PreviewNumericRow } from '../../ui/compact-inspector-controls/numeric-preview';
import { translate } from '../../platform/i18n';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { ReviewDetails } from './controls';

type BorderAnimationProps = {
  region: QuickEditZoomRegion;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
  onChange(patch: QuickEditZoomRegionPatch): void;
};
const PHASE_LABELS = {
  enter: 'gallery.videoReview.zoomTransitionIn',
  hold: 'gallery.videoReview.borderHold',
  exit: 'gallery.videoReview.zoomTransitionOut',
} as const;

/** Gallery retains coupled source durations while the fields share border appearance. */
export function ReviewBorderAnimation(props: BorderAnimationProps) {
  const border = props.region.border!;
  return (
    <div className="review-inspector-columns">
      {(['enter', 'hold', 'exit'] as const).map((phase) => {
        const label = translate(PHASE_LABELS[phase]);
        return (
          <ReviewDetails
            key={phase}
            preferenceId={`gallery.videoReview.border.${phase}`}
            label={label}
            initiallyOpen
          >
            <fieldset
              aria-label={label}
              className="review-inspector-phase min-w-0 sniptale-parameter-stack"
            >
              {phase === 'hold' ? (
                <BorderHoldFields
                  border={border}
                  onChange={(patch) =>
                    props.onChange({
                      border: { ...border, ...patch, area: { ...border.area, ...patch.area } },
                    })
                  }
                  onPreview={(patch) =>
                    props.onPreview?.(
                      patch
                        ? {
                            border: {
                              ...border,
                              ...patch,
                              area: { ...border.area, ...patch.area },
                            },
                          }
                        : null
                    )
                  }
                />
              ) : (
                <ReviewBorderPhaseFields {...props} phase={phase} />
              )}
            </fieldset>
          </ReviewDetails>
        );
      })}
    </div>
  );
}

function ReviewBorderPhaseFields({
  region,
  phase,
  onChange,
  onPreview,
}: BorderAnimationProps & { phase: 'enter' | 'exit' }) {
  const border = region.border!;
  const interval = region.sourceAnchor ?? region;
  const clock = region[phase];
  const key = phase === 'enter' ? 'reveal' : 'exitReveal';
  const reveal = border[key];
  return (
    <>
      <BorderRevealFields
        phase={phase}
        value={reveal}
        enabled={clock.type !== 'none'}
        onChange={(value) =>
          onChange({
            [phase]: { ...clock, type: value === 'none' ? 'none' : 'ease-in-out' },
            border: { ...border, [key]: value === 'none' ? reveal : value },
          })
        }
      />
      <PreviewNumericRow
        label={translate('gallery.videoReview.zoomTransitionDuration')}
        min={0}
        max={Math.min(
          60,
          Math.max(
            0,
            interval.end - interval.start - region[phase === 'enter' ? 'exit' : 'enter'].duration
          )
        )}
        unit="s"
        step={0.1}
        precision={2}
        scrubStep={0.01}
        disabled={clock.type === 'none'}
        value={clock.duration}
        onPreview={(duration) =>
          onPreview?.(duration === null ? null : { [phase]: { ...clock, duration } })
        }
        onChange={(duration) => onChange({ [phase]: { ...clock, duration } })}
      />
    </>
  );
}
