import { isReviewKey } from '../../features/video/review/key-animation';
import {
  REVIEW_KEY_DEFAULT,
  type ReviewKeyAnimation,
  type ReviewKeyPatch,
} from '../../features/video/review/advanced/key-animation';
import { ReviewKeyFields } from './key-animation-fields';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ArrowLeft, Search, SlidersHorizontal, X } from 'lucide-react';
import { NumericRow, SelectField } from '../../ui/compact-inspector-controls';
import { translate, formatNumber, useAppLocale } from '../../platform/i18n';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { isReviewClick } from '../../features/video/review/click-animation';
import {
  REVIEW_CLICK_DEFAULT,
  type ReviewClickAnimation,
  type ReviewClickStyle,
} from '../../features/video/review/advanced/click-animation';
import { ReviewClickFields } from './click-animation-fields';
import { HistorySelection, ReviewHistoryRow } from './action-history-list';
import {
  ReviewButton,
  reviewEventLabel,
  reviewSelectFieldClassName,
  reviewTextButtonClassName,
} from './controls';
import './action-history.css';

/** Search and selection belong to this inspector, independently of recorded project facts. */
type ReviewActionHistoryProps = {
  markers: readonly ReviewTelemetryMarker[];
  animations: readonly ReviewClickAnimation[];
  keyAnimations?: readonly ReviewKeyAnimation[];
  onKeyChange?(ids: readonly string[], patch: ReviewKeyPatch | null): void;
  busy: boolean;
  onSelect(marker: ReviewTelemetryMarker): void;
  onChange(ids: readonly string[], patch: Partial<ReviewClickStyle> | null): void;
};
export function ReviewActionHistory(props: ReviewActionHistoryProps) {
  const locale = useAppLocale();
  const [filters, setFilters] = useState<HistoryFilterValues>({
    query: '',
    type: 'all',
    status: 'all',
    longer: 0,
  });
  const [count, setCount] = useState(50);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [editing, setEditing] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLDivElement>(null);
  const restoration = useRef<{ top: number; pending: boolean }>({ top: 0, pending: false });
  const settings = useMemo(
    () => new Map(props.animations.map((item) => [item.id, item])),
    [props.animations]
  );
  const keySettings = useMemo(
    () => new Map((props.keyAnimations ?? []).map((item) => [item.id, item])),
    [props.keyAnimations]
  );
  const { ids, filtered, matching, checked } = queryHistory(
    props.markers,
    settings,
    filters,
    selected,
    keySettings
  );
  const keyIdentities = new Set(props.markers.filter(isReviewKey).map((marker) => marker.ref.id));
  const keyIds = ids.filter((id) => keyIdentities.has(id));
  const clickIds = ids.filter((id) => !keyIds.includes(id));
  const hidden = ids.length - checked;
  const changeView = (next: boolean) => {
    const scroll = list.current;
    if (next) restoration.current.top = scroll?.scrollTop ?? 0;
    restoration.current.pending = true;
    setEditing(next);
  };
  useLayoutEffect(() => {
    if (!restoration.current.pending) return;
    restoration.current.pending = false;
    navigation.current?.querySelector('button')?.focus({ preventScroll: true });
    const scroll = list.current;
    if (scroll) scroll.scrollTop = editing ? 0 : restoration.current.top;
  }, [editing]);
  return (
    <fieldset
      disabled={props.busy}
      className="review-history-root"
      data-ui="gallery.videoReview.actionHistory"
    >
      {editing ? (
        <div className="review-history-settings space-y-3">
          <div ref={navigation} className="review-history-navigation">
            <ReviewButton
              label={translate('gallery.videoReview.historyBack')}
              className={reviewTextButtonClassName}
              onClick={() => changeView(false)}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {translate('gallery.videoReview.historyBack')}
            </ReviewButton>
            <span className="text-xs text-[var(--sniptale-color-text-secondary)]">
              {translate('gallery.videoReview.historySelected')}:{' '}
              {formatNumber(ids.length, {}, locale)}
            </span>
          </div>
          <HistoryAnimationFields
            clickIds={clickIds}
            keyIds={keyIds}
            settings={settings}
            keySettings={keySettings}
            {...props}
          />
        </div>
      ) : (
        <>
          <div className="review-history-toolbar space-y-2">
            <HistoryFilters
              expanded={filtersExpanded}
              onToggle={() => setFiltersExpanded((value) => !value)}
              markers={props.markers}
              value={filters}
              onChange={(patch) => {
                setFilters((current) => ({ ...current, ...patch }));
                setCount(50);
              }}
            />
            <HistorySelection
              count={ids.length}
              hidden={hidden}
              matching={matching.size}
              checked={checked}
              navigationRef={navigation}
              onToggle={(value) =>
                setSelected((current) =>
                  value
                    ? [...new Set([...current, ...matching])]
                    : current.filter((id) => !matching.has(id))
                )
              }
              onClear={() => setSelected([])}
              onConfigure={() => changeView(true)}
            />
          </div>
          <div
            ref={list}
            className="review-history-results"
            data-ui="gallery.videoReview.historyResults"
          >
            {!filtered.length ? (
              <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
                {translate('gallery.videoReview.historyEmpty')}
              </p>
            ) : null}
            <ol className="space-y-1">
              {filtered.slice(0, count).map((marker) => (
                <ReviewHistoryRow
                  key={`${marker.ref.kind}:${marker.ref.id}`}
                  marker={marker}
                  keyStyle={isReviewKey(marker) ? keySettings.get(marker.ref.id) : undefined}
                  style={isReviewClick(marker) ? settings.get(marker.ref.id) : undefined}
                  selected={ids.includes(marker.ref.id)}
                  onSelect={() => props.onSelect(marker)}
                  onCheck={(value) =>
                    setSelected((current) =>
                      value
                        ? [...new Set([...current, marker.ref.id])]
                        : current.filter((id) => id !== marker.ref.id)
                    )
                  }
                />
              ))}
            </ol>
            {count < filtered.length ? (
              <ReviewButton
                className={reviewTextButtonClassName}
                label={translate('gallery.videoReview.historyMore')}
                onClick={() => setCount((value) => value + 50)}
              />
            ) : null}
          </div>
        </>
      )}
    </fieldset>
  );
}

