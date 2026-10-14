import { ProductToggle } from '@sniptale/ui/product-form-controls';
import { createContext, useContext, type ReactNode } from 'react';
import type { QuickEditTrack, QuickEditUiState } from '../../features/video/review/advanced/types';
import { reviewTrackEnabled } from '../../features/video/review/advanced/track-controls';
import { Rows3, Lock, Unlock } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { ReviewButton, reviewCompactTrackButtonClassName } from './controls';
import './track-row.css';

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

/** Shared row geometry keeps track controls outside the time-coordinate surface. */
export function ReviewTrackRow(props: {
  label: string;
  track?: QuickEditTrack;
  placeholder?: boolean;
  /** Muted output remains editable; controls and selection contours stay distinct. */
  muted?: boolean;
  icon?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
}) {
  const controls = useContext(TrackControlsContext);
  const track = props.track;
  if (props.placeholder && !controls?.configuring) return null;
  const unavailable = !!(track && controls?.unavailable[track]);
  const enabled =
    !!(track && controls && reviewTrackEnabled(controls.ui, track)) &&
    !unavailable &&
    !props.placeholder;
  const locked = !!(track && controls?.ui.lockedTracks?.[track]);
  if (track && controls && !controls.configuring && !enabled) return null;
  return (
    <div
      data-review-track={track}
      data-review-track-locked={locked}
      data-review-track-muted={props.muted ? 'true' : 'false'}
      className="grid grid-cols-[var(--review-track-gutter,192px)_minmax(0,1fr)]"
    >
      <div
        data-ui="gallery.videoReview.trackHeader"
        className="sticky left-0 z-30 flex min-w-0 items-center gap-1 border-r
          border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] px-2"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {track && track !== 'source' && controls?.configuring ? (
          <ProductToggle
            size="sm"
            checked={enabled}
            disabled={unavailable || controls.busy}
            aria-label={`${translate('gallery.videoReview.trackEnabled')}: ${props.label}`}
            title={unavailable ? translate('gallery.videoReview.trackUnavailable') : undefined}
            onClick={() => controls.setEnabled(track, !enabled)}
          />
        ) : null}
        {props.icon}
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
      </div>
      <div data-review-track-content className="relative min-w-0">
        {props.children}
      </div>
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
      <Rows3 size={14} aria-hidden />
    </ReviewButton>
  );
}
