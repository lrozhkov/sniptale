import { formatDate } from './index';
import type { GalleryViewMode } from '../types';
import type { GalleryItem } from '../items';
import { canOpenGalleryProject } from '../items/types';
import { translate } from '../../../platform/i18n';

const PROJECT_ACTION_CLASS_NAME = [
  'inline-flex min-h-9 items-center justify-center rounded-[var(--sniptale-radius-md)] border',
  'border-[var(--sniptale-color-border-strong)] bg-[var(--sniptale-color-surface-panel)]',
  'px-3 text-xs font-semibold text-[var(--sniptale-color-text-primary)] transition',
  'hover:border-[var(--sniptale-color-border-accent-strong)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--sniptale-color-border-strong)]',
].join(' ');

/** Concise project content and availability, without treating projects as encoded files. */
export function getGalleryProjectSummary(item: GalleryItem): string | null {
  if (item.type !== 'scenario' && item.type !== 'video-project') return null;
  if (item.lifecycle?.trashedAt !== undefined)
    return translate('gallery.preview.restoreProjectFirst');
  if (!canOpenGalleryProject(item)) return translate('gallery.preview.projectUnavailable');
  if (item.type === 'scenario') return translate('gallery.preview.editableProject');
  return [
    `${translate('gallery.preview.clips')}: ${item.project.clipCount}`,
    `${translate('gallery.preview.tracks')}: ${item.project.trackCount}`,
    `${item.duration.toFixed(1)} ${translate('gallery.preview.durationSuffix')}`,
  ].join(' · ');
}

export function GalleryProjectOpenAction(props: {
  item: GalleryItem;
  layout?: 'grid' | 'list';
  onOpen: (item: GalleryItem) => void;
}) {
  if (props.item.type !== 'scenario' && props.item.type !== 'video-project') return null;
  if (props.item.lifecycle?.trashedAt !== undefined) return null;
  const available = canOpenGalleryProject(props.item);
  return (
    <button
      type="button"
      disabled={!available}
      title={available ? props.item.filename : translate('gallery.preview.projectUnavailable')}
      onClick={() => props.onOpen(props.item)}
      className={`${PROJECT_ACTION_CLASS_NAME} ${props.layout === 'list' ? 'w-full max-w-[180px]' : 'w-full'}`}
    >
      {translate('gallery.preview.openInEditor')}
    </button>
  );
}

export function GalleryProjectDetails(props: {
  item: GalleryItem;
  viewMode: GalleryViewMode;
  onPreviewOpen: (item: GalleryItem) => void;
  onOpen?: (item: GalleryItem) => void;
}) {
  const summary = getGalleryProjectSummary(props.item);
  if (!summary) return null;
  const isList = props.viewMode === 'list';
  return (
    <div
      className={
        isList
          ? 'min-w-0'
          : 'flex h-[144px] shrink-0 flex-col gap-2 border-t border-[var(--sniptale-color-border-soft)] px-3 py-3'
      }
    >
      {!isList ? (
        <button
          type="button"
          onClick={() => props.onPreviewOpen(props.item)}
          className="block w-full truncate text-left text-sm font-semibold"
          title={props.item.filename}
        >
          {props.item.filename}
        </button>
      ) : null}
      <div className="min-w-0 flex-1 text-xs text-[var(--sniptale-color-text-secondary)]">
        <div className="truncate" title={summary}>
          {summary}
        </div>
        {!isList ? (
          <div className="truncate">
            {translate('gallery.app.updatedLabel')} {formatDate(props.item.updatedAt)}
          </div>
        ) : null}
      </div>
      {props.onOpen ? (
        <GalleryProjectOpenAction
          item={props.item}
          onOpen={props.onOpen}
          layout={isList ? 'list' : 'grid'}
        />
      ) : null}
    </div>
  );
}
