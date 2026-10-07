import { HistoryFilters, queryHistory, type HistoryFilterValues } from './action-history-filters';
import { isReviewKey } from '../../features/video/review/key-animation';
import {
  REVIEW_KEY_DEFAULT,
  type ReviewKeyAnimation,
  type ReviewKeyPatch,
} from '../../features/video/review/advanced/key-animation';
import { ReviewKeyFields } from './key-animation-fields';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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
import { ReviewButton, reviewTextButtonClassName } from './controls';
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
    targetType: 'all',
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
