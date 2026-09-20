import { translate } from '../../platform/i18n';
import { ChevronRight } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import {
  getControlPrimaryButtonClassName,
  getControlSecondaryButtonClassName,
} from '@sniptale/ui/control-language';

/** Timeline objects share a thin selection border, never an accent fill. */
export function reviewTimelineItemTone(selected: boolean): string {
  return selected
    ? 'bg-transparent border-[var(--sniptale-color-accent)] text-[var(--sniptale-color-accent)]'
    : 'bg-transparent border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-secondary)]';
}

const iconButtonBase =
  '!h-8 !w-8 !min-h-8 !shadow-none !border !border-solid !border-transparent ' +
  '!bg-transparent !text-[var(--sniptale-color-text-secondary)] ' +
  'enabled:hover:!border-[var(--sniptale-color-border-strong)] ' +
  'enabled:hover:!text-[var(--sniptale-color-text-primary)] enabled:hover:[&_svg]:stroke-[2.5] ' +
  'disabled:!text-[var(--sniptale-color-text-muted)] disabled:!bg-transparent disabled:opacity-40';

/** Selected tools use an accent icon; only hover draws a border. */
export const reviewIconButtonClassName =
  iconButtonBase +
  ' aria-pressed:!text-[var(--sniptale-color-accent)] ' +
  'enabled:aria-pressed:hover:!text-[var(--sniptale-color-accent-emphasis)]';

/** Lane status highlights suppression; aria-pressed still reports whether the lane is enabled. */
export const reviewTrackStatusButtonClassName =
  iconButtonBase +
  ' enabled:aria-[pressed=false]:!text-[var(--sniptale-color-accent)] ' +
  'enabled:aria-[pressed=false]:hover:!text-[var(--sniptale-color-accent-emphasis)]';

/** Labelled commands share the transparent timeline-button states without a fixed icon width. */
export const reviewTextButtonClassName =
  reviewIconButtonClassName + ' !w-auto gap-2 !text-xs [&_svg]:shrink-0';

/** Reversible delete actions keep the same geometry with a distinct danger tone. */
export const reviewDeleteButtonClassName =
  reviewTextButtonClassName +
  ' !text-[var(--sniptale-color-danger)] enabled:hover:!text-[var(--sniptale-color-danger)]';

/** Read-only timing uses the same label/value row as editable inspector parameters. */
export function ReviewInterval({ start, end }: { start: number; end: number }) {
  return (
    <div
      className="flex min-h-8 items-center justify-between gap-3 py-0.5"
      data-ui="gallery.videoReview.interval"
    >
      <span className="text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
        {translate(
          start === end ? 'gallery.videoReview.timePosition' : 'gallery.videoReview.interval'
        )}
      </span>
      <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-[var(--sniptale-color-text-primary)]">
        {start === end
          ? reviewTimeLabel(start)
          : `${reviewTimeLabel(start)} – ${reviewTimeLabel(end)}`}
      </span>
    </div>
  );
}

/** Inline parameter selectors use the same geometry and typography as numeric rows. */
export const reviewSelectFieldClassName =
  '!min-h-8 !rounded-none !border-0 !bg-transparent !px-0 !py-0 ' +
  '[&>span]:!whitespace-normal [&>span]:!overflow-visible [&>span]:!text-xs ' +
  '[&>span]:!font-semibold [&>span]:!text-[var(--sniptale-color-text-secondary)] ' +
  '[&>div]:!w-auto [&>div]:!max-w-[65%]';

/** Same control language as the gallery inspector, with a stable accessible label. */
export function ReviewButton({
  label,
  primary = false,
  toolbarLabel,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  primary?: boolean;
  toolbarLabel?: string | undefined;
}) {
  const tone = primary
    ? getControlPrimaryButtonClassName()
    : getControlSecondaryButtonClassName({ density: 'compact' });
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-review-toolbar-button={toolbarLabel === undefined ? undefined : ''}
      {...props}
      className={`${tone}
      !h-8 !min-h-8 !rounded-[var(--sniptale-radius-sm)]
      !px-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)] ${className}`}
    >
      {children ?? label}
      {toolbarLabel !== undefined ? (
        <span data-review-toolbar-label aria-hidden="true">
          {toolbarLabel}
        </span>
      ) : null}
    </button>
  );
}

/** Source timecode shared by timeline, selection labels and the comment feed. */
export function reviewTimeLabel(time: number): string {
  const tenths = Math.max(0, Math.round(time * 10));
  const minutes = Math.floor(tenths / 600);
  const seconds = ((tenths % 600) / 10).toFixed(1);
  return minutes ? `${minutes}:${seconds.padStart(4, '0')}` : seconds;
}

/** Recorded event identifiers are metadata; the timeline uses product language. */
export function reviewEventLabel(kind: string): string {
  const keys = {
    CLICK: 'gallery.videoReview.eventClick',
    DOUBLE_CLICK: 'gallery.videoReview.eventDoubleClick',
    SCROLL: 'gallery.videoReview.eventScroll',
    KEY: 'gallery.videoReview.eventKey',
    PAUSE: 'gallery.videoReview.eventPause',
    CALLOUT: 'gallery.videoReview.eventCallout',
    typing: 'gallery.videoReview.eventTyping',
    'cursor-idle': 'gallery.videoReview.eventCursorIdle',
    'static-frame': 'gallery.videoReview.eventStatic',
    cursor: 'gallery.videoReview.eventCursor',
  } as const;
  return translate(
    Object.hasOwn(keys, kind) ? keys[kind as keyof typeof keys] : 'gallery.videoReview.telemetry'
  );
}

/** Rare numeric adjustments stay keyboard-accessible behind a native disclosure. */
export function ReviewDetails({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group min-w-0">
      <summary
        className="flex cursor-pointer list-none items-center gap-2 py-2 text-xs font-semibold
        text-[var(--sniptale-color-text-secondary)] hover:text-[var(--sniptale-color-text-primary)]
        focus-visible:outline focus-visible:outline-[var(--sniptale-color-accent)] [&::-webkit-details-marker]:hidden"
      >
        <ChevronRight size={14} aria-hidden="true" className="shrink-0 group-open:rotate-90" />
        {label}
      </summary>
      <div className="space-y-3 pt-2">{children}</div>
    </details>
  );
}
