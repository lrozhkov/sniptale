import { isReviewKey } from '../../features/video/review/key-animation';
import type { ReviewKeyAnimation } from '../../features/video/review/advanced/key-animation';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Check, Minus, Clock3, Sparkles, X } from 'lucide-react';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { translate, formatNumber, useAppLocale } from '../../platform/i18n';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { isReviewClick } from '../../features/video/review/click-animation';
import type { ReviewClickAnimation } from '../../features/video/review/advanced/click-animation';
import {
  ReviewButton,
  reviewTextButtonClassName,
  reviewEventLabel,
  reviewTimeLabel,
} from './controls';

/** Neutral selection matches Library facets, including the native mixed state. */
function HistoryCheckbox(props: {
  label: string;
  checked: boolean;
  mixed?: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (input.current) input.current.indeterminate = !!props.mixed;
  }, [props.mixed]);
  return (
    <label className="review-history-checkbox" title={props.label}>
      <input
        ref={input}
        type="checkbox"
        aria-label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span aria-hidden="true">
        {props.mixed ? <Minus size={12} /> : props.checked ? <Check size={12} /> : null}
      </span>
    </label>
  );
}

/** Recorded metadata leads; event type and source timing stay secondary. */
export function ReviewHistoryRow(props: {
  marker: ReviewTelemetryMarker;
  style: ReviewClickAnimation | undefined;
  keyStyle?: ReviewKeyAnimation | undefined;
  selected: boolean;
  active: boolean;
  onSelect(): void;
  onCheck(checked: boolean): void;
}) {
  const { marker, style } = props;
  const locale = useAppLocale();
  const duration = marker.end - marker.start;
  return (
    <li
      className="review-history-row"
      data-selected={props.selected || undefined}
      data-active={props.active || undefined}
    >
      {(isReviewClick(marker) && marker.focusPoint) || isReviewKey(marker) ? (
        <HistoryCheckbox
          label={`${translate('gallery.videoReview.historySelect')} ${reviewTimeLabel(marker.start)}`}
          checked={props.selected}
          onChange={props.onCheck}
        />
      ) : (
        <span className="w-4 shrink-0" aria-hidden="true" />
      )}
      <button type="button" className="min-w-0 flex-1 text-left text-xs" onClick={props.onSelect}>
        <span className="flex min-w-0 items-center gap-2 text-[var(--sniptale-color-text-secondary)]">
          <span className={marker.target ? 'truncate' : 'review-history-target truncate'}>
            {reviewEventLabel(marker.eventType)}
          </span>
          <span className="ml-auto shrink-0 tabular-nums">{reviewTimeLabel(marker.start)}</span>
        </span>
        {marker.target ? (
          <span
            className="review-history-target block truncate font-medium text-[var(--sniptale-color-text-primary)]"
            title={marker.target}
          >
            {marker.target}
          </span>
        ) : null}
        {duration > 0 && !isReviewKey(marker) ? (
          <span
            className="flex items-center gap-1 tabular-nums text-[var(--sniptale-color-text-primary)]"
            title={translate('gallery.videoReview.sourceInterval')}
          >
            <Clock3 size={12} aria-hidden="true" />
            {translate('gallery.videoReview.intervalSeconds').replace(
              '{value}',
              formatNumber(duration, { maximumFractionDigits: 2 }, locale)
            )}
          </span>
        ) : null}
        {props.keyStyle?.enabled ? (
          <span className="block text-[var(--sniptale-color-text-secondary)]">
            {translate('gallery.videoReview.keyCaption')} ·{' '}
            {formatNumber(
              Math.round((props.keyStyle.before + props.keyStyle.after) * 1000),
              {},
              locale
            )}{' '}
            {translate('gallery.videoReview.clickMilliseconds')}
          </span>
        ) : null}
        {style && style.effect !== 'off' ? (
          <span className="flex items-center gap-1 text-[var(--sniptale-color-text-secondary)]">
            <Sparkles size={12} aria-hidden="true" />
            {translate(`gallery.videoReview.click_${style.effect}`)} ·{' '}
            {formatNumber(Math.round((style.before + style.after) * 1000), {}, locale)}{' '}
            {translate('gallery.videoReview.clickMilliseconds')}
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** Matching-click selection commands stay visually separate from both event rows and settings. */
export function HistorySelection(props: {
  count: number;
  hidden: number;
  matching: number;
  checked: number;
  navigationRef: RefObject<HTMLDivElement | null>;
  onToggle(checked: boolean): void;
  onClear(): void;
  onConfigure(): void;
}) {
  const locale = useAppLocale();
  return (
    <div className="review-history-selection">
      <div className="flex items-center gap-2 text-xs text-[var(--sniptale-color-text-secondary)]">
        <HistoryCheckbox
          label={translate('gallery.videoReview.historySelectAll')}
          checked={props.matching > 0 && props.checked === props.matching}
          mixed={props.checked > 0 && props.checked < props.matching}
          disabled={!props.matching}
          onChange={props.onToggle}
        />
        <span>
          {translate('gallery.videoReview.historySelected')}:{' '}
          {formatNumber(props.count, {}, locale)}
          {props.hidden
            ? ` · ${translate('gallery.videoReview.historyHiddenSelected')}: ${formatNumber(props.hidden, {}, locale)}`
            : ''}
        </span>
        {props.count ? (
          <ContentToolbarButton
            type="button"
            tone="utility"
            size="compact"
            className="ml-auto"
            aria-label={translate('gallery.videoReview.historyClear')}
            title={translate('gallery.videoReview.historyClear')}
            onClick={props.onClear}
          >
            <X size={14} aria-hidden="true" />
          </ContentToolbarButton>
        ) : null}
      </div>
      <div ref={props.navigationRef}>
        <ReviewButton
          label={translate('gallery.videoReview.historyConfigure')}
          className={reviewTextButtonClassName}
          disabled={!props.count}
          onClick={props.onConfigure}
        />
      </div>
    </div>
  );
}
