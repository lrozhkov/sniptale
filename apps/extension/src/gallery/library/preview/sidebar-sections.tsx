import { canOpenGalleryProject } from '../items/types';
import { getGalleryProjectSummary } from '../ui/project-presentation';
import { translate } from '../../../platform/i18n';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import {
  ArrowUpRight,
  Clapperboard,
  Film,
  Copy,
  Check,
  Download,
  FileDown,
  Images,
  Plus,
  RotateCcw,
  Save,
  Tag,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import {
  listMediaAssetProjectUsage,
  type MediaAssetProjectUsage,
} from '../../../composition/persistence/media-library/usage';
import {
  openGalleryPage,
  openScenarioEditorPage,
  openVideoEditorPage,
} from '../../../platform/navigation/extension-pages';

const previewMetadataCardClassName =
  'flex items-center justify-between gap-3 border-b border-[var(--sniptale-color-border-soft)] ' +
  'px-3 py-2 last:border-b-0';

const previewMetadataGroupClassName =
  'rounded-[8px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_56%,transparent)] ' +
  'text-xs text-[var(--sniptale-color-text-secondary)]';

const PREVIEW_TAG_CLASS_NAME = [
  'inline-flex items-center gap-1 rounded-full border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_30%,var(--sniptale-color-border-soft)_70%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_10%,transparent)]',
  'px-2.5 py-1 text-xs font-medium text-[var(--sniptale-color-info)] transition',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-info)_48%,var(--sniptale-color-border-soft)_52%)]',
  'disabled:cursor-default',
].join(' ');

const previewActionButtonClassName = [
  'w-full !justify-start !rounded-[8px] !px-3 text-left',
  getControlSecondaryButtonClassName({ density: 'compact' }),
].join(' ');

