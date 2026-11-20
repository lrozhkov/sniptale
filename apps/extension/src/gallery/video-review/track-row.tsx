import { ReviewTimelineMultiSelectionContext } from './selection-actions';
import { createPortal } from 'react-dom';
import { useReviewTrackHeader } from './timeline-panes';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { QuickEditTrack, QuickEditUiState } from '../../features/video/review/advanced/types';
import { reviewTrackEnabled } from '../../features/video/review/advanced/track-controls';
import {
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
  Pin,
  PinOff,
  type LucideIcon,
} from 'lucide-react';
import { translate, useAppLocale } from '../../platform/i18n';
import { ReviewButton, reviewCompactTrackButtonClassName } from './controls';
import type { useReviewTrackOrder } from './track-order';
import './track-row.css';

/** Interval lanes share symmetric insets and row pitch in each density. */
export function reviewTrackMetrics(compact = false) {
  const body = compact ? 24 : 32;
  return { body, step: body + 4, inset: 2 };
}

type ReviewTrackControlsState = {
  ui: QuickEditUiState;
  configuring: boolean;
  selectedTrack?: QuickEditTrack | null;
  selectable?: Partial<Record<QuickEditTrack, boolean>>;
  selectTrack?(track: QuickEditTrack): void;
  focusItemTrack?(track: QuickEditTrack): void;
  busy: boolean;
  unavailable: Partial<Record<QuickEditTrack, boolean>>;
  setEnabled(track: Exclude<QuickEditTrack, 'source'>, enabled: boolean): void;
  order?: ReturnType<typeof useReviewTrackOrder>;
};
type LaneControls = Pick<
  ReviewTrackControlsState,
  'busy' | 'configuring' | 'selectTrack' | 'focusItemTrack' | 'setEnabled'
> & {
  enabled: boolean;
  unavailable: boolean;
  selectable: boolean;
  selectedTrack: QuickEditTrack | null;
  pinned: boolean;
  order?: Pick<ReturnType<typeof useReviewTrackOrder>, 'interaction' | 'togglePin'>;
};

/** A mounted timeline publishes lane flags separately from its latest command receivers. */
function createTrackControlsStore(initial: ReviewTrackControlsState | null) {
  let current = initial;
  const snapshots = new Map<QuickEditTrack, LaneControls | null>();
  const listeners = new Map<QuickEditTrack, Set<() => void>>();
  const selectTrack = (track: QuickEditTrack) => current?.selectTrack?.(track);
  const focusItemTrack = (track: QuickEditTrack) => current?.focusItemTrack?.(track);
  const setEnabled: ReviewTrackControlsState['setEnabled'] = (track, enabled) =>
    current?.setEnabled(track, enabled);
  const order: NonNullable<LaneControls['order']> = {
    togglePin: (track) => current?.order?.togglePin(track),
    interaction: (track) => ({
      onPointerDown: (event) => current?.order?.interaction(track).onPointerDown(event),
      onKeyDown: (event) => current?.order?.interaction(track).onKeyDown(event),
    }),
  };
  const describe = (track: QuickEditTrack): LaneControls | null =>
    current
      ? {
          enabled: reviewTrackEnabled(current.ui, track),
          unavailable: !!current.unavailable[track],
          selectable: !!current.selectable?.[track],
          selectedTrack: current.selectedTrack === track ? track : null,
          configuring: current.configuring,
          busy: current.busy,
          pinned: current.order?.pinned.has(track) ?? false,
          setEnabled,
          ...(current.selectTrack ? { selectTrack } : {}),
          ...(current.focusItemTrack ? { focusItemTrack } : {}),
          ...(current.order ? { order } : {}),
        }
      : null;
  return {
    read(track: QuickEditTrack) {
      if (snapshots.has(track)) return snapshots.get(track) ?? null;
      const snapshot = describe(track);
      snapshots.set(track, snapshot);
      return snapshot;
    },
    subscribe(track: QuickEditTrack, listener: () => void) {
      let lane = listeners.get(track);
      if (!lane) {
        lane = new Set();
        listeners.set(track, lane);
      }
      lane.add(listener);
      return () => {
        lane.delete(listener);
      };
    },
    update(value: ReviewTrackControlsState | null) {
      current = value;
      const changed: QuickEditTrack[] = [];
      const fields = [
        'enabled',
        'unavailable',
        'selectable',
        'selectedTrack',
        'configuring',
        'busy',
        'pinned',
        'selectTrack',
        'focusItemTrack',
        'order',
      ] as const;
      for (const [track, previous] of snapshots) {
        const next = describe(track);
        if (
          previous === next ||
          (previous && next && fields.every((field) => previous[field] === next[field]))
        )
          continue;
        snapshots.set(track, next);
        changed.push(track);
      }
      // Update every cached snapshot before a subscriber can read another lane.
      for (const track of changed)
        for (const listener of [...(listeners.get(track) ?? [])]) listener();
    },
  };
}

