import { formatBytes, formatCompactBytes } from '../../../platform/i18n/format-bytes';
import { isGalleryMediaItem, type GalleryItem } from '../items';
import { formatDate, getRecordingGroupRoleLabel } from '../ui';
import { Clock3 } from 'lucide-react';
import { translate } from '../../../platform/i18n';

interface GalleryCardDetailsProps {
  compact?: boolean;
  item: GalleryItem;
  onPreviewOpen: (item: GalleryItem) => void;
}

const FILENAME_DISTINGUISHING_TAIL_LENGTH = 12;

function splitFilenameForDisplay(filename: string) {
  const extensionStart = filename.lastIndexOf('.');
  const hasExtension = extensionStart > 0 && extensionStart < filename.length - 1;
  const stem = hasExtension ? filename.slice(0, extensionStart) : filename;
  const extension = hasExtension ? filename.slice(extensionStart) : '';
  const stemCharacters = Array.from(stem);

  if (stemCharacters.length <= FILENAME_DISTINGUISHING_TAIL_LENGTH * 2) {
    return { extension, leading: stem, trailing: '' };
  }

  return {
    extension,
    leading: stemCharacters.slice(0, -FILENAME_DISTINGUISHING_TAIL_LENGTH).join(''),
    trailing: stemCharacters.slice(-FILENAME_DISTINGUISHING_TAIL_LENGTH).join(''),
  };
}

function GalleryFilenameLabel({ filename }: { filename: string }) {
  const { extension, leading, trailing } = splitFilenameForDisplay(filename);

  return (
    <span
      aria-hidden="true"
      className="flex w-full min-w-0 items-baseline overflow-hidden"
      data-ui="gallery.filename"
    >
      <span className="min-w-[3ch] shrink truncate">{leading}</span>
      {trailing || extension ? (
        <span className="flex max-w-[55%] min-w-0 shrink-0 items-baseline">
          {trailing ? <span className="min-w-0 truncate">{trailing}</span> : null}
          {extension ? (
            <span className="shrink-0 text-[var(--sniptale-color-text-secondary)]">
              {extension}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

function GalleryRecordingGroupLabel({ item }: Pick<GalleryCardDetailsProps, 'item'>) {
  if (!isGalleryMediaItem(item) || !item.recordingGroupView) return null;
  const role = getRecordingGroupRoleLabel(item.recordingGroupView.role);
  const group = `${translate('gallery.preview.recordingGroup')} ${item.recordingGroupView.memberCount}`;
  return (
    <div
      className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px]
        text-[var(--sniptale-color-accent-emphasis)]"
      title={item.recordingGroupView.sourceLabel ?? `${role} · ${group}`}
    >
      <span className="truncate font-medium">{role}</span>
      <span aria-hidden="true">·</span>
      <span className="shrink-0">{group}</span>
    </div>
  );
}

function getGallerySourcePresentation(item: GalleryItem) {
  let hostname: string | null = null;

  if (item.sourceUrl) {
    try {
      const parsedUrl = new URL(item.sourceUrl);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        hostname = parsedUrl.hostname.replace(/^www\./iu, '') || null;
      }
    } catch {
      hostname = null;
    }
  }

  const recordingSource = isGalleryMediaItem(item)
    ? (item.recordingGroupView?.sourceLabel ?? null)
    : null;
  const label = recordingSource ?? item.sourceTitle ?? hostname;
  const detail = hostname && hostname !== label ? hostname : null;

  return {
    detail,
    label,
    title: [item.sourceTitle ?? recordingSource, item.sourceUrl].filter(Boolean).join(' · '),
  };
}

export function GalleryListDetails(props: GalleryCardDetailsProps) {
  const tagsLabel = props.item.tags.join(', ');
  const dateLabel = formatDate(props.item.createdAt);
  const source = getGallerySourcePresentation(props.item);

  return (
    <>
      <div
        className="min-w-0 text-xs text-[var(--sniptale-color-text-secondary)]"
        title={source.title || undefined}
        role="cell"
        data-ui="gallery.list.source"
      >
        <div className="truncate font-medium">{source.label || '—'}</div>
        {source.detail ? (
          <div className="mt-0.5 truncate text-[11px] text-[var(--sniptale-color-text-muted)]">
            {source.detail}
          </div>
        ) : null}
      </div>
      <div
        className="truncate text-xs text-[var(--sniptale-color-text-muted)]"
        title={dateLabel}
        role="cell"
      >
        {dateLabel}
      </div>
      <button
        type="button"
        onClick={() => props.onPreviewOpen(props.item)}
        className="min-w-0 text-left"
        title={props.item.filename}
        aria-label={props.item.filename}
        role="cell"
      >
        <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          <GalleryFilenameLabel filename={props.item.filename} />
        </div>
        <GalleryRecordingGroupLabel item={props.item} />
      </button>
      <div
        className="truncate text-xs text-[var(--sniptale-color-text-muted)]"
        title={tagsLabel || undefined}
        role="cell"
      >
        {tagsLabel || '—'}
      </div>
      <div className="text-right text-xs text-[var(--sniptale-color-text-muted)]" role="cell">
        {props.item.size > 0 ? formatBytes(props.item.size) : '—'}
      </div>
    </>
  );
}

export function GalleryGridDetails(props: GalleryCardDetailsProps) {
  const isDraft = props.item.lifecycle?.storageClass === 'temporary';
  const dateLabel = formatDate(
    isDraft && props.item.expiresAt ? props.item.expiresAt : props.item.createdAt
  );
  const draftClassName = isDraft ? 'font-medium text-[var(--sniptale-color-warning)]' : '';
  const draftHint = isDraft
    ? props.item.expiresAt
      ? `${translate('gallery.app.draftExpires')} ${formatDate(props.item.expiresAt)}`
      : translate('gallery.app.draftNoExpiration')
    : undefined;

  return (
    <button
      type="button"
      onClick={() => props.onPreviewOpen(props.item)}
      className={
        props.compact
          ? `h-10 w-full shrink-0 border-t border-[var(--sniptale-color-border-soft)]
            px-3 py-3 text-left`
          : `grid h-[72px] w-full shrink-0 grid-rows-[20px_16px] gap-2
            border-t border-[var(--sniptale-color-border-soft)] px-4 py-3.5 text-left`
      }
      data-ui={props.compact ? 'gallery.compact.details' : 'gallery.large.details'}
      title={props.item.filename}
      aria-label={props.item.filename}
    >
      {props.compact ? null : (
        <div className="min-w-0">
          <div
            className="flex h-5 min-w-0 items-center text-sm font-semibold
              text-[var(--sniptale-color-text-primary)]"
          >
            <GalleryFilenameLabel filename={props.item.filename} />
          </div>
        </div>
      )}
      <div
        data-ui={props.compact ? 'gallery.compact.metadata' : 'gallery.large.metadata'}
        className={`flex items-center justify-between gap-2 whitespace-nowrap text-xs
          text-[var(--sniptale-color-text-muted)]`}
      >
        <span className={`flex min-w-0 items-center gap-1 ${draftClassName}`} title={draftHint}>
          {isDraft ? <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
          <span className="truncate">{dateLabel}</span>
        </span>
        <span className="shrink-0">
          {props.item.size > 0
            ? props.compact
              ? formatCompactBytes(props.item.size)
              : formatBytes(props.item.size)
            : '—'}
        </span>
      </div>
    </button>
  );
}
