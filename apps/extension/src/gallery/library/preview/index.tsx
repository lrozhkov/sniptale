import { hasGalleryKeyboardLayer } from '../keyboard/context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { VideoReview } from '../../video-review';
import { translate } from '../../../platform/i18n';
import { PreviewSourceField } from './source-field';
import { isGalleryMediaItem, isGalleryScenarioItem, isGalleryVideoProjectItem } from '../items';
import type { GalleryPreviewPresentation } from '../types';
import type { PreviewPanelProps } from './types';
import { PreviewInspectorControls } from './inspector-controls';
import { PreviewMedia } from './media';
import {
  PreviewActions,
  PreviewMetadataCards,
  PreviewProjectUsage,
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
    <div className="shrink-0" data-ui="gallery.preview.inspectorHeader">
      <div className="min-w-0">
        <h2 className="flex min-h-9 items-center pr-20 text-base font-semibold">
          {getGalleryItemKindLabel(props.item.kind)}
        </h2>
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

function PreviewPanelSidebar(
  props: PreviewPanelProps & { onReview?: () => void; pending?: boolean }
) {
  return (
    <aside
      data-ui="gallery.preview.inspector"
      className="flex min-h-0 w-full flex-col overflow-hidden border-l border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] p-3 text-[var(--sniptale-color-text-primary)]"
    >
      <PreviewPanelHeader {...props} />
      <div
        data-ui="gallery.preview.inspectorContent"
        inert={props.pending}
        aria-busy={props.pending}
        className="mt-4 min-h-0 space-y-4 overflow-y-auto"
      >
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
        <PreviewActions key={props.item.id} {...props} />
      </div>
    </aside>
  );
}

function isPreviewEditingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement &&
      Boolean(target.closest('[role="listbox"], [aria-haspopup="listbox"]'))) ||
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
  const initialReview =
    !props.trashMode &&
    props.initialMode === 'edit' &&
    isGalleryMediaItem(item) &&
    item.mimeType.startsWith('video/');
  const [reviewState, setReviewState] = useState(() => ({
    itemId: item.id,
    active: initialReview,
  }));
  const review = reviewState.itemId === item.id ? reviewState.active : initialReview;
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setReviewState((current) =>
      current.itemId === item.id ? current : { itemId: item.id, active: initialReview }
    );
  }, [initialReview, item.id]);

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
          setReviewState({ itemId: item.id, active: false });
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
        setReviewState({ itemId: item.id, active: true });
      }}
    />
  );
}

/** Preview-only layout; the parent owns editor mode and keyboard/focus lifecycle. */
function PreviewPanelSurface(props: PreviewPanelProps & { onReview(): void }) {
  const { onReview, ...panel } = props;
  const { item, previewUrl, onPresented } = panel;
  const inspectorCollapsed = !props.trashMode && props.inspectorCollapsed;
  const dialogRef = useRef<HTMLDivElement>(null);
  const [presentation, setPresentation] = useState<{
    itemId: string;
    requestRevision: number;
    url: string | null;
    outcome: 'presented' | 'terminal';
  } | null>(null);
  const handlePresented = useCallback(
    (next: GalleryPreviewPresentation) => {
      setPresentation({ ...next, itemId: item.id });
      onPresented?.(next);
    },
    [item.id, onPresented]
  );
  const pending =
    isGalleryMediaItem(item) &&
    !(
      presentation?.itemId === item.id &&
      presentation.requestRevision === (props.previewRequestRevision ?? 0) &&
      (presentation.outcome === 'terminal' || presentation.url === previewUrl)
    );
  useEffect(() => {
    if (!props.trashMode) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const managedByList =
      props.listFocusReturn && Boolean(opener?.closest('[data-gallery-keyboard-id]'));
    return () => {
      queueMicrotask(() => {
        if (managedByList || hasGalleryKeyboardLayer()) return;
        const fallback = document.querySelector<HTMLElement>(
          '[data-ui="gallery.header.search"] input, [data-ui="gallery.sidebar.footer"] button'
        );
        (opener?.isConnected ? opener : fallback)?.focus();
      });
    };
  }, [props.trashMode, props.listFocusReturn]);
  useEffect(() => {
    if (props.trashMode)
      dialogRef.current
        ?.querySelector<HTMLButtonElement>('[data-ui="gallery.preview.restore"]')
        ?.focus();
  }, [props.trashMode, item.id]);

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
        ).filter((control) => !control.closest('[inert]'));
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
          className={`relative grid h-full w-full min-w-0 overflow-hidden
            rounded-[var(--sniptale-radius-lg)]
            border border-[var(--sniptale-color-border-soft)]
            bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)]
            text-[var(--sniptale-color-text-primary)] shadow-sm
            ${inspectorCollapsed ? 'grid-cols-[minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)_360px]'}`}
        >
          <PreviewMedia
            onEdit={props.onEdit}
            trashMode={Boolean(props.trashMode)}
            item={item}
            previewUrl={previewUrl}
            previewLoadStatus={props.previewLoadStatus}
            previewRequestRevision={props.previewRequestRevision}
            onPresented={handlePresented}
            inspectorCollapsed={inspectorCollapsed}
            {...(props.navigation ? { navigation: props.navigation } : {})}
          />
          {inspectorCollapsed ? null : (
            <PreviewPanelSidebar
              {...panel}
              pending={pending}
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
          <div
            data-ui="gallery.preview.windowControls"
            className="absolute right-3 top-3 z-20 flex items-center gap-1"
          >
            <PreviewInspectorControls {...panel} inspectorCollapsed={inspectorCollapsed} />
          </div>
        </div>
      </div>
    </div>
  );
}
