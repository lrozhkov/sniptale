import { useEffect, useRef, useState } from 'react';
import { VideoReview } from '../../video-review';
import { translate } from '../../../platform/i18n';
import { PreviewSourceField } from './source-field';
import { isGalleryMediaItem, isGalleryScenarioItem, isGalleryVideoProjectItem } from '../items';
import type { PreviewPanelProps } from './types';
import { PreviewMedia } from './media';
import {
  PreviewActions,
  PreviewMetadataCards,
  PreviewProjectUsage,
  PreviewPromotionAction,
  PreviewTagEditor,
} from './sidebar-sections';
import { formatDate, getGalleryItemKindLabel } from '../ui';

function isMetadataEditable(item: PreviewPanelProps['item']) {
  return isGalleryMediaItem(item) || isGalleryScenarioItem(item);
}

function UnavailableProjectNotice({ item }: Pick<PreviewPanelProps, 'item'>) {
  if (!isGalleryVideoProjectItem(item) || !item.unavailableReason) return null;
  const reasonKey =
    item.unavailableReason === 'unsupported-engine1'
      ? 'gallery.preview.unavailableUnsupportedProject'
      : 'gallery.preview.unavailableInvalidProject';
  return (
    <div
      role="alert"
      className="rounded-[8px] border border-[var(--sniptale-color-danger)] p-3 text-xs"
    >
      <p>{translate(reasonKey)}</p>
      <p className="mt-1 text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.preview.unavailableProjectRecovery')}
      </p>
    </div>
  );
}

