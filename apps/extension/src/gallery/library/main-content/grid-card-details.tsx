import { formatBytes } from '../../../platform/i18n/format-bytes';
import type { GalleryItem } from '../items';
import { formatDate } from '../ui';

interface GalleryCardDetailsProps {
  item: GalleryItem;
  onPreviewOpen: (item: GalleryItem) => void;
}

export function GalleryListDetails(props: GalleryCardDetailsProps) {
  const tagsLabel = props.item.tags.join(', ');
  const dateLabel = formatDate(props.item.createdAt);

  return (
    <div
      className="grid min-w-0 flex-1 grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_120px_88px]
        items-center gap-3"
    >
      <button
        type="button"
        onClick={() => props.onPreviewOpen(props.item)}
        className="min-w-0 text-left"
        title={props.item.filename}
        aria-label={props.item.filename}
      >
        <div className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {props.item.filename}
        </div>
      </button>
      <div
        className="truncate text-xs text-[var(--sniptale-color-text-muted)]"
        title={tagsLabel || undefined}
      >
        {tagsLabel || '—'}
      </div>
      <div className="truncate text-xs text-[var(--sniptale-color-text-muted)]" title={dateLabel}>
        {dateLabel}
      </div>
      <div className="text-right text-xs text-[var(--sniptale-color-text-muted)]">
        {props.item.size > 0 ? formatBytes(props.item.size) : '—'}
      </div>
    </div>
  );
}

export function GalleryGridDetails(props: GalleryCardDetailsProps) {
  const dateLabel = formatDate(props.item.createdAt);
  const tagsLabel = props.item.tags.join(', ');

  return (
    <button
      type="button"
      onClick={() => props.onPreviewOpen(props.item)}
      className="w-full px-4 py-4 text-left"
    >
      <div
        className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]"
        title={props.item.filename}
      >
        {props.item.filename}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--sniptale-color-text-muted)]">
        <span>{dateLabel}</span>
        <span>{props.item.size > 0 ? formatBytes(props.item.size) : '—'}</span>
      </div>
      {props.item.tags.length > 0 ? (
        <div className="mt-2 truncate text-xs text-[var(--sniptale-color-info)]" title={tagsLabel}>
          {tagsLabel}
        </div>
      ) : null}
    </button>
  );
}
