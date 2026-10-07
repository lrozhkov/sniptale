import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { SearchField, SelectField } from '../../ui/compact-inspector-controls';
import { translate, formatNumber } from '../../platform/i18n';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { isReviewClick } from '../../features/video/review/click-animation';
import {
  REVIEW_CLICK_DEFAULT,
  type ReviewClickAnimation,
  type ReviewClickStyle,
} from '../../features/video/review/advanced/click-animation';
import { ReviewClickFields } from './click-animation-fields';
import {
  ReviewButton,
  reviewEventLabel,
  reviewTimeLabel,
  reviewTextButtonClassName,
} from './controls';

/** Full semantic recorded history, with explicit batch selection independent of timeline filters. */
export function ReviewActionHistory(props: {
  markers: readonly ReviewTelemetryMarker[];
  animations: readonly ReviewClickAnimation[];
  busy: boolean;
  onSelect(marker: ReviewTelemetryMarker): void;
  onChange(ids: readonly string[], patch: Partial<ReviewClickStyle> | null): void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'clicks' | 'animated'>('all');
  const [count, setCount] = useState(50);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const settings = useMemo(
    () => new Map(props.animations.map((item) => [item.id, item])),
    [props.animations]
  );
  const filtered = props.markers.filter((marker) => {
    const style = isReviewClick(marker) ? settings.get(marker.ref.id) : undefined;
    return (
      (filter === 'all' ||
        (filter === 'clicks' ? isReviewClick(marker) : !!style && style.effect !== 'off')) &&
      `${reviewEventLabel(marker.eventType)} ${marker.target ?? ''}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase())
    );
  });
  const ids = selected.filter((id) =>
    props.markers.some(
      (marker) => marker.ref.id === id && isReviewClick(marker) && marker.focusPoint
    )
  );
  return (
    <fieldset
      disabled={props.busy}
      className="min-w-0 space-y-3"
      data-ui="gallery.videoReview.actionHistory"
    >
      <SearchField
        label={translate('gallery.videoReview.historySearch')}
        placeholder={translate('gallery.videoReview.historySearch')}
        value={query}
        onChange={(value) => {
          setQuery(value);
          setCount(50);
        }}
      />
      <SelectField
        label={translate('gallery.videoReview.telemetry')}
        value={filter}
        options={[
          { value: 'all', label: translate('gallery.videoReview.historyAll') },
          { value: 'clicks', label: translate('gallery.videoReview.historyClicks') },
          { value: 'animated', label: translate('gallery.videoReview.historyAnimatedOnly') },
        ]}
        onChange={(value: typeof filter) => {
          setFilter(value);
          setCount(50);
        }}
      />
      <div className="flex flex-wrap gap-1">
        <ReviewButton
          label={translate('gallery.videoReview.historySelectAll')}
          className={reviewTextButtonClassName}
          onClick={() =>
            setSelected(
              filtered
                .filter((marker) => isReviewClick(marker) && marker.focusPoint)
                .map((marker) => marker.ref.id)
            )
          }
        />
        {ids.length ? (
          <ReviewButton
            label={translate('gallery.videoReview.historyClear')}
            className={reviewTextButtonClassName}
            onClick={() => setSelected([])}
          />
        ) : null}
      </div>
      {ids.length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold">
            {translate('gallery.videoReview.historySelected')}: {formatNumber(ids.length)}
          </h3>
          <ReviewClickFields
            values={ids.map((id) => settings.get(id) ?? REVIEW_CLICK_DEFAULT)}
            onChange={(patch) => props.onChange(ids, patch)}
          />
        </section>
      ) : null}
      {!filtered.length ? (
        <p role="status" className="text-xs">
          {translate('gallery.videoReview.historyEmpty')}
        </p>
      ) : null}
      <ol className="space-y-1">
        {filtered.slice(0, count).map((marker) => {
          const style = isReviewClick(marker) ? settings.get(marker.ref.id) : undefined;
          return (
            <ReviewHistoryRow
              key={`${marker.ref.kind}:${marker.ref.id}`}
              marker={marker}
              style={style}
              selected={ids.includes(marker.ref.id)}
              onSelect={() => props.onSelect(marker)}
              onCheck={(checked) =>
                setSelected((current) =>
                  checked
                    ? [...current, marker.ref.id]
                    : current.filter((id) => id !== marker.ref.id)
                )
              }
            />
          );
        })}
      </ol>
      {count < filtered.length ? (
        <ReviewButton
          className={reviewTextButtonClassName}
          label={translate('gallery.videoReview.historyMore')}
          onClick={() => setCount((value) => value + 50)}
        />
      ) : null}
    </fieldset>
  );
}

/** Event metadata is plain text; animation status is visible without relying on color. */
function ReviewHistoryRow(props: {
  marker: ReviewTelemetryMarker;
  style: ReviewClickAnimation | undefined;
  selected: boolean;
  onSelect(): void;
  onCheck(checked: boolean): void;
}) {
  const { marker, style } = props;
  return (
    <li
      key={`${marker.ref.kind}:${marker.ref.id}`}
      className={
        'flex min-w-0 items-center gap-2 rounded-sm border p-2 ' +
        'border-[var(--sniptale-color-border-soft)]'
      }
    >
      {isReviewClick(marker) && marker.focusPoint ? (
        <input
          type="checkbox"
          aria-label={`${translate('gallery.videoReview.historySelect')} ${reviewTimeLabel(marker.start)}`}
          checked={props.selected}
          onChange={(event) => props.onCheck(event.target.checked)}
        />
      ) : null}
      <button type="button" className="min-w-0 flex-1 text-left text-xs" onClick={props.onSelect}>
        <span className="flex items-center gap-2">
          <span>{reviewEventLabel(marker.eventType)}</span>
          <span className="ml-auto tabular-nums text-[var(--sniptale-color-text-muted)]">
            {reviewTimeLabel(marker.start)}
          </span>
        </span>
        {marker.target ? (
          <span
            className="block truncate text-[var(--sniptale-color-text-secondary)]"
            title={marker.target}
          >
            {marker.target}
          </span>
        ) : null}
        {style && style.effect !== 'off' ? (
          <span className="flex items-center gap-1 text-[var(--sniptale-color-text-secondary)]">
            <Sparkles size={12} aria-hidden="true" />
            {translate(`gallery.videoReview.click_${style.effect}`)} ·{' '}
            {formatNumber(Math.round((style.before + style.after) * 1000))}{' '}
            {translate('gallery.videoReview.clickMilliseconds')}
          </span>
        ) : null}
      </button>
    </li>
  );
}