const TrackControlsContext = createContext<ReturnType<typeof createTrackControlsStore> | null>(
  null
);

/** Shares committed lane flags and stable commands within one timeline lifetime. */
export function ReviewTrackControlsProvider({
  value,
  children,
}: {
  value: ReviewTrackControlsState | null;
  children?: ReactNode;
}) {
  const [store] = useState(() => createTrackControlsStore(value));
  useLayoutEffect(() => store.update(value), [store, value]);
  return <TrackControlsContext.Provider value={store}>{children}</TrackControlsContext.Provider>;
}

function useTrackControls(track: QuickEditTrack | undefined) {
  const store = useContext(TrackControlsContext);
  const subscribe = useCallback(
    (listener: () => void) => (store && track ? store.subscribe(track, listener) : () => {}),
    [store, track]
  );
  const read = useCallback(() => (store && track ? store.read(track) : null), [store, track]);
  return useSyncExternalStore(subscribe, read, read);
}

type TrackVisibilityProps = {
  track: QuickEditTrack;
  label: string;
  enabled: boolean;
  icon: LucideIcon;
  disabled?: boolean | undefined;
  className?: string | undefined;
  onToggle(): void;
};

/** Visibility actions cannot bypass an off lane master; commands use committed receivers. */
export function ReviewTrackVisibilityButton({ track, onToggle, ...props }: TrackVisibilityProps) {
  const controls = useTrackControls(track);
  const unavailable = controls && (!controls.enabled || controls.unavailable);
  const receiver = useRef(onToggle);
  useLayoutEffect(() => {
    receiver.current = onToggle;
  }, [onToggle]);
  const toggle = useCallback(() => receiver.current(), []);
  return (
    <ReviewTrackVisibilityPresentation
      {...props}
      disabled={props.disabled || !!unavailable}
      onToggle={toggle}
    />
  );
}

/** Visual flags and the current glyph change independently from command closures. */
const ReviewTrackVisibilityPresentation = memo(function ReviewTrackVisibilityPresentation({
  enabled,
  icon: Icon,
  onToggle,
  ...props
}: Omit<TrackVisibilityProps, 'track'>) {
  return (
    <ReviewButton {...props} aria-pressed={enabled} onClick={onToggle}>
      <Icon size={14} aria-hidden="true" />
    </ReviewButton>
  );
});

type TrackRowProps = {
  label: string;
  track?: QuickEditTrack;
  placeholder?: boolean;
  ruler?: boolean;
  /** Muted output remains editable; controls and selection contours stay distinct. */
  muted?: boolean;
  icon?: LucideIcon;
  /** The ruler owns arbitrary live controls instead of a track glyph. */
  rulerContent?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
};

