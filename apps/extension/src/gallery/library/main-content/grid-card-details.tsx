import { formatBytes, formatCompactBytes } from '../../../platform/i18n/format-bytes';
import { isGalleryMediaItem, type GalleryItem } from '../items';
import { formatDate, getRecordingGroupRoleLabel } from '../ui';
import { translate } from '../../../platform/i18n';

function GalleryDraftExpirationLabel({ item }: Pick<GalleryCardDetailsProps, 'item'>) {
  if (item.lifecycle?.storageClass !== 'temporary') return null;
  const expiration = item.expiresAt
    ? `${translate('gallery.app.draftExpires')} ${formatDate(item.expiresAt)}`
    : translate('gallery.app.draftNoExpiration');
  return <span className="mt-1 block text-[var(--sniptale-color-warning)]">{expiration}</span>;
}

function GalleryPresentationLabel({ item }: Pick<GalleryCardDetailsProps, 'item'>) {
  if (
    item.workspaceRevision === undefined ||
    item.presentationRevision === undefined ||
    item.presentationRevision === item.workspaceRevision
  ) {
    return null;
  }
  return (
    <span className="text-[var(--sniptale-color-info)]">
      {translate('gallery.app.updatingPreview')}
    </span>
  );
}

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
      className="flex min-w-0 max-w-full items-baseline"
      data-ui="gallery.filename"
    >
      <span className="min-w-[4ch] truncate">{leading}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
      {extension ? (
        <span className="shrink-0 text-[var(--sniptale-color-text-secondary)]">{extension}</span>
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

export function GalleryListDetails(props: GalleryCardDetailsProps) {
  const tagsLabel = props.item.tags.join(', ');
  const dateLabel = formatDate(props.item.createdAt);

  return (
    <>
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
      <div
        className="truncate text-xs text-[var(--sniptale-color-text-muted)]"
        title={dateLabel}
        role="cell"
      >
        {dateLabel}
      </div>
      <div className="text-right text-xs text-[var(--sniptale-color-text-muted)]" role="cell">
        {props.item.size > 0 ? formatBytes(props.item.size) : '—'}
      </div>
    </>
  );
}

export function GalleryGridDetails(props: GalleryCardDetailsProps) {
  const dateLabel = formatDate(props.item.createdAt);
  const tagsLabel = props.item.tags.join(', ');

  return (
    <button
      type="button"
      onClick={() => props.onPreviewOpen(props.item)}
      className={props.compact ? 'w-full px-3 py-3 text-left' : 'w-full px-4 py-4 text-left'}
      title={props.item.filename}
      aria-label={props.item.filename}
    >
      {props.compact ? null : (
        <>
          <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            <GalleryFilenameLabel filename={props.item.filename} />
          </div>
          <GalleryRecordingGroupLabel item={props.item} />
        </>
      )}
      <div
        data-ui={props.compact ? 'gallery.compact.metadata' : undefined}
        className={`flex items-center justify-between gap-2 whitespace-nowrap text-xs
          text-[var(--sniptale-color-text-muted)] ${props.compact ? '' : 'mt-2'}`}
      >
        <span className="shrink-0">{dateLabel}</span>
        <span className="shrink-0">
          {props.item.size > 0
            ? props.compact
              ? formatCompactBytes(props.item.size)
              : formatBytes(props.item.size)
            : '—'}
        </span>
      </div>
      <GalleryDraftExpirationLabel item={props.item} />
      <GalleryPresentationLabel item={props.item} />
      {props.item.tags.length > 0 ? (
        <div className="mt-2 truncate text-xs text-[var(--sniptale-color-info)]" title={tagsLabel}>
          {tagsLabel}
        </div>
      ) : null}
    </button>
  );
}
