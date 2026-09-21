import { Focus, Gauge, Scissors } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import type { planReviewActionEdits } from '../../features/video/review/action-edits';
import { ReviewButton, ReviewInterval, reviewTextButtonClassName } from './controls';

type Plan = ReturnType<typeof planReviewActionEdits>;
const reasonKeys = {
  loading: 'gallery.videoReview.actionIndexPending',
  overlap: 'gallery.videoReview.actionEditOverlap',
  range: 'gallery.videoReview.actionRangeUnavailable',
  removed: 'gallery.videoReview.actionCutOverlap',
  'focus-overlap': 'gallery.videoReview.actionFocusOverlap',
} as const;

/** Recorded facts stay immutable; shortcuts create separately selected authored elements. */
export function ReviewActionProperties(props: {
  marker: ReviewTelemetryMarker | undefined;
  plan: Plan | null;
  busy: boolean;
  onEdit(kind: 'cut' | 'speed'): void;
  onFocus(): void;
}) {
  const { marker, plan } = props;
  if (!marker || !plan) return null;
  return (
    <div className="space-y-3 text-xs" data-ui="gallery.videoReview.actionProperties">
      <ReviewInterval start={marker.start} end={marker.end} />
      {marker.target ? (
        <p className="break-words text-[var(--sniptale-color-text-secondary)]">{marker.target}</p>
      ) : null}
      {!plan.removed ? (
        <div className="space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-3">
          {plan.contextual ? (
            <p className="text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.videoReview.actionContextInterval')}
            </p>
          ) : null}
          {plan.contextual ? (
            <ReviewInterval start={plan.range.start} end={plan.range.end} />
          ) : null}
          {(
            [
              {
                kind: 'cut',
                label: 'gallery.videoReview.actionCut',
                icon: Scissors,
                ready: !!plan.cut,
                reason: plan.editReason,
                run: () => props.onEdit('cut'),
              },
              {
                kind: 'speed',
                label: 'gallery.videoReview.actionSpeed',
                icon: Gauge,
                ready: !!plan.speed,
                reason: plan.editReason,
                run: () => props.onEdit('speed'),
              },
              {
                kind: 'focus',
                label: 'gallery.videoReview.actionFocus',
                icon: Focus,
                ready: !!plan.focus,
                reason: plan.focusReason,
                run: props.onFocus,
              },
            ] as const
          ).map(({ kind, label, icon: Icon, ready, reason, run }) => (
            <div key={kind}>
              <ReviewButton
                label={translate(label)}
                disabled={props.busy || !ready}
                className={`${reviewTextButtonClassName} !w-full justify-start`}
                onClick={run}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{translate(label)}</span>
              </ReviewButton>
              {!ready ? (
                <p className="px-2 text-[var(--sniptale-color-text-muted)]">
                  {translate(reasonKeys[reason])}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.actionRemoved')}
        </p>
      )}
    </div>
  );
}
