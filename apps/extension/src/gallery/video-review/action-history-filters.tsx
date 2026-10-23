import { useRef } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { NumericRow, SelectField } from '../../ui/compact-inspector-controls';
import { translate } from '../../platform/i18n';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { reviewActionLane } from '../../features/video/review/action-lanes';
import { isReviewClick } from '../../features/video/review/click-animation';
import { isReviewKey } from '../../features/video/review/key-animation';
import { reviewActionAudioTarget } from '../../features/video/review/action-audio';
import { reviewActionAudioRefKey } from '../../features/video/review/advanced/action-audio';

/** Disposable checkbox identity stays distinct for recorded action and normalized signal IDs. */
export function historySelectableKey(marker: ReviewTelemetryMarker): string | null {
  const target = reviewActionAudioTarget(marker);
  return target ? reviewActionAudioRefKey(target.ref) : null;
}
import type { ReviewClickAnimation } from '../../features/video/review/advanced/click-animation';
import type { ReviewKeyAnimation } from '../../features/video/project/action-feedback/key-animation';
import { reviewEventLabel, reviewMouseButtonLabel, reviewSelectFieldClassName } from './controls';

export interface HistoryFilterValues {
  query: string;
  targetType: string;
  element?: string;
  type: string;
  status: string;
  longer: number;
  button?: string;
}

/** Event capabilities normalize hidden criteria in both presentation and actual queries. */
function historyFilterState(markers: readonly ReviewTelemetryMarker[], value: HistoryFilterValues) {
  markers = markers.filter((marker) => reviewActionLane(marker) !== null);
  const matching = markers.filter((marker) => matchesHistoryType(marker, value.type));
  const all = value.type === 'all';
  const target = all || value.type === 'clicks' || matching.some(historyHasTarget);
  const targetType = target ? value.targetType : 'all';
  const targets = matching.filter(
    (marker) =>
      targetType === 'all' ||
      (historyHasTarget(marker) && (marker.targetSemantics?.kind ?? 'unknown') === targetType)
  );
  const element =
    target && targets.some((marker) => historyHasTarget(marker) && marker.target === value.element)
      ? (value.element ?? '')
      : '';
  const scoped = element
    ? targets.filter((marker) => historyHasTarget(marker) && marker.target === element)
    : targets;
  const animation =
    all ||
    value.type === 'clicks' ||
    scoped.some((marker) => isReviewClick(marker) || isReviewKey(marker));
  const selectable = all || scoped.some((marker) => historySelectableKey(marker) !== null);
  const status =
    value.status === 'selected'
      ? selectable
        ? value.status
        : 'all'
      : animation
        ? value.status
        : 'all';
  const capabilities = {
    target,
    button: matching.some((marker) => marker.mouseButton !== undefined),
    animation,
    selectable,
    duration:
      status === 'all' &&
      scoped.some(
        (marker) =>
          (!isReviewClick(marker) || !!marker.gesture) &&
          !isReviewKey(marker) &&
          marker.end > marker.start
      ),
  };
  return {
    capabilities,
    value: {
      ...value,
      targetType,
      button: capabilities.button ? (value.button ?? 'all') : 'all',
      element,
      status,
      longer: capabilities.duration ? value.longer : 0,
    },
  };
}

