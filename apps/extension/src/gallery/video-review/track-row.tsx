import { createPortal } from 'react-dom';
import { useReviewTrackHeader } from './timeline-panes';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { createContext, useContext, type ReactNode } from 'react';
import type { QuickEditTrack, QuickEditUiState } from '../../features/video/review/advanced/types';
import { reviewTrackEnabled } from '../../features/video/review/advanced/track-controls';
import { ChevronsDownUp, ChevronsUpDown, Lock, Unlock } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { ReviewButton, reviewCompactTrackButtonClassName } from './controls';
import './track-row.css';

/** Interval lanes share symmetric insets and row pitch in each density. */
export function reviewTrackMetrics(compact = false) {
  const body = compact ? 24 : 32;
  return { body, step: body + 4, inset: 2 };
}

type ReviewTrackControlsState = {
  ui: QuickEditUiState;
  configuring: boolean;
  busy: boolean;
  unavailable: Partial<Record<QuickEditTrack, boolean>>;
  setEnabled(track: Exclude<QuickEditTrack, 'source'>, enabled: boolean): void;
  setLocked(track: QuickEditTrack, locked: boolean): void;
};
const TrackControlsContext = createContext<ReviewTrackControlsState | null>(null);

/** Shares lane chrome without owning persisted state or edit admission. */
export const ReviewTrackControlsProvider = TrackControlsContext.Provider;

/** UI affordance only; session admission remains authoritative for every mutation. */
export function reviewTrackGestureLocked(node: Element) {
  return node.closest('[data-review-track-locked="true"]') !== null;
}

type TrackRowProps = {
  label: string;
  track?: QuickEditTrack;
  placeholder?: boolean;
  ruler?: boolean;
  /** Muted output remains editable; controls and selection contours stay distinct. */
  muted?: boolean;
  icon?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
};

/** Shared row geometry keeps track controls outside the time-coordinate surface. */
export function ReviewTrackRow(props: TrackRowProps) {
  const controls = useContext(TrackControlsContext);
  const track = props.track;
  const unavailable = !!(track && controls?.unavailable[track]);
  const enabled =
    !!(track && controls && reviewTrackEnabled(controls.ui, track)) &&
    !unavailable &&
    !props.placeholder;
  const locked = !!(track && controls?.ui.lockedTracks?.[track]);
  const muted = !!props.muted || !!(track && controls && !enabled);
  const visible =
    !(props.placeholder && !controls?.configuring) &&
    !(track && controls && !controls.configuring && !enabled);
  const placement = useReviewTrackHeader(visible, !!props.ruler);
  if (!visible) return null;
  const header = (
    <ReviewTrackHeader
      row={{ ...props, muted }}
      controls={controls}
      enabled={enabled}
      locked={locked}
      unavailable={unavailable}
    />
  );
  return (
    <div
      ref={placement.body}
      data-review-track={track}
      data-review-track-locked={locked}
      data-review-track-muted={muted ? 'true' : 'false'}
      className={[
        placement.header
          ? 'grid grid-cols-1'
          : 'grid grid-cols-[var(--review-track-gutter,192px)_minmax(0,1fr)]',
        track && track !== 'source' ? 'mt-1' : '',
      ].join(' ')}
    >
      {placement.header ? createPortal(header, placement.header) : header}
      <div data-review-track-content className="relative min-w-0">
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
  locked,
  unavailable,
}: {
  row: Pick<TrackRowProps, 'track' | 'muted' | 'label' | 'icon' | 'controls' | 'ruler'>;
  controls: ReviewTrackControlsState | null;
  enabled: boolean;
  locked: boolean;
  unavailable: boolean;
}) {
  const track = props.track;
  return (
    <div
      data-review-header-track={track}
      data-review-header-muted={props.muted ? 'true' : 'false'}
      data-ui="gallery.videoReview.trackHeader"
      className="sticky left-0 z-30 flex h-full min-w-0 items-center gap-1 border-r
          border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] px-2"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {track && track !== 'source' && controls?.configuring ? (
        <ProductGlassSwitch
          className="sniptale-compact-switch shrink-0"
          role="switch"
          aria-checked={enabled}
          on={enabled}
          disabled={unavailable || controls.busy}
          aria-label={`${translate('gallery.videoReview.trackEnabled')}: ${props.label}`}
          title={unavailable ? translate('gallery.videoReview.trackUnavailable') : undefined}
          onClick={() => controls.setEnabled(track, !enabled)}
        />
      ) : null}
      {props.icon}
      {!props.ruler ? (
        <>
          <span className="min-w-0 flex-1 text-[11px]" title={props.label}>
            <span data-track-label className="inline-block whitespace-nowrap">
              {props.label}
            </span>
          </span>
          <div data-track-controls className="flex shrink-0 items-center">
            {props.controls}
            {track && controls ? (
              <ReviewButton
                label={`${translate(
                  locked ? 'gallery.videoReview.trackUnlock' : 'gallery.videoReview.trackLock'
                )}: ${props.label}`}
                aria-pressed={locked}
                disabled={controls.busy || unavailable}
                className={`${reviewCompactTrackButtonClassName} !h-6 !min-h-6 !w-6 !px-1`}
                onClick={() => controls.setLocked(track, !locked)}
              >
                {locked ? <Lock size={14} aria-hidden /> : <Unlock size={14} aria-hidden />}
              </ReviewButton>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Removed source intervals stay visible, but cannot look like sounding/active clip content. */
export function ReviewTrackCuts({
  projection,
}: {
  projection?: import('./track-projection').ReviewTrackProjection | undefined;
}) {
  return projection?.cuts.map((cut) => (
    <div
      key={cut.sourceStart}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-10 bg-[var(--sniptale-color-surface-panel)]
        opacity-80 border-x border-dashed border-[var(--sniptale-color-border-soft)]"
      style={{
        left: `${(cut.sourceStart / projection.duration) * 100}%`,
        width: `${((cut.sourceEnd - cut.sourceStart) / projection.duration) * 100}%`,
      }}
    />
  ));
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
