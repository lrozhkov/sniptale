import type { MouseEventHandler, ReactNode } from 'react';
import { Check } from 'lucide-react';

function getGallerySelectionButtonClassName(selected: boolean, alwaysVisible = false) {
  return [
    'relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full',
    'border border-transparent bg-transparent',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
    selected || alwaysVisible
      ? 'opacity-100'
      : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
  ].join(' ');
}

/** Neutral selection mark inside a stable 32px collection hit target. */
function getGallerySelectionMarkClassName(selected: boolean) {
  return [
    'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
    selected
      ? [
          'border-[var(--sniptale-color-text-primary)] bg-[var(--sniptale-color-text-primary)]',
          'text-[var(--sniptale-color-surface-panel)]',
        ].join(' ')
      : 'border-[var(--sniptale-color-text-secondary)] bg-[var(--sniptale-color-surface-input)]',
  ].join(' ');
}

/** Collection selection keeps its neutral mark inside a stable native button target. */
export function GallerySelectionButton(props: {
  selected: boolean;
  alwaysVisible?: boolean;
  idleIcon?: ReactNode;
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.selected}
      onClick={props.onClick}
      className={getGallerySelectionButtonClassName(
        props.selected,
        props.alwaysVisible || !!props.idleIcon
      )}
    >
      {props.idleIcon && !props.selected ? (
        <span
          data-ui="gallery.selection.idle"
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center
            group-hover/gallery-caption:opacity-0 group-focus-within/gallery-caption:opacity-0"
        >
          {props.idleIcon}
        </span>
      ) : null}
      <span
        data-ui="gallery.selection.mark"
        className={[
          getGallerySelectionMarkClassName(props.selected),
          props.idleIcon && !props.selected
            ? 'opacity-0 group-hover/gallery-caption:opacity-100 group-focus-within/gallery-caption:opacity-100'
            : 'opacity-100',
        ].join(' ')}
        aria-hidden="true"
      >
        {props.selected ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
      </span>
    </button>
  );
}
