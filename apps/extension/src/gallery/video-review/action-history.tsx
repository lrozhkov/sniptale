import { ReviewInspectorSections } from './inspector-sections';
import {
  HistoryFilters,
  queryHistory,
  historySelectableKey,
  type HistoryFilterValues,
} from './action-history-filters';
import { reviewActionAudioTarget } from '../../features/video/review/action-audio';
import type {
  ReviewActionAudioTarget,
  ReviewActionAudioSetting,
  ReviewActionAudioPatch,
} from '../../features/video/review/advanced/action-audio';
import { ReviewActionAudioFields, reviewActionAudioSection } from './action-audio-fields';
import { isReviewKey } from '../../features/video/review/key-animation';
import {
  REVIEW_KEY_DEFAULT,
  type ReviewKeyAnimation,
  type ReviewKeyPatch,
} from '../../features/video/review/advanced/key-animation';
import { reviewKeySections } from './key-animation-fields';
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ArrowLeft } from 'lucide-react';
import { translate, formatNumber, useAppLocale } from '../../platform/i18n';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import type { RecordingTelemetryCapabilities } from '../../features/video/project/types';
import { reviewHistoryCaptureStatus, reviewHistoryCaptureLabel } from './action-history-coverage';
import { isReviewClick } from '../../features/video/review/click-animation';
import {
  REVIEW_CLICK_DEFAULT,
  type ReviewClickAnimation,
  type ReviewClickStyle,
} from '../../features/video/review/advanced/click-animation';
import { reviewClickSections } from './click-animation-fields';
import { HistorySelection, ReviewHistoryRow } from './action-history-list';
import { ReviewButton, reviewTextButtonClassName } from './controls';
import './action-history.css';

