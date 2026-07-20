import { translate } from '../../../platform/i18n';
import {
  getControlPrimaryButtonClassName,
  getControlSecondaryButtonClassName,
} from '@sniptale/ui/control-language';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { isGalleryMediaItem, isGalleryScenarioExportItem, isGalleryScenarioItem } from '../items';
import { GalleryTagInput } from '../tags/input';
import { formatDate, getGalleryItemKindLabel, isImageKind } from '../ui';
import type { PreviewPanelProps } from './types';

const previewMetadataCardClassName =
  'rounded-[16px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[var(--sniptale-color-surface-panel)] px-3 py-3';

const PREVIEW_TAG_CLASS_NAME = [
  'rounded-full border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_30%,var(--sniptale-color-border-soft)_70%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_10%,transparent)]',
  'px-2.5 py-1 text-xs font-medium text-[var(--sniptale-color-info)] transition',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-info)_48%,var(--sniptale-color-border-soft)_52%)]',
  'disabled:cursor-default',
].join(' ');

const previewPrimaryActionButtonClassName = ['w-full', getControlPrimaryButtonClassName()].join(
  ' '
);

const previewActionButtonClassName = ['w-full', getControlSecondaryButtonClassName()].join(' ');

const previewDangerActionButtonClassName = [
  'w-full',
  getControlSecondaryButtonClassName({ tone: 'danger' }),
].join(' ');

function PreviewMetadataCard(props: { label: string; value: string }) {
  return (
    <div className={previewMetadataCardClassName}>
      <div className="text-[var(--sniptale-color-text-muted)]">{props.label}</div>
      <div className="mt-1 font-semibold text-[var(--sniptale-color-text-primary)]">
        {props.value}
      </div>
    </div>
  );
}

function PreviewActionButton(props: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={props.onClick} className={previewActionButtonClassName}>
      {props.children}
    </button>
  );
}

function PreviewTagList(props: { onRemoveTag?: (tag: string) => void; tagDrafts: string[] }) {
  return (
    <div className="mb-3 flex min-h-[40px] flex-wrap gap-2">
      {props.tagDrafts.length > 0 ? (
        props.tagDrafts.map((tag) => (
          <button
            key={tag}
            type="button"
            disabled={!props.onRemoveTag}
            onClick={() => props.onRemoveTag?.(tag)}
            className={PREVIEW_TAG_CLASS_NAME}
            title={tag}
          >
            {props.onRemoveTag ? `${tag} ×` : tag}
          </button>
        ))
      ) : (
        <div className="text-sm text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.preview.tagsEmpty')}
        </div>
      )}
    </div>
  );
}

function isMetadataEditable(item: PreviewPanelProps['item'] | undefined) {
  if (!item) {
    return true;
  }

  return isGalleryMediaItem(item) || isGalleryScenarioItem(item);
}

export function PreviewMetadataCards({ item }: Pick<PreviewPanelProps, 'item'>) {
  if (isGalleryMediaItem(item)) {
    return (
      <div className="grid grid-cols-2 gap-3 text-xs text-[var(--sniptale-color-text-secondary)]">
        <PreviewMetadataCard
          label={translate('gallery.preview.size')}
          value={formatBytes(item.size, 2)}
        />
        <PreviewMetadataCard
          label={translate('gallery.preview.type')}
          value={item.mimeType || '—'}
        />
        <PreviewMetadataCard
          label={translate('gallery.preview.resolution')}
          value={item.width && item.height ? `${item.width}×${item.height}` : '—'}
        />
        <PreviewMetadataCard
          label={translate('gallery.preview.duration')}
          value={
            item.duration
              ? `${item.duration.toFixed(1)} ${translate('gallery.preview.durationSuffix')}`
              : '—'
          }
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 text-xs text-[var(--sniptale-color-text-secondary)]">
      <PreviewMetadataCard
        label={translate('gallery.preview.type')}
        value={getGalleryItemKindLabel(item.kind)}
      />
      <PreviewMetadataCard
        label={translate('gallery.preview.size')}
        value={item.size > 0 ? formatBytes(item.size, 2) : '—'}
      />
      <PreviewMetadataCard
        label={translate('gallery.app.createdLabel')}
        value={formatDate(item.createdAt)}
      />
      <PreviewMetadataCard
        label={translate('gallery.app.updatedLabel')}
        value={formatDate(item.updatedAt)}
      />
    </div>
  );
}

export function PreviewTagEditor(props: {
  allTags?: string[];
  item?: PreviewPanelProps['item'];
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onTagDraftChange: (value: string) => void;
  tagDraft: string;
  tagDrafts: string[];
}) {
  const editable = isMetadataEditable(props.item);

  return (
    <div>
      <label
        className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em]
          text-[var(--sniptale-color-text-muted-strong)]"
      >
        {translate('gallery.preview.tags')}
      </label>
      <PreviewTagList
        {...(editable ? { onRemoveTag: props.onRemoveTag } : {})}
        tagDrafts={props.tagDrafts}
      />
      {editable ? (
        <GalleryTagInput
          allTags={props.allTags ?? []}
          excludeTags={props.tagDrafts}
          onChange={props.onTagDraftChange}
          onSubmit={() => props.onAddTag()}
          placeholder={`${translate('common.actions.add')}${translate('gallery.preview.addTagPlaceholderSuffix')}`}
          value={props.tagDraft}
        />
      ) : null}
    </div>
  );
}

export function PreviewActions(props: PreviewPanelProps) {
  const { item, onCopy, onDelete, onDownload, onEdit, onResetChanges } = props;
  const canEditMetadata = isMetadataEditable(item);
  const canDelete = !isGalleryScenarioExportItem(item);
  const canDownload = isGalleryMediaItem(item);
  const canCopy = isGalleryMediaItem(item) && isImageKind(item.kind);
  const canOpenWebSnapshot = isGalleryMediaItem(item) && item.kind === 'web-archive';

  return (
    <div className="grid gap-2 pt-2">
      {(isGalleryScenarioItem(item) || canCopy || canOpenWebSnapshot) && (
        <button type="button" onClick={onEdit} className={previewPrimaryActionButtonClassName}>
          {translate(
            canOpenWebSnapshot ? 'gallery.preview.openSnapshot' : 'gallery.preview.openInEditor'
          )}
        </button>
      )}
      {canEditMetadata && props.hasChanges && onResetChanges ? (
        <PreviewActionButton onClick={onResetChanges}>
          {translate('gallery.preview.resetChanges')}
        </PreviewActionButton>
      ) : null}
      {canOpenWebSnapshot && props.onOpenSnapshotScreenshot ? (
        <PreviewActionButton onClick={() => void props.onOpenSnapshotScreenshot?.()}>
          {translate('gallery.preview.openSnapshotScreenshotInEditor')}
        </PreviewActionButton>
      ) : null}
      {canDownload ? (
        <PreviewActionButton onClick={() => void onDownload()}>
          {translate('gallery.preview.download')}
        </PreviewActionButton>
      ) : null}
      {canCopy ? (
        <PreviewActionButton onClick={() => void onCopy()}>
          {translate('gallery.preview.copy')}
        </PreviewActionButton>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          onClick={() => void onDelete()}
          className={previewDangerActionButtonClassName}
        >
          {translate('common.actions.delete')}
        </button>
      ) : null}
    </div>
  );
}
