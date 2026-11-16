import { useCallback, useMemo, useState, useRef, useLayoutEffect } from 'react';
import { ArrowUpRight, Search, Trash2, X } from 'lucide-react';
import { translate, useAppLocale } from '../../platform/i18n';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
import type { LoadedReview } from './use-session';
import type { useReviewEditorState } from './use-editor-state';
import type { useReviewAudio } from './use-review-audio';
import { HistoryCheckbox } from './action-history-list';
import { ReviewButton, reviewDeleteButtonClassName, reviewTimeLabel } from './controls';
import { reviewTrackItems, removeReviewTrackItems, type ReviewTrackItem } from './track-items';
import type { ReviewInspectorNavigation } from './inspector-navigation';
import './action-history.css';
import './track-items.css';

type State = Pick<
  ReturnType<typeof useReviewEditorState>,
  | 'snapshot'
  | 'advanced'
  | 'activeSelection'
  | 'setActiveSelection'
  | 'video'
  | 'seek'
  | 'session'
  | 'run'
  | 'flushAdvanced'
  | 'busy'
  | 'editing'
  | 'canStart'
  | 'beforeAction'
  | 'annotationEffects'
>;

/** Track collections share History row/checkbox styling and keep batch choice separate from opening. */
export function ReviewTrackItemsInspector(props: {
  track: QuickEditTrack;
  state: State;
  resource: LoadedReview;
  audio: Pick<ReturnType<typeof useReviewAudio>, 'assets'>;
  navigation: ReviewInspectorNavigation;
}) {
  const { state, track, resource, navigation } = props;
  const locale = useAppLocale();
  const selectLabel = translate('gallery.videoReview.trackItemsSelect');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [pending, setPending] = useState(false);
  const [limit, setLimit] = useState(50);
  const list = useRef<HTMLUListElement>(null);
  const rows = useMemo(
    () =>
      reviewTrackItems({
        track,
        document: { ...state.snapshot.document, advancedContent: state.advanced },
        source: resource.source,
        filename: resource.filename,
        assets: props.audio.assets,
        snapshots: state.snapshot.snapshot.workspace.effectSnapshots ?? [],
        locale,
      }),
    [
      track,
      state.snapshot.document,
      state.snapshot.snapshot.workspace.effectSnapshots,
      state.advanced,
      resource.source,
      resource.filename,
      props.audio.assets,
      locale,
    ]
  );
  const available = useMemo(
    () => new Set(rows.filter((row) => row.removable).map((row) => row.id)),
    [rows]
  );
  const checked = useMemo(() => selected.filter((id) => available.has(id)), [selected, available]);
  const needle = query.trim().toLocaleLowerCase(locale);
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        `${row.label} ${row.detail} ${reviewTimeLabel(row.start)}`
          .toLocaleLowerCase(locale)
          .includes(needle)
      ),
    [rows, needle, locale]
  );
  const matching = useMemo(
    () => filtered.filter((row) => row.removable).map((row) => row.id),
    [filtered]
  );
  const count = matching.filter((id) => checked.includes(id)).length;
  const disabled =
    state.busy ||
    state.editing.exporter.phase !== 'idle' ||
    pending ||
    state.annotationEffects.pending ||
    !!state.annotationEffects.gestureId;
  useLayoutEffect(() => {
    if (navigation.shown !== 'track' && navigation.shown !== 'speech') return;
    list.current?.querySelector<HTMLElement>('[data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [navigation.shown]);
  const open = (row: ReviewTrackItem) =>
    state.beforeAction(() => {
      state.video.current?.pause();
      state.setActiveSelection(row.selection);
      navigation.setSection(row.selection.kind === 'none' ? 'track' : 'selected');
      // Selection renders before the scroll target is inspected; no synthetic click mutates the item.
      requestAnimationFrame(() => {
        if (!row.timelineKey) return;
        const target = document.querySelector<HTMLElement>(
          [
            `[data-review-removal-key="${CSS.escape(row.timelineKey)}"]`,
            `[data-review-action-key="${CSS.escape(row.timelineKey)}"]`,
          ].join(',')
        );
        target?.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
    });
  const openCommand = useRef(open);
  useLayoutEffect(() => {
    openCommand.current = open;
  });
  const openRow = useCallback((row: ReviewTrackItem) => openCommand.current(row), []);
  const toggleRow = useCallback((id: string, value: boolean) => {
    setSelected((current) =>
      value ? [...new Set([...current, id])] : current.filter((key) => key !== id)
    );
  }, []);
  const remove = async () => {
    if (disabled || !checked.length || !state.canStart()) return;
    const ids = new Set(checked);
    setPending(true);
    try {
      await state.run(async () => {
        await state.annotationEffects.flush();
        await state.flushAdvanced();
        if (track === 'source') {
          for (const id of ids) {
            const before = state.session
              .getSnapshot()
              .document.edits.find((item) => item.id === id);
            if (before)
              await state.session.commit({
                id: crypto.randomUUID(),
                at: Date.now(),
                target: 'edit',
                before,
                after: null,
              });
          }
        } else {
          const before = state.session.getSnapshot().document.advancedContent;
          const after = removeReviewTrackItems(before, track, ids, resource.source.duration);
          if (before !== after)
            await state.session.commit({
              id: crypto.randomUUID(),
              at: Date.now(),
              target: 'advancedContent',
              before,
              after,
            });
        }
      });
    } finally {
      setPending(false);
    }
  };
  const activeSelection = state.activeSelection;
  const itemRows = useMemo(
    () =>
      filtered.slice(0, limit).map((row) => (
        <li
          key={row.id}
          className="review-history-row"
          data-active={
            (row.selection.kind !== 'none' &&
              JSON.stringify(row.selection) === JSON.stringify(activeSelection)) ||
            undefined
          }
          data-selected={checked.includes(row.id) || undefined}
          data-track-item={row.id}
        >
          {row.removable ? (
            <HistoryCheckbox
              label={[selectLabel, row.label, reviewTimeLabel(row.start)].join(' ')}
              checked={checked.includes(row.id)}
              onChange={(value) => toggleRow(row.id, value)}
            />
          ) : (
            <span className="w-4 shrink-0" aria-hidden="true" />
          )}
          <button type="button" className="review-track-items-open" onClick={() => openRow(row)}>
            <span className="review-history-target block truncate" title={row.label}>
              {row.label}
            </span>
            <span className="review-track-items-meta">
              <span className="shrink-0 tabular-nums">
                {reviewTimeLabel(row.start)}
                {row.end > row.start ? ` – ${reviewTimeLabel(row.end)}` : ''}
              </span>
              {row.detail ? <span className="truncate">{row.detail}</span> : null}
            </span>
            {row.inactive ? (
              <span className="text-xs text-[var(--sniptale-color-text-secondary)]">
                {translate('gallery.videoReview.trackItemInactive')}
              </span>
            ) : null}
          </button>
          <ArrowUpRight
            size={13}
            aria-hidden="true"
            className="shrink-0 text-[var(--sniptale-color-text-secondary)]"
          />
        </li>
      )),
    [filtered, limit, checked, activeSelection, selectLabel, openRow, toggleRow]
  );
  return (
    <fieldset
      disabled={disabled}
      className="review-track-items"
      data-ui="gallery.videoReview.trackItems"
      data-track={track}
    >
      <div className="review-track-items-toolbar">
        <label className="review-track-items-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            aria-label={translate('gallery.videoReview.trackItemsSearch')}
            placeholder={translate('gallery.videoReview.trackItemsSearch')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(50);
            }}
          />
        </label>
        <div className="review-history-selection">
          <HistoryCheckbox
            label={translate('gallery.videoReview.trackItemsSelectAll')}
            checked={!!matching.length && count === matching.length}
            mixed={count > 0 && count < matching.length}
            disabled={disabled || !matching.length}
            onChange={(value) =>
              setSelected(
                value
                  ? [...new Set([...checked, ...matching])]
                  : checked.filter((id) => !matching.includes(id))
              )
            }
          />
          <span className="min-w-0 flex-1 text-xs tabular-nums">
            {translate('gallery.videoReview.historySelected')}: {checked.length}
          </span>
          {checked.length ? (
            <>
              <ReviewButton
                label={translate('gallery.videoReview.trackItemsClearSelection')}
                onClick={() => setSelected([])}
              >
                <X size={15} aria-hidden="true" />
              </ReviewButton>
              <ReviewButton
                label={translate('gallery.videoReview.trackItemsDeleteSelected')}
                className={reviewDeleteButtonClassName}
                onClick={() => void remove()}
              >
                <Trash2 size={15} aria-hidden="true" />
              </ReviewButton>
            </>
          ) : null}
        </div>
      </div>
      <ul
        ref={list}
        className="review-track-items-results"
        aria-label={translate('gallery.videoReview.trackItemsList')}
      >
        {itemRows}
        {!filtered.length ? (
          <li
            className="px-2 py-4 text-xs text-[var(--sniptale-color-text-secondary)]"
            role="status"
          >
            {translate(
              rows.length
                ? 'gallery.videoReview.trackItemsNoMatches'
                : 'gallery.videoReview.trackItemsEmpty'
            )}
          </li>
        ) : null}
      </ul>
      {filtered.length > limit ? (
        <ReviewButton
          label={translate('gallery.videoReview.trackItemsMore')}
          onClick={() => setLimit(limit + 50)}
        />
      ) : null}
    </fieldset>
  );
}