interface HistoryFilterValues {
  query: string;
  type: string;
  status: string;
  longer: number;
}

/** Selected click and key settings remain separate even in a mixed batch. */
function HistoryAnimationFields(props: {
  keySettings: ReadonlyMap<string, ReviewKeyAnimation>;
  clickIds: readonly string[];
  keyIds: readonly string[];
  settings: ReadonlyMap<string, ReviewClickAnimation>;
  keyAnimations?: readonly ReviewKeyAnimation[];
  onChange(ids: readonly string[], patch: Partial<ReviewClickStyle> | null): void;
  onKeyChange?(ids: readonly string[], patch: ReviewKeyPatch | null): void;
}) {
  const { clickIds, keyIds, settings } = props;
  return (
    <>
      {' '}
      {clickIds.length ? (
        <ReviewClickFields
          values={clickIds.map((id) => settings.get(id) ?? REVIEW_CLICK_DEFAULT)}
          onChange={(patch) => {
            if (clickIds.length) props.onChange(clickIds, patch);
          }}
        />
      ) : null}
      {keyIds.length ? (
        <ReviewKeyFields
          values={keyIds.map((id) => props.keySettings.get(id) ?? REVIEW_KEY_DEFAULT)}
          onChange={(patch) => props.onKeyChange?.(keyIds, patch)}
        />
      ) : null}
    </>
  );
}

/** Controlled search/filter presentation; the history owner retains values across settings navigation. */
function HistoryFilters({
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
  const { query, type, status, longer } = value;
  const search = useRef<HTMLInputElement>(null);
  const active = type !== 'all' || status !== 'all' || longer > 0;
  return (
    <>
      <div className="flex items-center gap-1">
        <div className="review-history-search min-w-0 flex-1">
          <Search size={16} aria-hidden="true" />
          <input
            ref={search}
            type="search"
            aria-label={translate('gallery.videoReview.historySearch')}
            placeholder={translate('gallery.videoReview.historySearch')}
            value={query}
            onChange={(event) => {
              onChange({ query: event.target.value });
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
                onChange({ query: '' });
                search.current?.focus();
              }}
            >
              <X size={14} aria-hidden="true" />
            </ContentToolbarButton>
          ) : null}
        </div>
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
      <div hidden={!expanded} className="review-history-filters space-y-2">
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
    </>
  );
}

/** Derives matching events and eligible selection without changing recorded facts or stored selection. */
function queryHistory(
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
    const animation = isReviewClick(marker) ? settings.get(marker.ref.id) : undefined;
    return (
      (filters.type === 'all' ||
        (filters.type === 'clicks' ? isReviewClick(marker) : marker.eventType === filters.type)) &&
      (filters.status === 'all' ||
        (filters.status === 'animated'
          ? (!!animation && animation.effect !== 'off') ||
            (isReviewKey(marker) && !!keyAnimations.get(marker.ref.id)?.enabled)
          : selectedIds.has(marker.ref.id))) &&
      (!filters.longer || marker.end - marker.start > filters.longer) &&
      `${reviewEventLabel(marker.eventType)} ${marker.target ?? ''}`
        .toLocaleLowerCase()
        .includes(needle)
    );
  });
  const matching = new Set(
    filtered
      .filter((marker) => (isReviewClick(marker) && marker.focusPoint) || isReviewKey(marker))
      .map((marker) => marker.ref.id)
  );
  const checked = ids.filter((id) => matching.has(id)).length;
  return { ids, filtered, matching, checked };
}
