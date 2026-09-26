import { formatDate } from './index';
import type { GalleryViewMode } from '../types';
import type { GalleryItem } from '../items';
import { canOpenGalleryProject } from '../items/types';
import { translate } from '../../../platform/i18n';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';

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
      className={getControlSecondaryButtonClassName({ density: 'compact' })}
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
          ? 'col-span-full flex flex-wrap items-center justify-between gap-2'
          : 'shrink-0 space-y-1 border-t border-[var(--sniptale-color-border-soft)] px-3 py-2'
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
      <div className="min-w-0 text-xs text-[var(--sniptale-color-text-secondary)]">
        <div className="truncate" title={summary}>
          {summary}
        </div>
        {!isList ? (
          <div className="truncate">
            {translate('gallery.app.updatedLabel')} {formatDate(props.item.updatedAt)}
          </div>
        ) : null}
      </div>
      {props.onOpen ? <GalleryProjectOpenAction item={props.item} onOpen={props.onOpen} /> : null}
    </div>
  );
}
