import { translate } from '../../../platform/i18n';
import {
  getControlPrimaryButtonClassName,
  getControlSecondaryButtonClassName,
} from '@sniptale/ui/control-language';
import {
  ArrowUpRight,
  Copy,
  Download,
  FileDown,
  Images,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { isGalleryMediaItem, isGalleryScenarioExportItem, isGalleryScenarioItem } from '../items';
import { GalleryTagInput } from '../tags/input';
import {
  formatDate,
  getGalleryItemKindLabel,
  getRecordingGroupRoleLabel,
  isImageKind,
} from '../ui';
import { PromotionAction } from './promotion-action';
import type { PreviewPanelProps } from './types';

const previewMetadataCardClassName =
  'flex items-center justify-between gap-3 border-b border-[var(--sniptale-color-border-soft)] ' +
  'px-3 py-2 last:border-b-0';

const previewMetadataGroupClassName =
  'rounded-[8px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_56%,transparent)] ' +
  'text-xs text-[var(--sniptale-color-text-secondary)]';

const PREVIEW_TAG_CLASS_NAME = [
  'rounded-full border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_30%,var(--sniptale-color-border-soft)_70%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_10%,transparent)]',
  'px-2.5 py-1 text-xs font-medium text-[var(--sniptale-color-info)] transition',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-info)_48%,var(--sniptale-color-border-soft)_52%)]',
  'disabled:cursor-default',
].join(' ');

const previewPrimaryActionButtonClassName = [
  'w-full !justify-start !rounded-[8px] !px-3',
  getControlPrimaryButtonClassName(),
].join(' ');

const previewPromotionActionButtonClassName = [
  'w-full !justify-center !rounded-[8px]',
  getControlPrimaryButtonClassName(),
].join(' ');

const previewActionButtonClassName = [
  'w-full !justify-start !rounded-[6px] !px-2.5 text-left',
  getControlSecondaryButtonClassName({ density: 'compact' }),
].join(' ');

const previewDangerActionButtonClassName = [
  'w-full !justify-start !rounded-[6px] !px-2.5 text-left',
  getControlSecondaryButtonClassName({ density: 'compact', tone: 'danger' }),
].join(' ');

const previewActionGroupLabelClassName =
  'mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] ' +
  'text-[var(--sniptale-color-text-muted-strong)]';

function PreviewMetadataCard(props: { label: string; value: string }) {
  return (
    <div className={previewMetadataCardClassName}>
      <div className="text-[var(--sniptale-color-text-muted)]">{props.label}</div>
      <div className="truncate text-right font-medium text-[var(--sniptale-color-text-primary)]">
        {props.value}
      </div>
    </div>
  );
}

function PreviewActionButton(props: { children: string; icon: LucideIcon; onClick: () => void }) {
  const Icon = props.icon;
  return (
    <button type="button" onClick={props.onClick} className={previewActionButtonClassName}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {props.children}
    </button>
  );
}

