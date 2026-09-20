import { translate } from '../../platform/i18n';
import type { ButtonHTMLAttributes } from 'react';
import {
  getControlPrimaryButtonClassName,
  getControlSecondaryButtonClassName,
} from '@sniptale/ui/control-language';

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

/** Inline parameter selectors use the same geometry and typography as numeric rows. */
export const reviewSelectFieldClassName =
  '!min-h-8 !rounded-none !border-0 !bg-transparent !px-0 !py-0 ' +
  '[&>span]:!whitespace-normal [&>span]:!overflow-visible [&>span]:!text-xs';

/** Same control language as the gallery inspector, with a stable accessible label. */
export function ReviewButton({
  label,
  primary = false,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; primary?: boolean }) {
  const tone = primary
    ? getControlPrimaryButtonClassName()
    : getControlSecondaryButtonClassName({ density: 'compact' });
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...props}
      className={`${tone}
      !h-8 !min-h-8 !rounded-[var(--sniptale-radius-sm)]
      !px-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)] ${className}`}
    >
      {children ?? label}
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