/** Shared row geometry keeps track controls outside the time-coordinate surface. */
export function ReviewTrackRow(props: TrackRowProps) {
  const track = props.track;
  const controls = useTrackControls(track);
  const unavailable = !!(track && controls?.unavailable);
  const enabled = !!(track && controls?.enabled) && !unavailable && !props.placeholder;
  const multiSelection = useContext(ReviewTimelineMultiSelectionContext);
  const muted = !!props.muted || !!(track && controls && !enabled);
  const visible =
    !(props.placeholder && !controls?.configuring) &&
    !(track && controls && !controls.configuring && !enabled);
  const placement = useReviewTrackHeader(visible, !!props.ruler);
  if (!visible) return null;
  const header = (
    <ReviewTrackHeader
      row={{
        track: props.track,
        label: props.label,
        icon: props.icon,
        controls: props.controls,
        ruler: props.ruler,
        rulerContent: props.rulerContent,
        muted,
      }}
      controls={controls}
      enabled={enabled}
      unavailable={unavailable}
    />
  );
  return (
    <div
      ref={placement.body}
      data-review-track={track}
      data-review-track-selected={!!track && controls?.selectedTrack === track ? 'true' : 'false'}
      data-review-track-muted={muted ? 'true' : 'false'}
      className={[
        placement.header
          ? 'grid grid-cols-1'
          : 'grid grid-cols-[var(--review-track-gutter,192px)_minmax(0,1fr)]',
        track && track !== 'source' ? 'mt-1' : '',
      ].join(' ')}
    >
      {placement.header ? createPortal(header, placement.header) : header}
      <div
        data-review-track-content
        className="relative min-w-0"
        onKeyDownCapture={(event) => {
          if (
            track &&
            (event.key === 'Enter' || event.key === ' ') &&
            event.target instanceof Element &&
            event.target.closest('[data-review-removal-key],button,[role="button"]')
          )
            controls?.focusItemTrack?.(track);
        }}
        onPointerDownCapture={(event) => {
          if (!track || (!enabled && !controls?.selectable) || controls?.busy || event.button !== 0)
            return;
          if (
            event.target instanceof Element &&
            event.target.closest('[data-review-removal-key],button,[role="button"]')
          ) {
            controls?.focusItemTrack?.(track);
            multiSelection?.captureModified(event);
            return;
          }
          if (
            !(event.target instanceof Element) ||
            event.target.closest(
              'button,input,select,textarea,a,[role="button"],[data-audio-id],[data-text-id],[data-review-removal-key]'
            )
          )
            return;
          // Empty-space gestures on the active lane retain its drawing tool and inspector.
          if (controls?.selectedTrack === track) return;
          controls?.selectTrack?.(track);
        }}
      >
        {props.children}
      </div>
    </div>
  );
}

/** Header controls have the same admission and presentation in either pane layout. */
function ReviewTrackHeader({
  row: props,
  controls,
  enabled,
  unavailable,
}: {
  row: {
    track: TrackRowProps['track'];
    muted: TrackRowProps['muted'];
    label: TrackRowProps['label'];
    icon: TrackRowProps['icon'];
    controls: TrackRowProps['controls'];
    ruler: TrackRowProps['ruler'];
    rulerContent: TrackRowProps['rulerContent'];
  };
  controls: LaneControls | null;
  enabled: boolean;
  unavailable: boolean;
}) {
  const track = props.track;
  return (
    <div
      data-review-header-track={track}
      data-review-header-selected={!!track && controls?.selectedTrack === track ? 'true' : 'false'}
      data-review-header-muted={props.muted ? 'true' : 'false'}
      data-ui="gallery.videoReview.trackHeader"
      className="sticky left-0 z-30 flex h-full min-w-0 items-center gap-1 border-r
          border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] px-2"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {props.ruler ? (
        props.rulerContent
      ) : (
        <>
          <ReviewTrackHeaderIdentity
            track={track}
            label={props.label}
            icon={props.icon}
            muted={props.muted}
            controls={controls}
            enabled={enabled}
            unavailable={unavailable}
          />
          <div data-track-controls className="flex shrink-0 items-center">
            {props.controls}
          </div>
        </>
      )}
    </div>
  );
}