const previewDangerActionButtonClassName = [
  'w-full !justify-start !rounded-[8px] !px-3 text-left',
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

function PreviewActionButton(props: {
  children: string;
  icon: LucideIcon;
  onClick: () => void | Promise<boolean | void>;
  success?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (status !== 'success') return;
    const timer = window.setTimeout(() => setStatus('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);
  const Icon = status === 'success' ? Check : props.icon;
  return (
    <div>
      <button
        type="button"
        disabled={status === 'pending'}
        aria-label={props.children}
        aria-busy={status === 'pending'}
        onClick={async () => {
          if (pending.current) return;
          pending.current = true;
          setStatus('pending');
          try {
            const completed = await props.onClick();
            if (mounted.current)
              setStatus(props.success ? (completed === true ? 'success' : 'error') : 'idle');
          } catch {
            if (mounted.current) setStatus('error');
          } finally {
            pending.current = false;
          }
        }}
        className={previewActionButtonClassName}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span role="status">{status === 'success' ? props.success : props.children}</span>
      </button>
      {status === 'error' ? (
        <p role="alert" className="px-3 text-xs">
          {translate('gallery.preview.actionRetry')}
        </p>
      ) : null}
    </div>
  );
}

function PreviewActionGroup(props: { children: ReactNode; label: string }) {
  return (
    <div>
      <div className={previewActionGroupLabelClassName}>{props.label}</div>
      <div className="space-y-1">{props.children}</div>
    </div>
  );
}

function PreviewTagList(props: { onRemoveTag?: (tag: string) => void; tagDrafts: string[] }) {
  if (props.tagDrafts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5" data-ui="gallery.preview.tags-list">
      {props.tagDrafts.map((tag) =>
        props.onRemoveTag ? (
          <button
            key={tag}
            type="button"
            onClick={() => props.onRemoveTag?.(tag)}
            className={PREVIEW_TAG_CLASS_NAME}
            title={tag}
          >
            <span className="max-w-40 truncate">{tag}</span>
            <X className="h-3 w-3 shrink-0" aria-hidden="true" />
          </button>
        ) : (
          <span key={tag} className={PREVIEW_TAG_CLASS_NAME} title={tag}>
            <span className="max-w-40 truncate">{tag}</span>
          </span>
        )
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
        {item.width && item.height ? (
          <PreviewMetadataCard
            label={translate('gallery.preview.resolution')}
            value={`${item.width}×${item.height}`}
          />
        ) : null}
        {item.duration !== null ? (
          <PreviewMetadataCard
            label={translate('gallery.preview.duration')}
            value={`${item.duration.toFixed(1)} ${translate('gallery.preview.durationSuffix')}`}
          />
        ) : null}
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
      {getGalleryProjectSummary(item) ? (
        <p className="px-3 py-2">{getGalleryProjectSummary(item)}</p>
      ) : (
        <PreviewMetadataCard
          label={translate('gallery.preview.size')}
          value={item.size > 0 ? formatBytes(item.size, 2) : '—'}
        />
      )}
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

export function PreviewProjectUsage({
  item,
  trashMode,
}: Pick<PreviewPanelProps, 'item' | 'trashMode'>) {
  const mediaId = isGalleryMediaItem(item) ? (item.entityId ?? item.id) : null;
  const [usage, setUsage] = useState<MediaAssetProjectUsage[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!mediaId) return;
    let active = true;
    setStatus('loading');
    void listMediaAssetProjectUsage(mediaId).then(
      (result) => {
        if (!active) return;
        setUsage(result);
        setStatus('ready');
      },
      () => {
        if (active) setStatus('error');
      }
    );
    return () => {
      active = false;
    };
  }, [mediaId]);

  if (!mediaId) return null;
  return (
    <section aria-label={translate('gallery.preview.usedInProjects')}>
      <div className={previewActionGroupLabelClassName}>
        {translate('gallery.preview.usedInProjects')}
      </div>
      {status === 'loading' ? <div>{translate('gallery.preview.projectsLoading')}</div> : null}
      {status === 'error' ? <div>{translate('gallery.preview.projectsUnavailable')}</div> : null}
      {status === 'ready' && usage.length === 0 ? (
        <div className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.preview.projectsEmpty')}
        </div>
      ) : null}
      {status === 'ready' ? (
        <div className="space-y-1">
          {usage.map((project) =>
            trashMode ? (
              <p key={`${project.kind}:${project.id}`} className="break-words px-3 py-2 text-sm">
                {project.name}
              </p>
            ) : (
              <button
                key={`${project.kind}:${project.id}`}
                type="button"
                className={previewActionButtonClassName}
                onClick={() => {
                  if (project.kind === 'video') void openVideoEditorPage(project.id, null);
                  if (project.kind === 'scenario') void openScenarioEditorPage(project.id);
                  if (project.kind === 'review')
                    void openGalleryPage({ mediaId: project.id, quickEdit: true });
                }}
              >
                <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{project.name}</span>
              </button>
            )
          )}
        </div>
      ) : null}
    </section>
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
  trashMode?: boolean;
}) {
  const editable = !props.trashMode && isMetadataEditable(props.item);
  const [expanded, setExpanded] = useState(false);
  const hasTags = props.tagDrafts.length > 0;

  const addButton = (
    <button
      type="button"
      aria-label={translate('gallery.app.addTags')}
      title={hasTags ? translate('gallery.app.addTags') : undefined}
      onClick={() => setExpanded(true)}
      className={
        hasTags
          ? `inline-flex h-7 w-7 items-center justify-center rounded-[6px]
            text-[var(--sniptale-color-text-muted)] transition-colors
            hover:bg-[var(--sniptale-color-surface-canvas)]
            hover:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-border-accent-strong)]`
          : `flex h-9 w-full items-center justify-start gap-2 rounded-[8px] border border-dashed
            border-[var(--sniptale-color-border-soft)] px-3 text-xs font-medium
            text-[var(--sniptale-color-text-secondary)] transition-colors
            hover:border-[var(--sniptale-color-border-strong)]
            hover:bg-[var(--sniptale-color-surface-canvas)]
            hover:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-border-accent-strong)]`
      }
    >
      {hasTags ? (
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <>
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          {translate('gallery.app.addTags')}
        </>
      )}
    </button>
  );

  return (
    <div>
      <div className="mb-2 flex min-h-7 items-center justify-between gap-2">
        <div
          className="text-xs font-semibold uppercase tracking-[0.12em]
            text-[var(--sniptale-color-text-muted-strong)]"
        >
          {translate('gallery.preview.tags')}
        </div>
        {editable && hasTags && !expanded ? addButton : null}
        {editable && expanded ? (
          <button
            type="button"
            aria-label={translate('gallery.app.closeTagEditor')}
            title={translate('gallery.app.closeTagEditor')}
            onClick={() => setExpanded(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px]
              text-[var(--sniptale-color-text-muted)] transition-colors
              hover:bg-[var(--sniptale-color-surface-canvas)]
              hover:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none
              focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-border-accent-strong)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        <PreviewTagList
          {...(editable ? { onRemoveTag: props.onRemoveTag } : {})}
          tagDrafts={props.tagDrafts}
        />
        {!editable && !hasTags ? (
          <div className="text-sm text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.preview.tagsEmpty')}
          </div>
        ) : null}
        {editable && !hasTags && !expanded ? addButton : null}
        {editable && expanded ? (
          <GalleryTagInput
            allTags={props.allTags ?? []}
            autoFocus
            excludeTags={props.tagDrafts}
            onChange={props.onTagDraftChange}
            onSubmit={(tag) => {
              props.onAddTag(tag);
              setExpanded(false);
            }}
            placeholder={translate('gallery.preview.tagInputPlaceholder')}
            value={props.tagDraft}
          />
        ) : null}
      </div>
    </div>
  );
}

export function PreviewActions(props: PreviewPanelProps & { onReview?: () => void }) {
  if (props.trashMode) return null;
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
  const canOpenVideo = isGalleryMediaItem(item) && item.source.kind === 'recording';
  const canOpenPrimaryAction =
    canOpenGalleryProject(item) ||
    canCopy ||
    canOpenWebSnapshot ||
    canOpenRecordingGroup ||
    canOpenVideo;
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
    <section key={item.id} aria-labelledby="preview-actions-heading">
      <div id="preview-actions-heading" className={previewActionGroupLabelClassName}>
        {translate('gallery.preview.actions')}
      </div>
      <div className="space-y-3">
        {props.onReview || canOpenPrimaryAction ? (
          <div className="space-y-1">
            {props.onReview ? (
              <button
                type="button"
                data-ui="gallery.videoReview.enter"
                onClick={props.onReview}
                className={previewActionButtonClassName}
              >
                <Clapperboard className="h-4 w-4 shrink-0" aria-hidden="true" />
                {translate('gallery.videoReview.enter')}
              </button>
            ) : null}
            {canOpenPrimaryAction ? (
              <button type="button" onClick={onEdit} className={previewActionButtonClassName}>
                {canOpenVideo ? (
                  <Film className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                {translate(
                  canOpenVideo
                    ? 'gallery.videoReview.openVideoEditor'
                    : canOpenWebSnapshot
                      ? 'gallery.preview.openSnapshot'
                      : canOpenRecordingGroup
                        ? 'gallery.preview.openRecordingGroup'
                        : 'gallery.preview.openInEditor'
                )}
              </button>
            ) : null}
          </div>
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
              <PreviewActionButton
                icon={Download}
                onClick={onDownload}
                success={translate('gallery.preview.downloadStarted')}
              >
                {translate('gallery.preview.download')}
              </PreviewActionButton>
            ) : null}
            {hasEditedImageContent && props.onDownloadOriginal ? (
              <PreviewActionButton
                icon={FileDown}
                onClick={() => props.onDownloadOriginal?.()}
                success={translate('gallery.preview.downloadStarted')}
              >
                {translate('gallery.preview.downloadOriginal')}
              </PreviewActionButton>
            ) : null}
            {canCopy ? (
              <PreviewActionButton
                icon={Copy}
                onClick={onCopy}
                success={translate('gallery.preview.copied')}
              >
                {translate('gallery.preview.copy')}
              </PreviewActionButton>
            ) : null}
            {canUseImageAggregateActions && props.onSaveCopy ? (
              <PreviewActionButton
                icon={Save}
                onClick={() => props.onSaveCopy?.()}
                success={translate('gallery.preview.copySaved')}
              >
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

export function PreviewPromotionAction(
  props: Pick<PreviewPanelProps, 'item' | 'onPromote' | 'trashMode'>
) {
  if (props.trashMode || props.item.lifecycle?.storageClass !== 'temporary' || !props.onPromote) {
    return null;
  }

  return (
    <div className="mt-3">
      <PromotionAction
        className={previewActionButtonClassName}
        onPromote={props.onPromote}
        visible
      />
    </div>
  );
}
