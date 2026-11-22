import { Check } from 'lucide-react';
import { useMemo } from 'react';
import type { ReviewHistoryMove, ReviewOperation } from '../../features/video/review/types';
import { formatNumber, translate, useAppLocale } from '../../platform/i18n';
import { ReviewResetControl } from './reset-control';
import { reviewEditHistoryTitle } from './edit-history-labels';

/** Shows the retained session history, including the steps available to Redo. */
export function ReviewEditHistory(props: {
  operations: readonly ReviewOperation[];
  cursor: number;
  busy: boolean;
  autosaveEnabled: boolean;
  onSeek(move: ReviewHistoryMove): Promise<unknown>;
  onStart(): Promise<unknown>;
  onReset(): Promise<unknown>;
}) {
  const locale = useAppLocale();
  const entries = useMemo(
    () =>
      props.operations.toReversed().map((operation, offset) => ({
        id: operation.id,
        index: props.operations.length - offset,
        title: reviewEditHistoryTitle(operation, locale),
        detail:
          operation.target === 'sourceAudio'
            ? formatNumber(
                operation.after.muted ? 0 : operation.after.volume,
                { style: 'percent', maximumFractionDigits: 2 },
                locale
              )
            : undefined,
      })),
    [locale, props.operations]
  );
  return (
    <section data-ui="gallery.videoReview.editHistory" className="review-edit-history">
      <div className="review-edit-history-actions">
        <ReviewResetControl
          busy={props.busy}
          cursor={props.cursor}
          autosaveEnabled={props.autosaveEnabled}
          onStart={props.onStart}
          onReset={props.onReset}
        />
      </div>
      <ol reversed aria-label={translate('gallery.videoReview.editHistoryTitle')}>
        {entries.map((entry) => (
          <ReviewEditHistoryRow
            key={entry.id}
            index={entry.index}
            cursor={props.cursor}
            detail={entry.detail}
            disabled={props.busy}
            onClick={() => void props.onSeek({ entryId: entry.id })}
          >
            {entry.title}
          </ReviewEditHistoryRow>
        ))}
        <ReviewEditHistoryRow
          index={0}
          cursor={props.cursor}
          disabled={props.busy}
          onClick={() => void props.onStart()}
        >
          {translate('gallery.videoReview.editHistoryStart')}
        </ReviewEditHistoryRow>
      </ol>
    </section>
  );
}

function ReviewEditHistoryRow(props: {
  index: number;
  cursor: number;
  children: string;
  detail?: string | undefined;
  disabled: boolean;
  onClick(): void;
}) {
  const current = props.index === props.cursor;
  const undone = props.index > props.cursor;
  return (
    <li data-history-step={props.index} aria-current={current ? 'step' : undefined}>
      <button
        type="button"
        className="review-edit-history-row"
        disabled={props.disabled}
        onClick={current ? undefined : props.onClick}
      >
        <span aria-hidden="true" className="review-edit-history-marker">
          {current && <Check size={12} />}
        </span>
        <span className="min-w-0 flex-1">
          {props.children}{' '}
          {props.detail ? <span className="review-edit-history-status">{props.detail}</span> : null}
        </span>
        {current || undone ? (
          <span className="review-edit-history-status">
            {translate(
              current
                ? 'gallery.videoReview.editHistoryCurrent'
                : 'gallery.videoReview.editHistoryUndone'
            )}
          </span>
        ) : null}
      </button>
    </li>
  );
}
