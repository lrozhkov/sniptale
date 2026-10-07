import { isReviewKey } from '../../features/video/review/key-animation';
import {
  REVIEW_KEY_DEFAULT,
  type ReviewKeyAnimation,
  type ReviewKeyPatch,
} from '../../features/video/review/advanced/key-animation';
import { ReviewKeyFields } from './key-animation-fields';
import { isReviewClick } from '../../features/video/review/click-animation';
import {
  REVIEW_CLICK_DEFAULT,
  type ReviewClickAnimation,
  type ReviewClickStyle,
} from '../../features/video/review/advanced/click-animation';
import { ReviewClickFields } from './click-animation-fields';
import { reviewTimeLabel } from './controls';
import { ArrowLeft, Focus, Gauge, Scissors } from 'lucide-react';
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
  keyAnimations?: readonly ReviewKeyAnimation[] | undefined;
  onKeyAnimation?: ((ids: readonly string[], patch: ReviewKeyPatch | null) => void) | undefined;
  animations?: readonly ReviewClickAnimation[] | undefined;
  onOpenHistory?: (() => void) | undefined;
  onClickAnimation?:
    | ((ids: readonly string[], patch: Partial<ReviewClickStyle> | null) => void)
    | undefined;
  onEdit(kind: 'cut' | 'speed'): void;
  onFocus(): void;
}) {
  const { marker, plan } = props;
  if (!marker || !plan) return null;
  return (
    <div className="space-y-3 text-xs" data-ui="gallery.videoReview.actionProperties">
      {props.onOpenHistory ? (
        <ReviewButton
          className={reviewTextButtonClassName}
          label={translate('gallery.videoReview.historyBack')}
          onClick={props.onOpenHistory}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {translate('gallery.videoReview.historyBack')}
        </ReviewButton>
      ) : null}
      {isReviewClick(marker) || isReviewKey(marker) || marker.end <= marker.start ? (
        <div className="flex min-h-8 items-center justify-between gap-2 text-xs tabular-nums">
          <span className="font-medium text-[var(--sniptale-color-text-secondary)]">
            {translate('gallery.videoReview.clickRecordedAt')}
          </span>
          <span>{reviewTimeLabel(marker.start)}</span>
        </div>
      ) : (
        <ReviewInterval start={marker.start} end={marker.end} />
      )}
      {isReviewClick(marker) ? (
        marker.focusPoint ? (
          <ReviewClickFields
            values={[
              props.animations?.find((item) => item.id === marker.ref.id) ?? REVIEW_CLICK_DEFAULT,
            ]}
            onChange={(patch) => props.onClickAnimation?.([marker.ref.id], patch)}
          />
        ) : (
          <p role="status">{translate('gallery.videoReview.clickNoPoint')}</p>
        )
      ) : null}
      {isReviewKey(marker) ? (
        <ReviewKeyFields
          values={[
            props.keyAnimations?.find((item) => item.id === marker.ref.id) ?? REVIEW_KEY_DEFAULT,
          ]}
          onChange={(patch) => props.onKeyAnimation?.([marker.ref.id], patch)}
        />
      ) : null}
      {marker.target ? (
        <p className="break-words text-[var(--sniptale-color-text-secondary)]">{marker.target}</p>
      ) : null}
      {!isReviewClick(marker) &&
      !isReviewKey(marker) &&
      marker.end > marker.start &&
      !plan.removed ? (
        <ReviewActionShortcuts
          plan={plan}
          busy={props.busy}
          onEdit={props.onEdit}
          onFocus={props.onFocus}
        />
      ) : plan.removed ? (
        <p className="text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.actionRemoved')}
        </p>
      ) : null}
    </div>
  );
}

/** Interval editing stays separate from point-action presentation. */
function ReviewActionShortcuts(props: {
  plan: Plan;
  busy: boolean;
  onEdit(kind: 'cut' | 'speed'): void;
  onFocus(): void;
}) {
  const { plan } = props;
  return (
    <div className="space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-3">
      {plan.contextual ? (
        <p className="text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.actionContextInterval')}
        </p>
      ) : null}
      {plan.contextual ? <ReviewInterval start={plan.range.start} end={plan.range.end} /> : null}
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
  );
}
