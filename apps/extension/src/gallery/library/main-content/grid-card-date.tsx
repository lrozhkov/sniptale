import { Clock3, Trash2 } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { GalleryItem } from '../items';
import { formatDate } from '../ui';

function getDraftDatePresentation(items: GalleryItem[]) {
  const drafts = items.filter((item) => item.lifecycle?.storageClass === 'temporary');
  if (drafts.length === 0) return null;

  const expirationDates = drafts
    .map((item) => item.expiresAt)
    .filter((expiresAt): expiresAt is number => expiresAt !== undefined);
  const expiresAt = expirationDates.length > 0 ? Math.min(...expirationDates) : undefined;

  return {
    dateLabel: formatDate(expiresAt ?? drafts[0]!.createdAt),
    hint: expiresAt
      ? `${translate('gallery.app.draftExpires')} ${formatDate(expiresAt)}`
      : translate('gallery.app.draftNoExpiration'),
  };
}

export function GalleryGridCardDate({ items }: { items: GalleryItem[] }) {
  const firstItem = items[0];
  if (!firstItem) return null;

  const trashedAt = firstItem.lifecycle?.trashedAt;
  const draft = trashedAt === undefined ? getDraftDatePresentation(items) : null;
  const dateLabel =
    trashedAt !== undefined
      ? formatDate(trashedAt)
      : (draft?.dateLabel ?? formatDate(firstItem.createdAt));

  return (
    <span
      className={`flex min-w-0 items-center gap-1 ${draft ? 'font-medium text-[var(--sniptale-color-warning)]' : ''}`}
      title={draft?.hint}
    >
      {trashedAt !== undefined ? (
        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : draft ? (
        <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : null}
      <span className="truncate">{dateLabel}</span>
    </span>
  );
}