/** Lane identity changes independently from live item content and lane action receivers. */
const ReviewTrackHeaderIdentity = memo(function ReviewTrackHeaderIdentity({
  controls,
  enabled,
  unavailable,
  ...props
}: {
  track: TrackRowProps['track'];
  label: TrackRowProps['label'];
  icon: TrackRowProps['icon'];
  muted: TrackRowProps['muted'];
  controls: LaneControls | null;
  enabled: boolean;
  unavailable: boolean;
}) {
  useAppLocale();
  const track = props.track;
  const Icon = props.icon;
  const icon = Icon ? <Icon size={14} aria-hidden="true" /> : null;
  const PinIcon = controls?.pinned ? Pin : PinOff;
  return (
    <>
      {track && controls?.configuring && controls.order ? (
        <ReviewButton
          label={`${translate('gallery.videoReview.trackReorder')}: ${props.label}`}
          disabled={controls.busy}
          className={`${reviewCompactTrackButtonClassName} review-track-reorder !h-6 !min-h-6 !w-5 !px-0`}
          {...controls.order.interaction(track)}
        >
          <GripVertical size={12} aria-hidden />
        </ReviewButton>
      ) : null}
      {track && controls?.configuring ? (
        <ProductGlassSwitch
          className="sniptale-compact-switch review-track-switch shrink-0"
          role="switch"
          aria-checked={enabled}
          on={enabled}
          disabled={track === 'source' || unavailable || controls.busy}
          aria-label={`${translate('gallery.videoReview.trackEnabled')}: ${props.label}`}
          title={unavailable ? translate('gallery.videoReview.trackUnavailable') : undefined}
          onClick={() => {
            if (track !== 'source') controls.setEnabled(track, !enabled);
          }}
        />
      ) : null}
      {track && controls?.configuring && controls.order ? (
        <ReviewButton
          label={`${translate('gallery.videoReview.trackPinned')}: ${props.label}`}
          aria-pressed={controls.pinned}
          disabled={controls.busy}
          className={`${reviewCompactTrackButtonClassName} review-track-pin !h-6 !min-h-6 !w-6 !px-1`}
          onClick={() => controls.order?.togglePin(track)}
        >
          <PinIcon size={12} aria-hidden />
        </ReviewButton>
      ) : null}
      {track && controls?.selectTrack ? (
        <button
          type="button"
          data-review-track-select
          aria-pressed={controls.selectedTrack === track}
          disabled={(!enabled && !controls.selectable) || controls.busy}
          className="review-track-select flex min-w-0 flex-1 items-center gap-1 text-left"
          title={props.label}
          onClick={() => controls.selectTrack?.(track)}
        >
          {icon}
          <span className="min-w-0 text-[11px]">
            <span data-track-label className="inline-block whitespace-nowrap">
              {props.label}
            </span>
          </span>
        </button>
      ) : (
        icon
      )}
      {!controls?.selectTrack ? (
        <span className="min-w-0 flex-1 text-[11px]" title={props.label}>
          <span data-track-label className="inline-block whitespace-nowrap">
            {props.label}
          </span>
        </span>
      ) : null}
    </>
  );
});

/** Removed source intervals stay visible, but cannot look like sounding/active clip content. */
export function ReviewTrackCuts({
  projection,
}: {
  projection?: import('./track-projection').ReviewTrackProjection | undefined;
}) {
  return projection?.cuts.map((cut) => {
    const left = projection.focus.position(cut.sourceStart);
    const right = projection.focus.position(cut.sourceEnd, 'end');
    return (
      <div
        key={cut.sourceStart}
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 z-10 bg-[var(--sniptale-color-surface-panel)]
          opacity-80 border-x border-dashed border-[var(--sniptale-color-border-soft)]"
        style={{ left: `${left * 100}%`, width: `${(right - left) * 100}%` }}
      />
    );
  });
}

/** Timeline density is a view preference, separate from enabled/editing state. */
export function ReviewTrackHeightButton(props: { compact: boolean; onToggle(): void }) {
  return (
    <ReviewButton
      label={translate('gallery.videoReview.compactTrackHeight')}
      title={translate(
        props.compact
          ? 'gallery.videoReview.normalTrackHeight'
          : 'gallery.videoReview.compactTrackHeight'
      )}
      aria-pressed={props.compact}
      className={`${reviewCompactTrackButtonClassName} !h-6 !min-h-6 !w-6 !px-1`}
      onClick={props.onToggle}
    >
      {props.compact ? (
        <ChevronsUpDown size={14} aria-hidden />
      ) : (
        <ChevronsDownUp size={14} aria-hidden />
      )}
    </ReviewButton>
  );
}
