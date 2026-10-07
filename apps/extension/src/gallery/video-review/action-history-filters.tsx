import { useRef } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { NumericRow, SelectField } from '../../ui/compact-inspector-controls';
import { translate } from '../../platform/i18n';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { isReviewClick } from '../../features/video/review/click-animation';
import { isReviewKey } from '../../features/video/review/key-animation';
import type { ReviewClickAnimation } from '../../features/video/review/advanced/click-animation';
import type { ReviewKeyAnimation } from '../../features/video/review/advanced/key-animation';
import { reviewEventLabel, reviewSelectFieldClassName } from './controls';

export interface HistoryFilterValues {
  query: string;
  targetType: string;
  type: string;
  status: string;
  longer: number;
}

/** Controlled search/filter presentation; the history owner retains values across settings navigation. */
export function HistoryFilters({
  expanded,
  onToggle,
  markers,
  value,
  onChange,
}: {
  markers: readonly ReviewTelemetryMarker[];
  value: HistoryFilterValues;
  expanded: boolean;
  onToggle(): void;
  onChange(patch: Partial<HistoryFilterValues>): void;
}) {
  const { query, type, status, longer, targetType } = value;
  const active = targetType !== 'all' || type !== 'all' || status !== 'all' || longer > 0;
  return (
    <>
      <div className="flex items-center gap-1">
        <HistorySearch query={query} onChange={(query) => onChange({ query })} />
        <ContentToolbarButton
          type="button"
          tone="utility"
          size="compact"
          aria-label={translate('gallery.videoReview.historyFilters')}
          title={translate('gallery.videoReview.historyFilters')}
          aria-expanded={expanded}
          active={active}
          aria-description={
            active ? translate('gallery.videoReview.historyFiltersActive') : undefined
          }
          className="review-history-filter-toggle"
          onClick={onToggle}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {active ? <span className="review-history-filter-dot" aria-hidden="true" /> : null}
        </ContentToolbarButton>
      </div>
      <div hidden={!expanded}>
        <HistoryFilterFields markers={markers} value={value} onChange={onChange} />
      </div>
    </>
  );
}

/** Derives matching events and eligible selection without changing recorded facts or stored selection. */
export function queryHistory(
  markers: readonly ReviewTelemetryMarker[],
  settings: ReadonlyMap<string, ReviewClickAnimation>,
  filters: HistoryFilterValues,
  selected: readonly string[],
  keyAnimations: ReadonlyMap<string, ReviewKeyAnimation>
) {
  const eligible = new Set(
    markers
      .filter((marker) => (isReviewClick(marker) && marker.focusPoint) || isReviewKey(marker))
      .map((marker) => marker.ref.id)
  );
  const ids = selected.filter((id) => eligible.has(id));
  const selectedIds = new Set(ids);
  const needle = filters.query.trim().toLocaleLowerCase();
  const filtered = markers.filter((marker) => {
    const animated = isReviewClick(marker)
      ? settings.has(marker.ref.id) && settings.get(marker.ref.id)?.effect !== 'off'
      : isReviewKey(marker) && !!keyAnimations.get(marker.ref.id)?.enabled;
    const statusMatches =
      filters.status === 'all' ||
      (filters.status === 'animated' ? animated : selectedIds.has(marker.ref.id));
    return statusMatches && matchesRecordedMetadata(marker, filters, needle);
  });
  const matching = new Set(
    filtered
      .filter((marker) => (isReviewClick(marker) && marker.focusPoint) || isReviewKey(marker))
      .map((marker) => marker.ref.id)
  );
  const checked = ids.filter((id) => matching.has(id)).length;
  return { ids, filtered, matching, checked };
}