function PreviewPanelHeader(props: Pick<PreviewPanelProps, 'item'>) {
  const isDraft = props.item.lifecycle?.storageClass === 'temporary';

  return (
    <div>
      <div>
        <div
          className="text-xs font-semibold uppercase tracking-[0.14em]
            text-[var(--sniptale-color-text-muted-strong)]"
        >
          {translate('gallery.preview.inspector')}
        </div>
        <h2 className="mt-1 text-base font-semibold">{getGalleryItemKindLabel(props.item.kind)}</h2>
        <div className="mt-1 text-sm text-[var(--sniptale-color-text-muted)]">
          {formatDate(props.item.createdAt)}
        </div>
        {isDraft ? (
          <div className="mt-1 text-xs font-medium text-[var(--sniptale-color-warning)]">
            {props.item.expiresAt
              ? `${translate('gallery.app.draftExpires')} ${formatDate(props.item.expiresAt)}`
              : translate('gallery.app.draftNoExpiration')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PreviewFilenameField(
  props: Pick<PreviewPanelProps, 'filenameDraft' | 'item' | 'onFilenameChange' | 'trashMode'>
) {
  const editable = !props.trashMode && isMetadataEditable(props.item);

  return (
    <div>
      <label
        className="mb-2 block text-xs font-semibold uppercase
          tracking-[0.12em] text-[var(--sniptale-color-text-muted-strong)]"
      >
        {isGalleryScenarioItem(props.item)
          ? translate('gallery.preview.scenarioName')
          : translate('gallery.preview.filename')}
      </label>
      {props.trashMode ? (
        <p className="break-words text-sm text-[var(--sniptale-color-text-primary)]">
          {props.filenameDraft}
        </p>
      ) : (
        <input
          value={props.filenameDraft}
          onChange={(event) => props.onFilenameChange(event.target.value)}
          readOnly={!editable}
          className="w-full rounded-[8px] border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] px-3 py-2.5 text-sm
          text-[var(--sniptale-color-text-primary)] outline-none transition
          focus:border-[var(--sniptale-color-border-accent-strong)] read-only:cursor-default"
        />
      )}
    </div>
  );
}

function PreviewPanelSidebar(props: PreviewPanelProps & { onReview?: () => void }) {
  return (
    <aside
      className="min-h-0 w-full overflow-y-auto border-l border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] p-4 text-[var(--sniptale-color-text-primary)]"
    >
      <PreviewPanelHeader item={props.item} />
      {!props.trashMode ? (
        <PreviewPromotionAction
          item={props.item}
          {...(props.onPromote ? { onPromote: props.onPromote } : {})}
        />
      ) : null}
      <div className="mt-4 space-y-4">
        <PreviewFilenameField
          filenameDraft={props.filenameDraft}
          item={props.item}
          onFilenameChange={props.onFilenameChange}
          trashMode={Boolean(props.trashMode)}
        />
        <UnavailableProjectNotice item={props.item} />
        <PreviewMetadataCards item={props.item} />
        <PreviewProjectUsage item={props.item} trashMode={Boolean(props.trashMode)} />
        <PreviewSourceField item={props.item} trashMode={Boolean(props.trashMode)} />
        <PreviewTagEditor
          {...(props.allTags === undefined ? {} : { allTags: props.allTags })}
          item={props.item}
          trashMode={Boolean(props.trashMode)}
          tagDraft={props.tagDraft}
          tagDrafts={props.tagDrafts}
          onTagDraftChange={props.onTagDraftChange}
          onRemoveTag={props.onRemoveTag}
          onAddTag={props.onAddTag}
        />
        {!props.trashMode ? <PreviewActions {...props} /> : null}
      </div>
    </aside>
  );
}

function isPreviewEditingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function handlePreviewKeyDown(
  event: KeyboardEvent,
  navigation: PreviewPanelProps['navigation'],
  onClose: PreviewPanelProps['onClose']
) {
  if (event.defaultPrevented || document.fullscreenElement) return;
  if (event.key === 'Escape') {
    onClose();
    return;
  }
  if (isPreviewEditingTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  if (event.key === 'ArrowLeft' && navigation?.hasPrevious) {
    event.preventDefault();
    navigation.onPrevious();
  } else if (event.key === 'ArrowRight' && navigation?.hasNext) {
    event.preventDefault();
    navigation.onNext();
  }
}

export function PreviewPanel(props: PreviewPanelProps) {
  const { item, navigation, onClose } = props;
  const [review, setReview] = useState(
    () =>
      !props.trashMode &&
      props.initialMode === 'edit' &&
      isGalleryMediaItem(item) &&
      item.mimeType.startsWith('video/')
  );
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (review) return;
    const handleKeyDown = (event: KeyboardEvent) =>
      handlePreviewKeyDown(event, navigation, onClose);

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigation, onClose, review]);

  if (review && !props.trashMode)
    return (
      <VideoReview
        aggregateId={item.id}
        onClose={onClose}
        onBack={() => {
          setReview(false);
          requestAnimationFrame(() => {
            const button = document.querySelector<HTMLButtonElement>(
              '[data-ui="gallery.videoReview.enter"]'
            );
            (button ?? opener.current)?.focus();
          });
        }}
      />
    );

  return (
    <PreviewPanelSurface
      {...props}
      onReview={() => {
        if (props.trashMode) return;
        opener.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setReview(true);
      }}
    />
  );
}

/** Preview-only layout; the parent owns editor mode and keyboard/focus lifecycle. */
function PreviewPanelSurface(props: PreviewPanelProps & { onReview(): void }) {
  const { onReview, ...panel } = props;
  const { item, previewUrl, onClose } = panel;
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.trashMode) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current
      ?.querySelector<HTMLButtonElement>('[data-ui="gallery.preview.restore"]')
      ?.focus();
    return () => {
      queueMicrotask(() => {
        if (document.querySelector('[data-ui="gallery.preview.surface"]')) return;
        const fallback = document.querySelector<HTMLElement>(
          '[data-ui="gallery.header.search"] input, [data-ui="gallery.sidebar.footer"] button'
        );
        (opener?.isConnected ? opener : fallback)?.focus();
      });
    };
  }, [props.trashMode]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={item.filename}
      onKeyDown={(event) => {
        if (!props.trashMode || event.key !== 'Tab') return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'
          )
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      className="fixed inset-0 z-40 flex
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_72%,black_20%)]
      "
    >
      <div className="flex min-h-0 flex-1 px-4 py-4">
        <div
          data-ui="gallery.preview.surface"
          className={`grid h-full w-full min-w-0 overflow-hidden
            rounded-[var(--sniptale-radius-lg)]
            border border-[var(--sniptale-color-border-soft)]
            bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)]
            text-[var(--sniptale-color-text-primary)] shadow-sm
            ${props.inspectorCollapsed ? 'grid-cols-[minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)_360px]'}`}
        >
          <PreviewMedia
            onEdit={props.onEdit}
            trashMode={Boolean(props.trashMode)}
            restoreBusy={Boolean(props.restoreBusy)}
            {...(props.onRestoreTrash ? { onRestoreTrash: props.onRestoreTrash } : {})}
            item={item}
            previewUrl={previewUrl}
            previewLoadStatus={props.previewLoadStatus}
            inspectorCollapsed={props.inspectorCollapsed}
            {...(props.navigation ? { navigation: props.navigation } : {})}
            onInspectorToggle={props.onInspectorToggle}
            onClose={onClose}
          />
          {props.inspectorCollapsed ? null : (
            <PreviewPanelSidebar
              {...panel}
              {...(!props.trashMode &&
              isGalleryMediaItem(item) &&
              item.mimeType.startsWith('video/') &&
              previewUrl
                ? {
                    onReview,
                  }
                : {})}
            />
          )}
        </div>
      </div>
    </div>
  );
}
