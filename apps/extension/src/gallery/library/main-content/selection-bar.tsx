import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { isGalleryScenarioExportItem } from '../items';
import { getGalleryPrimaryShortcut, getGalleryShortcutTitle } from '../keyboard/shortcut-labels';
import { Archive, Download, FolderArchive, Trash2, X } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { GalleryTagInputDisclosure } from '../tags/disclosure';
import type { GalleryMainContentProps } from './types';
import { isGalleryMediaItem } from '../items';

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

const galleryDangerSelectionActionClassName = '!h-8 !min-h-8 !rounded-[4px] !px-2.5 !text-xs';
const gallerySelectionActionClassName = '!h-8 !min-h-8 !rounded-[4px] !px-2.5 !text-xs';

const galleryClearSelectionClassName = [
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px]',
  'text-[var(--sniptale-color-text-muted)] transition-colors',
  'hover:bg-[var(--sniptale-color-surface-canvas)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[var(--sniptale-color-border-accent-strong)]',
].join(' ');

function GallerySelectionTagInput(
  props: Pick<
    GallerySelectionBarProps,
    'allTags' | 'onApplySelectionTag' | 'onSelectionTagDraftChange' | 'selectionTagDraft'
  >
) {
  return (
    <GalleryTagInputDisclosure
      allTags={props.allTags ?? []}
      compact
      expandedClassName="w-max max-w-full shrink-0"
      explicitSubmit
      onChange={props.onSelectionTagDraftChange}
      onSubmit={props.onApplySelectionTag}
      placeholder={translate('gallery.app.selectionTagPlaceholder')}
      value={props.selectionTagDraft}
    />
  );
}

function GallerySelectionActions(
  props: Pick<GallerySelectionBarProps, 'onDeleteMany' | 'onSelectionBackup' | 'selectedItems'>
) {
  return (
    <>
      <ProductActionButton
        tone="secondary"
        compact
        type="button"
        aria-label={translate('gallery.app.selectionBackup')}
        title={translate('gallery.app.selectionBackup')}
        onClick={props.onSelectionBackup}
        className={gallerySelectionActionClassName}
      >
        <Archive className="h-4 w-4" aria-hidden="true" />
        <span className="hidden 2xl:inline">{translate('gallery.app.selectionBackup')}</span>
      </ProductActionButton>
      <ProductActionButton
        tone="danger"
        compact
        type="button"
        aria-label={translate('common.actions.delete')}
        title={getGalleryShortcutTitle(translate('common.actions.delete'), 'Del')}
        onClick={(event) =>
          props.onDeleteMany(props.selectedItems, {
            anchor: event.currentTarget,
            keyboard: event.detail === 0,
          })
        }
        className={galleryDangerSelectionActionClassName}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        <span className="hidden 2xl:inline">{translate('common.actions.delete')}</span>
      </ProductActionButton>
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

  const selectedMediaItemCount = selectedItems.filter(isGalleryMediaItem).length;
  const downloadsSingleOriginal = selectedMediaItemCount === 1;
  const downloadLabel = translate(
    downloadsSingleOriginal ? 'gallery.preview.downloadOriginal' : 'gallery.app.selectionZip'
  );

  return (
    <div
      role="toolbar"
      aria-label={translate('gallery.app.selectionActions')}
      className="flex h-8 min-w-0 flex-nowrap items-center justify-start gap-2"
      data-ui="gallery.selection.toolbar"
    >
      <div
        className="flex h-8 shrink-0 items-center gap-2 whitespace-nowrap px-1 text-xs"
        data-ui="gallery.selection.summary"
      >
        <span className="font-medium text-[var(--sniptale-color-text-primary)]">
          {translate('gallery.app.selectedPrefix')} {selectedItems.length}
        </span>
        <span aria-hidden="true" className="text-[var(--sniptale-color-text-muted)]">
          ·
        </span>
        <span className="tabular-nums text-[var(--sniptale-color-text-secondary)]">
          {formatBytes(selectedSize, 2)}
        </span>
      </div>
      <ProductActionButton
        tone="secondary"
        compact
        data-command-chrome="true"
        type="button"
        aria-label={translate('gallery.app.clearSelection')}
        title={getGalleryShortcutTitle(translate('gallery.app.clearSelection'), 'Escape')}
        onClick={onClearSelection}
        className={['sniptale-dismiss-button', galleryClearSelectionClassName].join(' ')}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </ProductActionButton>
      <span
        aria-hidden="true"
        className="mx-0.5 h-5 w-px shrink-0 bg-[var(--sniptale-color-border-soft)]"
      />
      {selectedItems.some((item) => !isGalleryScenarioExportItem(item)) ? (
        <>
          <GallerySelectionTagInput
            {...(allTags === undefined ? {} : { allTags })}
            onApplySelectionTag={onApplySelectionTag}
            onSelectionTagDraftChange={onSelectionTagDraftChange}
            selectionTagDraft={selectionTagDraft}
          />
          <ProductActionButton
            tone="secondary"
            compact
            type="button"
            aria-label={downloadLabel}
            title={downloadLabel}
            onClick={onSelectionZip}
            className={gallerySelectionActionClassName}
          >
            {downloadsSingleOriginal ? (
              <Download className="h-4 w-4" aria-hidden="true" />
            ) : (
              <FolderArchive className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden 2xl:inline">{downloadLabel}</span>
          </ProductActionButton>
        </>
      ) : null}
      <GallerySelectionActions
        onDeleteMany={onDeleteMany}
        onSelectionBackup={onSelectionBackup}
        selectedItems={selectedItems}
      />
    </div>
  );
}

/** Result actions use the same current filtered set and selection callback as the sidebar. */
export interface GalleryFoundResultsProps {
  count: number;
  disabled: boolean;
  onSelectAll(): void;
}

export function GalleryFoundResultsBar(props: GalleryFoundResultsProps) {
  return (
    <div
      role="toolbar"
      aria-label={translate('gallery.app.facetResults')}
      data-ui="gallery.results.toolbar"
      className="flex h-8 min-w-0 items-center gap-2"
    >
      <span className="whitespace-nowrap px-1 text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.app.facetResults')}:{' '}
        <span className="font-medium tabular-nums text-[var(--sniptale-color-text-primary)]">
          {props.count}
        </span>
      </span>
      <ProductActionButton
        tone="secondary"
        compact
        type="button"
        disabled={props.disabled || props.count === 0}
        className={gallerySelectionActionClassName}
        title={getGalleryShortcutTitle(
          translate('gallery.app.selectAllResults'),
          getGalleryPrimaryShortcut('A')
        )}
        onClick={props.onSelectAll}
      >
        {translate('gallery.app.selectAllResults')}
      </ProductActionButton>
    </div>
  );
}
