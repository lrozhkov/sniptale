import { reviewInspectorActions, ReviewInspectorSections } from './inspector-sections';
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
import { reviewTimeLabel, reviewEventLabel } from './controls';
import { ArrowLeft, Focus, Gauge, Scissors, Info } from 'lucide-react';
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
      {isReviewClick(marker) && marker.focusPoint ? (
        <ReviewClickFields
          information={<RecordedInformation marker={marker} />}
          values={[
            props.animations?.find((item) => item.id === marker.ref.id) ?? REVIEW_CLICK_DEFAULT,
          ]}
          onChange={(patch) => props.onClickAnimation?.([marker.ref.id], patch)}
        />
      ) : isReviewKey(marker) ? (
        <ReviewKeyFields
          information={<RecordedInformation marker={marker} />}
          values={[
            props.keyAnimations?.find((item) => item.id === marker.ref.id) ?? REVIEW_KEY_DEFAULT,
          ]}
          onChange={(patch) => props.onKeyAnimation?.([marker.ref.id], patch)}
        />
      ) : (
        <ReviewInspectorSections
          sections={[
            {
              id: 'information',
              label: translate('gallery.videoReview.actionInformation'),
              icon: Info,
              content: (
                <>
                  <RecordedInformation marker={marker} />
                  {isReviewClick(marker) ? (
                    <p role="status">{translate('gallery.videoReview.clickNoPoint')}</p>
                  ) : null}
                </>
              ),
            },
            ...(!isReviewClick(marker) && marker.end > marker.start && !plan.removed
              ? [
                  reviewInspectorActions(
                    <ReviewActionShortcuts
                      plan={plan}
                      busy={props.busy}
                      onEdit={props.onEdit}
                      onFocus={props.onFocus}
                    />
                  ),
                ]
              : []),
            ...(plan.removed
              ? [
                  reviewInspectorActions(
                    <p className="text-[var(--sniptale-color-text-muted)]">
                      {translate('gallery.videoReview.actionRemoved')}
                    </p>
                  ),
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}

/** Only existing, display-authorized recorded metadata is exposed; no editable field chrome. */
function RecordedInformation({ marker }: { marker: ReviewTelemetryMarker }) {
  const point = isReviewClick(marker) || isReviewKey(marker) || marker.end <= marker.start;
  const facts = [
    {
      label: translate('gallery.videoReview.actionEventType'),
      value: reviewEventLabel(marker.eventType),
    },
    ...(isReviewClick(marker)
      ? [
          {
            label: translate('gallery.videoReview.targetType'),
            value: translate(
              `gallery.videoReview.target_${marker.targetSemantics?.kind ?? 'unknown'}`
            ),
          },
        ]
      : []),
    ...(marker.target
      ? [
          {
            label: translate(
              isReviewClick(marker)
                ? 'gallery.videoReview.clickTarget'
                : isReviewKey(marker)
                  ? 'gallery.videoReview.actionKey'
                  : 'gallery.videoReview.actionTarget'
            ),
            value: marker.target,
          },
        ]
      : []),
    {
      label: translate('gallery.videoReview.clickRecordedAt'),
      value: point
        ? reviewTimeLabel(marker.start)
        : `${reviewTimeLabel(marker.start)}–${reviewTimeLabel(marker.end)}`,
    },
  ];
  return (
    <dl className="min-w-0 space-y-3 text-xs">
      {facts.map(({ label, value }) => (
        <div key={label} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
          <dt className="text-[var(--sniptale-color-text-muted)]">{label}</dt>
          <dd className="min-w-0 break-words text-right tabular-nums" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
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
    <div className="space-y-2">
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