/** Search and selection belong to this inspector, independently of recorded project facts. */
type ReviewActionHistoryProps = {
  captureCapabilities?: RecordingTelemetryCapabilities | null | undefined;
  markers: readonly ReviewTelemetryMarker[];
  animations: readonly ReviewClickAnimation[];
  keyAnimations?: readonly ReviewKeyAnimation[];
  actionAudio?: readonly ReviewActionAudioSetting[];
  onAudioChange?(
    targets: readonly ReviewActionAudioTarget[],
    patch: ReviewActionAudioPatch | null
  ): void;
  onAudition?: Parameters<typeof ReviewActionAudioFields>[0]['onAudition'];
  onStopAudition?: (() => void) | undefined;
  onKeyChange?(ids: readonly string[], patch: ReviewKeyPatch | null): void;
  activeRef?: ReviewTelemetryMarker['ref'] | undefined;
  busy: boolean;
  onSelect(marker: ReviewTelemetryMarker): void;
  onChange(ids: readonly string[], patch: Partial<ReviewClickStyle> | null): void;
};
export function ReviewActionHistory(props: ReviewActionHistoryProps) {
  const [filters, setFilters] = useState<HistoryFilterValues>({
    query: '',
    targetType: 'all',
    element: '',
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
  const { ids, filtered, matching, checked, elementMarkers } = queryHistory(
    props.markers,
    settings,
    filters,
    selected,
    keySettings
  );
  const { selectedKeys, keyIds, clickIds, audioTargets } = historyPresentationTargets(
    props.markers,
    ids
  );
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
          <HistoryBatchHeader
            navigation={navigation}
            count={ids.length}
            hidden={hidden}
            onBack={() => changeView(false)}
          />
          <HistoryAnimationFields
            clickIds={clickIds}
            keyIds={keyIds}
            settings={settings}
            keySettings={keySettings}
            audioTargets={audioTargets}
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
              elementMarkers={elementMarkers}
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
              <HistoryEmptyState
                searched={props.markers.length > 0}
                capabilities={props.captureCapabilities}
              />
            ) : null}
            <ol className="space-y-1">
              {filtered.slice(0, count).map((marker) => (
                <ReviewHistoryRow
                  key={`${marker.ref.kind}:${marker.ref.id}`}
                  marker={marker}
                  keyStyle={isReviewKey(marker) ? keySettings.get(marker.ref.id) : undefined}
                  style={isReviewClick(marker) ? settings.get(marker.ref.id) : undefined}
                  selected={selectedKeys.has(historySelectableKey(marker) ?? '')}
                  active={
                    props.activeRef?.kind === marker.ref.kind &&
                    props.activeRef.id === marker.ref.id
                  }
                  onSelect={() => props.onSelect(marker)}
                  onCheck={(value) => {
                    const key = historySelectableKey(marker);
                    if (key === null) return;
                    setSelected((current) =>
                      value ? [...new Set([...current, key])] : current.filter((id) => id !== key)
                    );
                  }}
                />
              ))}
            </ol>
            {count < filtered.length ? (
              <ReviewButton
                className={`${reviewTextButtonClassName} review-history-more`}
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

function historyPresentationTargets(
  markers: readonly ReviewTelemetryMarker[],
  ids: readonly string[]
) {
  const selectedKeys = new Set(ids);
  const selected = markers.filter((marker) => selectedKeys.has(historySelectableKey(marker) ?? ''));
  return {
    selectedKeys,
    keyIds: selected.filter(isReviewKey).map((marker) => marker.ref.id),
    clickIds: selected
      .filter((marker) => isReviewClick(marker) && marker.focusPoint)
      .map((marker) => marker.ref.id),
    audioTargets: selected
      .map(reviewActionAudioTarget)
      .filter((target): target is ReviewActionAudioTarget => target !== null),
  };
}

/** Batch scope and return navigation stay visible independently of animation field groups. */
function HistoryBatchHeader({
  navigation,
  count,
  hidden,
  onBack,
}: {
  navigation: RefObject<HTMLDivElement | null>;
  count: number;
  hidden: number;
  onBack(): void;
}) {
  const locale = useAppLocale();
  return (
    <>
      <div ref={navigation} className="review-history-navigation">
        <ReviewButton
          label={translate('gallery.videoReview.historyBack')}
          className={`${reviewTextButtonClassName} !w-full justify-start`}
          onClick={onBack}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {translate('gallery.videoReview.historyBack')}
        </ReviewButton>
        <span className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.videoReview.historySelected')}: {formatNumber(count, {}, locale)}
        </span>
      </div>
      {hidden > 0 ? (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {formatNumber(hidden, {}, locale)}{' '}
          {translate('gallery.videoReview.historyHiddenSelected')}
        </p>
      ) : null}
    </>
  );
}

/** Selected click and key settings remain separate even in a mixed batch. */
function HistoryAnimationFields(props: {
  markers: readonly ReviewTelemetryMarker[];
  keySettings: ReadonlyMap<string, ReviewKeyAnimation>;
  clickIds: readonly string[];
  keyIds: readonly string[];
  settings: ReadonlyMap<string, ReviewClickAnimation>;
  keyAnimations?: readonly ReviewKeyAnimation[];
  audioTargets: readonly ReviewActionAudioTarget[];
  actionAudio?: readonly ReviewActionAudioSetting[];
  busy: boolean;
  onAudioChange?(
    targets: readonly ReviewActionAudioTarget[],
    patch: ReviewActionAudioPatch | null
  ): void;
  onAudition?: Parameters<typeof ReviewActionAudioFields>[0]['onAudition'];
  onStopAudition?: (() => void) | undefined;
  onChange(ids: readonly string[], patch: Partial<ReviewClickStyle> | null): void;
  onKeyChange?(ids: readonly string[], patch: ReviewKeyPatch | null): void;
}) {
  const { clickIds, settings } = props;
  const selectedClicks = props.markers.filter(
    (marker) => marker.ref.kind === 'action' && clickIds.includes(marker.ref.id)
  );
  const clickSections = clickIds.length
    ? reviewClickSections({
        values: clickIds.map((id) => settings.get(id) ?? REVIEW_CLICK_DEFAULT),
        gesture:
          selectedClicks.length === clickIds.length &&
          selectedClicks.every(
            (marker) =>
              !!marker.gesture &&
              (marker.gesture.type !== 'click' || marker.gesture.completion !== 'released')
          ),
        onChange: (patch) => props.onChange(clickIds, patch),
      })
    : [];
  const keySections = props.keyIds.length
    ? reviewKeySections({
        values: props.keyIds.map((id) => props.keySettings.get(id) ?? REVIEW_KEY_DEFAULT),
        onChange: (patch) => props.onKeyChange?.(props.keyIds, patch),
      })
    : [];
  const mixed = clickSections.length > 0 && keySections.length > 0;
  const sections = [
    ...clickSections.map((section) => ({
      ...section,
      id: `click:${section.id}`,
      label: mixed
        ? `${translate('gallery.videoReview.historyClicks')} · ${section.label}`
        : section.label,
    })),
    ...keySections.map((section) => ({
      ...section,
      id: `key:${section.id}`,
      label: mixed
        ? `${translate('gallery.videoReview.historyKeys')} · ${section.label}`
        : section.label,
    })),
    ...(props.onAudioChange && props.audioTargets.length
      ? [
          reviewActionAudioSection(
            <ReviewActionAudioFields
              targets={props.audioTargets}
              settings={props.actionAudio ?? []}
              busy={props.busy}
              onChange={props.onAudioChange}
              onAudition={props.onAudition}
              onStopAudition={props.onStopAudition}
            />
          ),
        ]
      : []),
  ];
  return (
    <div
      className="min-w-0"
      data-ui={
        clickIds.length
          ? 'gallery.videoReview.clickFields'
          : props.keyIds.length
            ? 'gallery.videoReview.keyFields'
            : 'gallery.videoReview.historyAudioFields'
      }
    >
      <ReviewInspectorSections sections={sections} />
    </div>
  );
}

/** Empty search results and missing capture coverage communicate different facts. */
function HistoryEmptyState(props: {
  searched: boolean;
  capabilities: RecordingTelemetryCapabilities | null | undefined;
}) {
  return (
    <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
      {props.searched ? (
        translate('gallery.videoReview.historyEmpty')
      ) : (
        <span className="flex flex-col" data-ui="gallery.videoReview.historyCoverage">
          {(['keyboard', 'mouse', 'cursor'] as const).map((family) => {
            const status = reviewHistoryCaptureStatus(props.capabilities, family);
            const label =
              family === 'keyboard'
                ? 'gallery.videoReview.historyKeyboard'
                : family === 'mouse'
                  ? 'gallery.videoReview.historyMouse'
                  : 'gallery.videoReview.historyCursor';
            return (
              <span
                key={family}
                data-history-coverage-family={family}
                data-history-coverage={status}
              >
                {translate(label)} · {translate(reviewHistoryCaptureLabel(status))}
              </span>
            );
          })}
        </span>
      )}
    </p>
  );
}