/** Controlled search/filter presentation; the history owner retains values across settings navigation. */
export function HistoryFilters({
  expanded,
  onToggle,
  markers,
  elementMarkers,
  value,
  onChange,
}: {
  markers: readonly ReviewTelemetryMarker[];
  elementMarkers: readonly ReviewTelemetryMarker[];
  value: HistoryFilterValues;
  expanded: boolean;
  onToggle(): void;
  onChange(patch: Partial<HistoryFilterValues>): void;
}) {
  const normalized = historyFilterState(markers, value).value;
  const { query, type, status, longer, targetType, element } = normalized;
  const active =
    !!query.trim() ||
    !!element ||
    targetType !== 'all' ||
    type !== 'all' ||
    status !== 'all' ||
    longer > 0 ||
    normalized.button !== 'all';
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
          active={expanded}
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
        <HistoryFilterFields
          markers={markers}
          elementMarkers={elementMarkers}
          value={normalized}
          onChange={(patch) =>
            onChange(historyFilterState(markers, { ...normalized, ...patch }).value)
          }
        />
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
  markers = markers.filter((marker) => reviewActionLane(marker) !== null);
  filters = historyFilterState(markers, filters).value;
  const eligible = new Set(
    markers.map(historySelectableKey).filter((key): key is string => key !== null)
  );
  const ids = selected.filter((id) => eligible.has(id));
  const selectedIds = new Set(ids);
  const needle = filters.query.trim().toLocaleLowerCase();
  const elementMarkers = markers.filter((marker) => {
    const animated = isReviewClick(marker)
      ? settings.has(marker.ref.id) && settings.get(marker.ref.id)?.effect !== 'off'
      : isReviewKey(marker) && !!keyAnimations.get(marker.ref.id)?.enabled;
    const statusMatches =
      filters.status === 'all' ||
      (filters.status === 'animated'
        ? animated
        : selectedIds.has(historySelectableKey(marker) ?? ''));
    return (
      statusMatches &&
      matchesRecordedMetadata(marker, { ...filters, element: '', longer: 0 }, needle)
    );
  });
  const filtered = elementMarkers.filter((marker) =>
    matchesRecordedMetadata(marker, filters, needle)
  );
  const matching = new Set(
    filtered.map(historySelectableKey).filter((key): key is string => key !== null)
  );
  const checked = ids.filter((id) => matching.has(id)).length;
  return { ids, filtered, matching, checked, elementMarkers };
}

function matchesRecordedMetadata(
  marker: ReviewTelemetryMarker,
  filters: HistoryFilterValues,
  needle: string
) {
  const targetMatches =
    filters.targetType === 'all' ||
    (historyHasTarget(marker) &&
      (marker.targetSemantics?.kind ?? 'unknown') === filters.targetType);
  return (
    matchesHistoryType(marker, filters.type) &&
    ((filters.button ?? 'all') === 'all' || String(marker.mouseButton) === filters.button) &&
    targetMatches &&
    (!filters.element || (historyHasTarget(marker) && marker.target === filters.element)) &&
    (!filters.longer || marker.end - marker.start > filters.longer) &&
    historySearchText(marker).includes(needle)
  );
}

function historyHasTarget(marker: ReviewTelemetryMarker) {
  return isReviewClick(marker) || marker.gesture !== undefined;
}

function matchesHistoryType(marker: ReviewTelemetryMarker, type: string) {
  if (type === 'all') return true;
  if (type === 'clicks') return marker.eventType === 'CLICK' || marker.eventType === 'DOUBLE_CLICK';
  if (type === 'keyboard') return reviewActionLane(marker) === 0;
  if (type === 'mouse') return reviewActionLane(marker) === 1;
  if (type === 'cursor-family') return reviewActionLane(marker) === 2;
  return marker.eventType === type;
}

function historySearchText(marker: ReviewTelemetryMarker): string {
  const targetLabel = historyHasTarget(marker)
    ? translate(`gallery.videoReview.target_${marker.targetSemantics?.kind ?? 'unknown'}`)
    : '';
  const searchable =
    `${reviewEventLabel(marker.eventType)} ${marker.target ?? ''} ${targetLabel}`.toLocaleLowerCase();
  return searchable;
}