function PreviewActionGroup(props: { children: ReactNode; label: string }) {
  return (
    <div>
      <div className={previewActionGroupLabelClassName}>{props.label}</div>
      <div className="space-y-0.5">{props.children}</div>
    </div>
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
    const recordingSource = item.recordingGroupView?.sourceLabel ?? item.sourceTitle;
    return (
      <div className={previewMetadataGroupClassName}>
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
        {item.recordingGroupView ? (
          <PreviewMetadataCard
            label={translate('gallery.preview.recordingTrack')}
            value={getRecordingGroupRoleLabel(item.recordingGroupView.role)}
          />
        ) : null}
        {item.recordingGroupView ? (
          <PreviewMetadataCard
            label={translate('gallery.preview.source')}
            value={recordingSource ?? translate('gallery.preview.sourceMissing')}
          />
        ) : null}
        {item.recordingGroupView ? (
          <PreviewMetadataCard
            label={translate('gallery.preview.recordingGroup')}
            value={String(item.recordingGroupView.memberCount)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={previewMetadataGroupClassName}>
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
  onAddTag: (tag?: string) => void;
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
          onSubmit={props.onAddTag}
          placeholder={translate('gallery.preview.tagInputPlaceholder')}
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
  const canUseImageAggregateActions = canCopy && item.source.kind === 'screenshot';
  const hasEditedImageContent = canUseImageAggregateActions && item.imageContentState === 'edited';
  const canOpenWebSnapshot = isGalleryMediaItem(item) && item.kind === 'web-archive';
  const canOpenRecordingGroup =
    isGalleryMediaItem(item) &&
    item.recordingGroupView?.projectId !== null &&
    item.recordingGroupView?.projectId !== undefined;
  const canOpenPrimaryAction =
    isGalleryScenarioItem(item) || canCopy || canOpenWebSnapshot || canOpenRecordingGroup;
  const hasFileActions =
    canDownload ||
    canCopy ||
    canOpenWebSnapshot ||
    (canUseImageAggregateActions && Boolean(props.onSaveCopy)) ||
    (hasEditedImageContent && Boolean(props.onDownloadOriginal));
  const hasChangeActions =
    (canEditMetadata && props.hasChanges && Boolean(onResetChanges)) ||
    (hasEditedImageContent && Boolean(props.onRestoreOriginal));

  return (
    <section aria-labelledby="preview-actions-heading">
      <div id="preview-actions-heading" className={previewActionGroupLabelClassName}>
        {translate('gallery.preview.actions')}
      </div>
      <div className="space-y-3">
        {canOpenPrimaryAction ? (
          <button type="button" onClick={onEdit} className={previewPrimaryActionButtonClassName}>
            <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            {translate(
              canOpenWebSnapshot
                ? 'gallery.preview.openSnapshot'
                : canOpenRecordingGroup
                  ? 'gallery.preview.openRecordingGroup'
                  : 'gallery.preview.openInEditor'
            )}
          </button>
        ) : null}
        {hasFileActions ? (
          <PreviewActionGroup label={translate('gallery.preview.fileActions')}>
            {canOpenWebSnapshot && props.onOpenSnapshotScreenshot ? (
              <PreviewActionButton
                icon={Images}
                onClick={() => void props.onOpenSnapshotScreenshot?.()}
              >
                {translate('gallery.preview.openSnapshotScreenshotInEditor')}
              </PreviewActionButton>
            ) : null}
            {canDownload ? (
              <PreviewActionButton icon={Download} onClick={() => void onDownload()}>
                {translate('gallery.preview.download')}
              </PreviewActionButton>
            ) : null}
            {hasEditedImageContent && props.onDownloadOriginal ? (
              <PreviewActionButton
                icon={FileDown}
                onClick={() => void props.onDownloadOriginal?.()}
              >
                {translate('gallery.preview.downloadOriginal')}
              </PreviewActionButton>
            ) : null}
            {canCopy ? (
              <PreviewActionButton icon={Copy} onClick={() => void onCopy()}>
                {translate('gallery.preview.copy')}
              </PreviewActionButton>
            ) : null}
            {canUseImageAggregateActions && props.onSaveCopy ? (
              <PreviewActionButton icon={Save} onClick={() => void props.onSaveCopy?.()}>
                {translate('gallery.preview.saveCopy')}
              </PreviewActionButton>
            ) : null}
          </PreviewActionGroup>
        ) : null}
        {hasChangeActions ? (
          <PreviewActionGroup label={translate('gallery.preview.changeActions')}>
            {canEditMetadata && props.hasChanges && onResetChanges ? (
              <PreviewActionButton icon={Undo2} onClick={onResetChanges}>
                {translate('gallery.preview.resetChanges')}
              </PreviewActionButton>
            ) : null}
            {hasEditedImageContent && props.onRestoreOriginal ? (
              <PreviewActionButton icon={RotateCcw} onClick={() => props.onRestoreOriginal?.()}>
                {translate('gallery.preview.restoreOriginal')}
              </PreviewActionButton>
            ) : null}
          </PreviewActionGroup>
        ) : null}
        {canDelete ? (
          <div className="border-t border-[var(--sniptale-color-border-soft)] pt-2">
            <button
              type="button"
              onClick={() => void onDelete()}
              className={previewDangerActionButtonClassName}
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              {translate('common.actions.delete')}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PreviewPromotionAction(props: Pick<PreviewPanelProps, 'item' | 'onPromote'>) {
  if (props.item.lifecycle?.storageClass !== 'temporary' || !props.onPromote) {
    return null;
  }

  return (
    <div className="mt-3">
      <PromotionAction
        className={previewPromotionActionButtonClassName}
        onPromote={props.onPromote}
        visible
      />
    </div>
  );
}
