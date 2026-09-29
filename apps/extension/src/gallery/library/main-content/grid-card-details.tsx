import { formatBytes, formatCompactBytes } from '../../../platform/i18n/format-bytes';
import { isGalleryMediaItem, type GalleryItem } from '../items';
import { formatDate, getRecordingGroupRoleLabel } from '../ui';
import { translate } from '../../../platform/i18n';
import { GalleryProjectOpenAction, getGalleryProjectSummary } from '../ui/project-presentation';
import { GalleryGridCardDate } from './grid-card-date';

interface GalleryCardDetailsProps {
  compact?: boolean;
  item: GalleryItem;
  onPreviewOpen: (item: GalleryItem) => void;
}

export function isGalleryPreviewUnavailable(item: GalleryItem): boolean {
  return (
    isGalleryMediaItem(item) &&
    item.source.kind === 'screenshot' &&
    item.workspaceRevision !== undefined &&
    item.presentationRevision !== undefined &&
    item.presentationRevision !== item.workspaceRevision
  );
}

export function GalleryPreviewRecovery(props: { onOpen?: () => void }) {
  return (
    <div
      className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_75%,transparent)]"
      data-ui="gallery.preview-unavailable"
    >
      <span
        className="rounded-[var(--sniptale-radius-sm)] border
          border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_88%,transparent)]
          px-2.5 py-1.5 text-xs font-medium text-[var(--sniptale-color-text-primary)] shadow-sm"
      >
        {translate('gallery.app.previewUnavailable')}
      </span>
      {props.onOpen ? (
        <button
          type="button"
          className="rounded-[var(--sniptale-radius-sm)] border
          border-[var(--sniptale-color-border-strong)]
          bg-[var(--sniptale-color-surface-panel)] p-1 text-xs
          text-[var(--sniptale-color-text-primary)]
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-[var(--sniptale-color-focus-ring)]"
          onClick={props.onOpen}
        >
          {translate('gallery.app.openEditorToRetryPreview')}
        </button>
      ) : null}
    </div>
  );
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

export function GalleryListDetails(
  props: GalleryCardDetailsProps & {
    previewUnavailable?: boolean;
    onRetryPreview?: () => void;
    onProjectOpen?: (item: GalleryItem) => void;
  }
) {
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
      <div className="min-w-0" role="cell">
        <button
          type="button"
          onClick={() => props.onPreviewOpen(props.item)}
          className="block min-w-0 text-left"
          title={props.item.filename}
          aria-label={props.item.filename}
        >
          <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            <GalleryFilenameLabel filename={props.item.filename} />
          </div>
          <GalleryRecordingGroupLabel item={props.item} />
        </button>
        {getGalleryProjectSummary(props.item) ? (
          <div
            className="mt-0.5 truncate text-xs text-[var(--sniptale-color-text-secondary)]"
            title={getGalleryProjectSummary(props.item) ?? undefined}
          >
            {getGalleryProjectSummary(props.item)}
          </div>
        ) : null}
        {props.onProjectOpen && getGalleryProjectSummary(props.item) ? (
          <div className="mt-1.5">
            <GalleryProjectOpenAction
              item={props.item}
              layout="list"
              onOpen={props.onProjectOpen}
            />
          </div>
        ) : null}
        {props.previewUnavailable ? (
          <div className="flex items-center gap-2 text-xs">
            <span role="status">{translate('gallery.app.previewUnavailable')}</span>
            {props.onRetryPreview ? (
              <button
                type="button"
                onClick={props.onRetryPreview}
                className="font-semibold text-[var(--sniptale-color-accent-emphasis)] underline
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]"
              >
                {translate('gallery.app.openEditorToRetryPreview')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
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
        <GalleryGridCardDate items={[props.item]} />
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
