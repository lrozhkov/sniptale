import { Archive, FolderArchive, Trash2, X } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { GalleryTagInput } from '../tags/input';
import type { GalleryMainContentProps } from './types';

type GallerySelectionBarProps = Pick<
  GalleryMainContentProps,
  | 'allTags'
  | 'onApplySelectionTag'
  | 'onClearSelection'
  | 'onDeleteMany'
  | 'onSelectionBackup'
  | 'onSelectionTagDraftChange'
  | 'onSelectionZip'
  | 'selectedItems'
  | 'selectedSize'
  | 'selectionTagDraft'
>;

const galleryDangerSelectionActionClassName = [
  getControlSecondaryButtonClassName({ density: 'compact', tone: 'danger' }),
  '!h-8 !min-h-8 !rounded-[8px] !px-2.5',
].join(' ');

const gallerySelectionActionClassName = [
  getControlSecondaryButtonClassName({ density: 'compact' }),
  '!h-8 !min-h-8 !rounded-[8px] !px-2.5',
].join(' ');

function GallerySelectionTagInput(
  props: Pick<
    GallerySelectionBarProps,
    'allTags' | 'onApplySelectionTag' | 'onSelectionTagDraftChange' | 'selectionTagDraft'
  >
) {
  return (
    <div className="w-56 min-w-0 shrink-0">
      <GalleryTagInput
        allTags={props.allTags ?? []}
        compact
        explicitSubmit
        onChange={props.onSelectionTagDraftChange}
        onSubmit={props.onApplySelectionTag}
        placeholder={translate('gallery.app.selectionTagPlaceholder')}
        value={props.selectionTagDraft}
      />
    </div>
  );
}

function GallerySelectionActions(
  props: Pick<
    GallerySelectionBarProps,
    'onDeleteMany' | 'onSelectionBackup' | 'onSelectionZip' | 'selectedItems'
  >
) {
  return (
    <>
      <button
        type="button"
        aria-label={translate('gallery.app.selectionBackup')}
        title={translate('gallery.app.selectionBackup')}
        onClick={props.onSelectionBackup}
        className={gallerySelectionActionClassName}
      >
        <Archive className="h-3.5 w-3.5" />
        <span className="hidden 2xl:inline">{translate('gallery.app.selectionBackup')}</span>
      </button>
      <button
        type="button"
        aria-label="ZIP"
        title="ZIP"
        onClick={props.onSelectionZip}
        className={gallerySelectionActionClassName}
      >
        <FolderArchive className="h-3.5 w-3.5" />
        <span className="hidden 2xl:inline">ZIP</span>
      </button>
      <button
        type="button"
        aria-label={translate('common.actions.delete')}
        title={translate('common.actions.delete')}
        onClick={() => props.onDeleteMany(props.selectedItems)}
        className={galleryDangerSelectionActionClassName}
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="hidden 2xl:inline">{translate('common.actions.delete')}</span>
      </button>
    </>
  );
}

export function GallerySelectionBar(props: GallerySelectionBarProps) {
  const {
    allTags,
    onApplySelectionTag,
    onClearSelection,
    onDeleteMany,
    onSelectionBackup,
    onSelectionTagDraftChange,
    onSelectionZip,
    selectedItems,
    selectedSize,
    selectionTagDraft,
  } = props;

  if (selectedItems.length === 0) {
    return null;
  }

  return (
    <div className="flex h-8 min-w-0 flex-nowrap items-center justify-start gap-1.5">
      <span className="shrink-0 text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        {translate('gallery.app.selectedPrefix')} {selectedItems.length}
      </span>
      <span className="hidden shrink-0 text-xs text-[var(--sniptale-color-text-secondary)] 2xl:inline">
        {translate('gallery.app.sizePrefix')} {formatBytes(selectedSize, 2)}
      </span>
      <button
        type="button"
        aria-label={translate('gallery.app.clearSelection')}
        title={translate('gallery.app.clearSelection')}
        onClick={onClearSelection}
        className={gallerySelectionActionClassName}
      >
        <X className="h-3.5 w-3.5" />
        <span className="hidden 2xl:inline">{translate('gallery.app.clearSelection')}</span>
      </button>
      <GallerySelectionTagInput
        {...(allTags === undefined ? {} : { allTags })}
        onApplySelectionTag={onApplySelectionTag}
        onSelectionTagDraftChange={onSelectionTagDraftChange}
        selectionTagDraft={selectionTagDraft}
      />
      <GallerySelectionActions
        onDeleteMany={onDeleteMany}
        onSelectionBackup={onSelectionBackup}
        onSelectionZip={onSelectionZip}
        selectedItems={selectedItems}
      />
    </div>
  );
}
