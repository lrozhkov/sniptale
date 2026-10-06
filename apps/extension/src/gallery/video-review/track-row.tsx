import type { ReactNode } from 'react';
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { ReviewButton, reviewCompactTrackButtonClassName } from './controls';
import './track-row.css';

/** Shared row geometry keeps track controls outside the time-coordinate surface. */
export function ReviewTrackRow(props: {
  label: string;
  /** Muted output remains editable; controls and selection contours stay distinct. */
  muted?: boolean;
  icon?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      data-review-track-muted={props.muted ? 'true' : 'false'}
      className="grid grid-cols-[var(--review-track-gutter,192px)_minmax(0,1fr)]"
    >
      <div
        data-ui="gallery.videoReview.trackHeader"
        className="sticky left-0 z-30 flex min-w-0 items-center gap-1 border-r
          border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] px-2"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {props.icon}
        <span className="min-w-0 flex-1 text-[11px]" title={props.label}>
          <span data-track-label className="inline-block whitespace-nowrap">
            {props.label}
          </span>
        </span>
        <div data-track-controls className="flex shrink-0 items-center">
          {props.controls}
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
      {props.compact ? (
        <ChevronsUpDown size={14} aria-hidden />
      ) : (
        <ChevronsDownUp size={14} aria-hidden />
      )}
    </ReviewButton>
  );
}
