import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';
import { FileImage, ImageIcon, Tag } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { ScenarioEditorInsertImagePayload } from '../../project/state/types';
import { ScenarioImageStepDialogFields } from './ScenarioImageStepDialogFields';
import { useScenarioImageStepDialog } from './useScenarioImageStepDialog';
import { ProductModal, ProductModalBody, ProductModalHeader } from '@sniptale/ui/product-modal';

function ImageStepLibraryItemPreview(props: { thumbnailUrl: string | null }) {
  if (props.thumbnailUrl) {
    return (
      <img
        src={props.thumbnailUrl}
        alt={translate('scenario.editor.imageStepDialogPreviewAlt')}
        className="h-[72px] w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-[72px] items-center justify-center text-[var(--sniptale-color-text-secondary)]">
      <FileImage className="h-5 w-5" />
    </div>
  );
}

function ImageStepLibraryItemDetails(props: { item: MediaLibraryItem }) {
  const sourceLabel = props.item.sourceTitle || props.item.sourceUrl || props.item.mimeType;
  const sizeLabel =
    props.item.width && props.item.height ? `${props.item.width} × ${props.item.height}` : null;
  const metaLine = [props.item.mimeType, sizeLabel].filter(Boolean).join(' • ');

  return (
    <div className="grid min-w-0 gap-1.5">
      <span
        className="truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]"
        title={props.item.originalFilename || props.item.filename}
      >
        {props.item.originalFilename || props.item.filename}
      </span>
      <span
        className="truncate text-xs text-[var(--sniptale-color-text-secondary)]"
        title={sourceLabel}
      >
        {sourceLabel}
      </span>
      <span className="text-xs text-[var(--sniptale-color-text-muted)]">{metaLine}</span>
      {props.item.tags.length > 0 ? (
        <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--sniptale-color-text-secondary)]">
          <Tag className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate" title={props.item.tags.join(', ')}>
            {props.item.tags.join(', ')}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ImageStepLibraryItemButton(props: {
  busy: boolean;
  item: MediaLibraryItem;
  onSelect: (item: MediaLibraryItem) => void;
  thumbnailUrl: string | null;
}) {
  return (
    <button
      type="button"
      disabled={props.busy}
      onClick={() => props.onSelect(props.item)}
      className="grid w-full grid-cols-[88px_minmax(0,1fr)] gap-4 rounded-[20px]
        border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]
        px-4 py-3 text-left transition hover:border-[var(--sniptale-color-border-accent-strong)]
        hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_8%,var(--sniptale-color-surface-panel)_92%)]
        disabled:cursor-wait disabled:opacity-60"
    >
      <div
        className="overflow-hidden rounded-[16px] border border-[var(--sniptale-color-border-soft)]
          bg-[radial-gradient(circle_at_top,
          color-mix(in_srgb,var(--sniptale-color-accent-soft)_90%,transparent),
          color-mix(in_srgb,var(--sniptale-color-surface-panel)_60%,var(--sniptale-color-surface-canvas)_40%)_38%,
          var(--sniptale-color-surface-canvas))]"
      >
        <ImageStepLibraryItemPreview thumbnailUrl={props.thumbnailUrl} />
      </div>
      <ImageStepLibraryItemDetails item={props.item} />
    </button>
  );
}

function ScenarioImageStepLibrarySection(props: {
  busy: boolean;
  items: MediaLibraryItem[];
  loading: boolean;
  onSelect: (item: MediaLibraryItem) => void;
  thumbnailUrls: Record<string, string>;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--sniptale-color-text-secondary)]">
        <ImageIcon className="h-4 w-4" />
        <span>{translate('scenario.editor.imageStepDialogLibrary')}</span>
      </div>
      <div className="grid max-h-[360px] gap-2 overflow-auto pr-1">
        {props.loading ? (
          <div
            className="rounded-[18px] border border-[var(--sniptale-color-border-soft)] px-4 py-3
              text-sm text-[var(--sniptale-color-text-secondary)]"
          >
            {translate('scenario.editor.imageStepDialogLoading')}
          </div>
        ) : props.items.length > 0 ? (
          props.items.map((item) => (
            <ImageStepLibraryItemButton
              key={item.id}
              busy={props.busy}
              item={item}
              onSelect={props.onSelect}
              thumbnailUrl={props.thumbnailUrls[item.id] ?? null}
            />
          ))
        ) : (
          <div
            className="rounded-[18px] border border-dashed border-[var(--sniptale-color-border-soft)]
              px-4 py-4 text-sm text-[var(--sniptale-color-text-secondary)]"
          >
            {translate('scenario.editor.imageStepDialogEmpty')}
          </div>
        )}
      </div>
    </div>
  );
}

export function ScenarioImageStepDialog(props: {
  onClose: () => void;
  onInsertImage: (payload: ScenarioEditorInsertImagePayload) => Promise<void>;
}) {
  return (
    <ProductModal
      onClose={props.onClose}
      closeOnBackdrop
      width="min(920px, calc(100vw - 48px))"
      maxHeight="88vh"
      scrollable
    >
      <ProductModalHeader
        title={translate('scenario.editor.imageStepDialogTitle')}
        onClose={props.onClose}
      />
      <ProductModalBody className="gap-4">
        <ScenarioImageStepDialogSurface onInsertImage={props.onInsertImage} />
      </ProductModalBody>
    </ProductModal>
  );
}

function ScenarioImageStepDialogSurface(props: {
  onInsertImage: (payload: ScenarioEditorInsertImagePayload) => Promise<void>;
}) {
  const {
    error,
    fileInputRef,
    filteredItems,
    handleFileChange,
    handleFileDrop,
    handleLibrarySelect,
    loading,
    openFilePicker,
    pending,
    search,
    setSearch,
    thumbnailUrls,
  } = useScenarioImageStepDialog(props.onInsertImage);

  return (
    <div
      className="grid gap-4 rounded-[24px] border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_74%,transparent)] p-4"
    >
      <ScenarioImageStepDialogFields
        error={error}
        fileInputRef={fileInputRef}
        onFileChange={handleFileChange}
        onFileDrop={handleFileDrop}
        onOpenFilePicker={openFilePicker}
        onSearchChange={setSearch}
        pending={pending}
        search={search}
      />
      <ScenarioImageStepLibrarySection
        busy={pending}
        items={filteredItems}
        loading={loading}
        onSelect={(item) => void handleLibrarySelect(item)}
        thumbnailUrls={thumbnailUrls}
      />
    </div>
  );
}
