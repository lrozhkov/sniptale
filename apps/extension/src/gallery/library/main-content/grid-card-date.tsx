import { Trash2 } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { GalleryItem } from '../items';
import { formatDate } from '../ui';

function expirationHint(items: GalleryItem[]) {
  const drafts = items.filter(
    (item) => item.lifecycle?.storageClass === 'temporary' && item.lifecycle.trashedAt === undefined
  );
  if (!drafts.length) return null;
  const dates = drafts
    .map((item) => item.expiresAt)
    .filter((date): date is number => typeof date === 'number');
  const date = dates.length ? formatDate(Math.min(...dates)) : null;
  return {
    date,
    hint: date
      ? `${translate('gallery.app.draftExpires')} ${date}`
      : translate('gallery.app.draftNoExpiration'),
  };
}

/** Creation stays primary; expiry is secondary metadata, never a replacement date. */
export function GalleryGridCardDate({
  items,
  presentation = 'grid',
}: {
  items: GalleryItem[];
  presentation?: 'grid' | 'list';
}) {
  const firstItem = items[0];
  if (!firstItem) return null;
  const created = formatDate(firstItem.createdAt);
  const expiry = expirationHint(items);
  return (
    <span
      className="flex min-w-0 flex-col"
      title={`${translate('gallery.app.createdLabel')} ${created}`}
    >
      <span className="truncate">{created}</span>
      {presentation === 'list' && expiry ? (
        <span
          className="mt-0.5 flex min-w-0 items-center gap-1 text-[var(--sniptale-color-text-secondary)]"
          title={expiry.hint}
        >
          <Trash2 size={12} className="shrink-0" aria-hidden="true" />
          {expiry.date ? (
            <span className="sr-only">{translate('gallery.app.draftExpires')} </span>
          ) : null}
          <span className="truncate">{expiry.date ?? expiry.hint}</span>
        </span>
      ) : null}
    </span>
  );
}

/** Opaque badge stays legible on arbitrary captured pixels and uses the native hint. */
export function GalleryCardExpiration({ items }: { items: GalleryItem[] }) {
  const expiry = expirationHint(items);
  if (!expiry) return null;
  const { hint } = expiry;
  return (
    <span
      data-ui="gallery.card.expiration"
      title={hint}
      aria-label={hint}
      role="img"
      className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-[4px]
        bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-secondary)]"
    >
      <Trash2 size={16} aria-hidden="true" />
    </span>
  );
}
