import type { CSSProperties } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { translate } from '../../../platform/i18n';

export const GALLERY_LIST_LAYOUT_STYLE = {
  gridTemplateColumns:
    '32px 32px 128px minmax(160px, 1.35fr) 132px minmax(220px, 2fr) minmax(100px, 1fr) 88px',
} satisfies CSSProperties;

export function GalleryListHeader() {
  return (
    <div
      data-ui="gallery.list.header"
      style={GALLERY_LIST_LAYOUT_STYLE}
      className={[
        'sticky top-0 z-10 grid h-12 items-center gap-3 px-3',
        'border-b border-[var(--sniptale-color-border-strong)]',
        'bg-[var(--sniptale-color-surface-muted)]',
        'text-[11px] font-semibold uppercase tracking-[0.06em]',
        'text-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
      role="row"
      aria-rowindex={1}
    >
      <span className="min-w-0" role="columnheader">
        <span className="sr-only">{translate('gallery.app.listColumnSelection')}</span>
      </span>
      <span className="min-w-0 truncate text-center leading-tight" role="columnheader">
        {translate('gallery.app.listColumnType')}
      </span>
      <span className="flex min-w-0 items-center justify-center" role="columnheader">
        <ImageIcon className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{translate('gallery.app.listColumnPreview')}</span>
      </span>
      <span className="min-w-0 truncate" role="columnheader">
        {translate('gallery.app.listColumnSource')}
      </span>
      <span className="min-w-0 truncate" role="columnheader">
        {translate('gallery.app.listColumnCreated')}
      </span>
      <span className="min-w-0 truncate" role="columnheader">
        {translate('gallery.app.listColumnName')}
      </span>
      <span className="min-w-0 truncate" role="columnheader">
        {translate('gallery.app.listColumnTags')}
      </span>
      <span className="min-w-0 truncate text-right" role="columnheader">
        {translate('gallery.app.listColumnSize')}
      </span>
    </div>
  );
}
