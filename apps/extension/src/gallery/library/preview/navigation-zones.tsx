import { ChevronLeft, ChevronRight } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { PreviewPanelProps } from './types';

export function PreviewNavigationZone({
  direction,
  navigation,
}: {
  direction: 'previous' | 'next';
  navigation: NonNullable<PreviewPanelProps['navigation']>;
}) {
  const previous = direction === 'previous';
  const disabled = previous ? !navigation.hasPrevious : !navigation.hasNext;

  return (
    <button
      type="button"
      data-ui={`gallery.preview.navigationZone.${direction}`}
      aria-label={translate(previous ? 'gallery.preview.previous' : 'gallery.preview.next')}
      title={translate(previous ? 'gallery.preview.previous' : 'gallery.preview.next')}
      disabled={disabled}
      onClick={previous ? navigation.onPrevious : navigation.onNext}
      className={`gallery-preview-navigation-${direction} group relative flex h-full w-6 shrink-0
        cursor-pointer items-center justify-center
        bg-transparent text-[var(--sniptale-color-text-secondary)] transition-colors
        hover:text-[var(--sniptale-color-text-primary)]
        focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-inset focus-visible:ring-[var(--sniptale-color-accent)]
        disabled:cursor-default disabled:hover:bg-transparent
        disabled:hover:text-[var(--sniptale-color-text-secondary)]`}
    >
      {previous ? (
        <ChevronLeft
          aria-hidden="true"
          className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100
            group-focus-visible:opacity-100 group-disabled:opacity-0
            [@media(hover:none)]:opacity-60"
        />
      ) : (
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100
            group-focus-visible:opacity-100 group-disabled:opacity-0
            [@media(hover:none)]:opacity-60"
        />
      )}
    </button>
  );
}