/** Search owns input focus restoration independently of filter selection. */
export function HistorySearch({
  query,
  onChange,
  label,
  clearLabel,
}: {
  query: string;
  onChange(query: string): void;
  label?: string;
  clearLabel?: string;
}) {
  const search = useRef<HTMLInputElement>(null);
  return (
    <div className="review-history-search min-w-0 flex-1">
      <Search size={16} aria-hidden="true" />
      <input
        ref={search}
        type="search"
        aria-label={label ?? translate('gallery.videoReview.historySearch')}
        placeholder={label ?? translate('gallery.videoReview.historySearch')}
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
          aria-label={clearLabel ?? translate('gallery.videoReview.historySearchClear')}
          title={clearLabel ?? translate('gallery.videoReview.historySearchClear')}
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
  elementMarkers,
  value,
  onChange,
}: {
  markers: readonly ReviewTelemetryMarker[];
  elementMarkers: readonly ReviewTelemetryMarker[];
  value: HistoryFilterValues;
  onChange(patch: Partial<HistoryFilterValues>): void;
}) {
  const { capabilities } = historyFilterState(markers, value);
  const { type, targetType, longer, status, element = '' } = value;
  const elements = Array.from(
    new Set([
      ...elementMarkers
        .filter(historyHasTarget)
        .flatMap((marker) => (marker.target ? [marker.target] : [])),
      ...(element ? [element] : []),
    ])
  );
  return (
    <div className="review-history-filters sniptale-parameter-stack">
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.historyType')}
        value={type}
        options={[
          { value: 'all', label: translate('gallery.videoReview.historyAll') },
          { value: 'clicks', label: translate('gallery.videoReview.historyClicks') },
          { value: 'keyboard', label: translate('gallery.videoReview.historyKeyboard') },
          { value: 'mouse', label: translate('gallery.videoReview.historyMouse') },
          { value: 'cursor-family', label: translate('gallery.videoReview.historyCursor') },
          ...Array.from(
            new Set(
              markers
                .filter((marker) => reviewActionLane(marker) !== null && !isReviewClick(marker))
                .map((marker) => marker.eventType)
            )
          ).map((value) => ({ value, label: reviewEventLabel(value) })),
        ]}
        onChange={(value) => {
          onChange({ type: value });
        }}
      />
      {capabilities.button ? (
        <SelectField
          className={reviewSelectFieldClassName}
          label={translate('gallery.videoReview.historyButton')}
          value={value.button ?? 'all'}
          options={[
            { value: 'all', label: translate('gallery.videoReview.historyAll') },
            ...Array.from(
              new Set(
                markers.flatMap((marker) =>
                  marker.mouseButton === undefined ? [] : [marker.mouseButton]
                )
              )
            )
              .sort((a, b) => a - b)
              .map((button) => ({
                value: String(button),
                label: reviewMouseButtonLabel(button),
              })),
          ]}
          onChange={(button) => onChange({ button })}
        />
      ) : null}
      {capabilities.target ? (
        <SelectField
          className={reviewSelectFieldClassName}
          label={translate('gallery.videoReview.targetType')}
          value={targetType}
          options={[
            { value: 'all', label: translate('gallery.videoReview.targetAll') },
            ...Array.from(
              new Set(
                markers
                  .filter(historyHasTarget)
                  .map((marker) => marker.targetSemantics?.kind ?? 'unknown')
              )
            ).map((kind) => ({
              value: kind,
              label: translate(`gallery.videoReview.target_${kind}`),
            })),
          ]}
          onChange={(value) => onChange({ targetType: value })}
        />
      ) : null}
      {capabilities.target ? (
        <SelectField
          className={reviewSelectFieldClassName}
          label={translate('gallery.videoReview.historyElement')}
          value={element}
          options={[
            { value: '', label: translate('gallery.videoReview.targetAll') },
            ...elements.map((value) => ({ value, label: value })),
          ]}
          onChange={(element) => onChange({ element })}
        />
      ) : null}
      {capabilities.duration ? (
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
      ) : null}
      {capabilities.animation || capabilities.selectable ? (
        <SelectField
          className={reviewSelectFieldClassName}
          label={translate('gallery.videoReview.historyStatus')}
          value={status}
          options={[
            { value: 'all', label: translate('gallery.videoReview.historyAll') },
            ...(capabilities.animation
              ? [{ value: 'animated', label: translate('gallery.videoReview.historyAnimatedOnly') }]
              : []),
            { value: 'selected', label: translate('gallery.videoReview.historySelectedOnly') },
          ]}
          onChange={(value) => {
            onChange({ status: value });
          }}
        />
      ) : null}
    </div>
  );
}
