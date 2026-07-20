import { FolderArchive, Trash2 } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import {
  getControlSecondaryButtonClassName,
  getFormPanelSurfaceClassName,
} from '@sniptale/ui/control-language';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { GalleryTagInput } from '../tags/input';
import type { GalleryMainContentProps } from './types';

type GallerySelectionBarProps = Pick<
  GalleryMainContentProps,
  | 'allTags'
  | 'onApplySelectionTag'
  | 'onClearSelection'
  | 'onDeleteMany'
  | 'onSelectionTagDraftChange'
  | 'onSelectionZip'
  | 'selectedItems'
  | 'selectedSize'
  | 'selectionTagDraft'
>;

const galleryDangerSelectionActionClassName = [
  getControlSecondaryButtonClassName({ density: 'compact', shape: 'pill', tone: 'danger' }),
  'uppercase tracking-[0.12em]',
].join(' ');

function GallerySelectionTagInput(
  props: Pick<
    GallerySelectionBarProps,
    'allTags' | 'onApplySelectionTag' | 'onSelectionTagDraftChange' | 'selectionTagDraft'
  >
) {
  return (
    <div className="min-w-[240px]">
      <GalleryTagInput
        allTags={props.allTags ?? []}
        compact
        onChange={props.onSelectionTagDraftChange}
        onSubmit={() => props.onApplySelectionTag()}
        placeholder={translate('gallery.app.selectionTagPlaceholder')}
        value={props.selectionTagDraft}
      />
    </div>
  );
}

function GallerySelectionActions(
  props: Pick<
    GallerySelectionBarProps,
    'onClearSelection' | 'onDeleteMany' | 'onSelectionZip' | 'selectedItems'
  >
) {
  return (
    <>
      <button
        type="button"
        onClick={props.onSelectionZip}
        className={[
          getControlSecondaryButtonClassName({ density: 'compact', shape: 'pill' }),
          'uppercase tracking-[0.12em]',
        ].join(' ')}
      >
        <FolderArchive className="h-3.5 w-3.5" />
        ZIP
      </button>
      <button
        type="button"
        onClick={() => props.onDeleteMany(props.selectedItems)}
        className={galleryDangerSelectionActionClassName}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {translate('common.actions.delete')}
      </button>
      <button
        type="button"
        onClick={props.onClearSelection}
        className={[
          getControlSecondaryButtonClassName({ density: 'compact', shape: 'pill' }),
          'uppercase tracking-[0.12em]',
        ].join(' ')}
      >
        {translate('gallery.app.clearSelection')}
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
    onSelectionTagDraftChange,
    onSelectionZip,
    selectedItems,
    selectedSize,
    selectionTagDraft,
  } = props;

  if (selectedItems.length === 0) {
    return null;
  }

  const selectionBarClassName = [
    'mt-4 flex flex-wrap items-center gap-3 px-4 py-3',
    getFormPanelSurfaceClassName({ compact: true }),
  ].join(' ');

  return (
    <div className={selectionBarClassName}>
      <span className="text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        {translate('gallery.app.selectedPrefix')} {selectedItems.length}
      </span>
      <span className="text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.app.sizePrefix')} {formatBytes(selectedSize, 2)}
      </span>
      <GallerySelectionTagInput
        {...(allTags === undefined ? {} : { allTags })}
        onApplySelectionTag={onApplySelectionTag}
        onSelectionTagDraftChange={onSelectionTagDraftChange}
        selectionTagDraft={selectionTagDraft}
      />
      <GallerySelectionActions
        onClearSelection={onClearSelection}
        onDeleteMany={onDeleteMany}
        onSelectionZip={onSelectionZip}
        selectedItems={selectedItems}
      />
    </div>
  );
}