function matchesRecordedMetadata(
  marker: ReviewTelemetryMarker,
  filters: HistoryFilterValues,
  needle: string
) {
  const targetMatches =
    filters.targetType === 'all' ||
    (isReviewClick(marker) && (marker.targetSemantics?.kind ?? 'unknown') === filters.targetType);
  return (
    (filters.type === 'all' ||
      (filters.type === 'clicks' ? isReviewClick(marker) : marker.eventType === filters.type)) &&
    targetMatches &&
    (!filters.longer || marker.end - marker.start > filters.longer) &&
    historySearchText(marker).includes(needle)
  );
}

function historySearchText(marker: ReviewTelemetryMarker): string {
  const targetLabel = isReviewClick(marker)
    ? translate(`gallery.videoReview.target_${marker.targetSemantics?.kind ?? 'unknown'}`)
    : '';
  const searchable =
    `${reviewEventLabel(marker.eventType)} ${marker.target ?? ''} ${targetLabel}`.toLocaleLowerCase();
  return searchable;
}

/** Search owns input focus restoration independently of filter selection. */
function HistorySearch({ query, onChange }: { query: string; onChange(query: string): void }) {
  const search = useRef<HTMLInputElement>(null);
  return (
    <div className="review-history-search min-w-0 flex-1">
      <Search size={16} aria-hidden="true" />
      <input
        ref={search}
        type="search"
        aria-label={translate('gallery.videoReview.historySearch')}
        placeholder={translate('gallery.videoReview.historySearch')}
        value={query}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {query ? (
        <ContentToolbarButton
          type="button"
          tone="utility"
          size="compact"
          aria-label={translate('gallery.videoReview.historySearchClear')}
          title={translate('gallery.videoReview.historySearchClear')}
          onClick={() => {
            onChange('');
            search.current?.focus();
          }}
        >
          <X size={14} aria-hidden="true" />
        </ContentToolbarButton>
      ) : null}
    </div>
  );
}

/** Expanded criteria share one controlled value with the persistent history owner. */
function HistoryFilterFields({
  markers,
  value,
  onChange,
}: {
  markers: readonly ReviewTelemetryMarker[];
  value: HistoryFilterValues;
  onChange(patch: Partial<HistoryFilterValues>): void;
}) {
  const { type, targetType, longer, status } = value;
  return (
    <div className="review-history-filters space-y-2">
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.historyType')}
        value={type}
        options={[
          { value: 'all', label: translate('gallery.videoReview.historyAll') },
          { value: 'clicks', label: translate('gallery.videoReview.historyClicks') },
          ...Array.from(
            new Set(
              markers.filter((marker) => !isReviewClick(marker)).map((marker) => marker.eventType)
            )
          ).map((value) => ({ value, label: reviewEventLabel(value) })),
        ]}
        onChange={(value) => {
          onChange({ type: value });
        }}
      />
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.targetType')}
        value={targetType}
        options={[
          { value: 'all', label: translate('gallery.videoReview.targetAll') },
          ...Array.from(
            new Set(
              markers
                .filter(isReviewClick)
                .map((marker) => marker.targetSemantics?.kind ?? 'unknown')
            )
          ).map((kind) => ({
            value: kind,
            label: translate(`gallery.videoReview.target_${kind}`),
          })),
        ]}
        onChange={(value) => onChange({ targetType: value })}
      />
      <NumericRow
        appearance="plain"
        label={translate('gallery.videoReview.historyLonger')}
        value={longer}
        min={0}
        max={86400}
        step={0.1}
        precision={1}
        scrub={{ min: 0, max: 10, step: 0.1 }}
        unit="s"
        enterBehavior="blur"
        onPreviewValue={(value) => onChange({ longer: value })}
        onCommitValue={(value) => {
          onChange({ longer: value });
        }}
      />
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.historyStatus')}
        value={status}
        options={[
          { value: 'all', label: translate('gallery.videoReview.historyAll') },
          { value: 'animated', label: translate('gallery.videoReview.historyAnimatedOnly') },
          { value: 'selected', label: translate('gallery.videoReview.historySelectedOnly') },
        ]}
        onChange={(value) => {
          onChange({ status: value });
        }}
      />
    </div>
  );
}
