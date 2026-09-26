import { Images, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { FloatingChromeToolbar, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { useEditorStore } from '../../state/useEditorStore';
import { EditorFloatingDocumentQuickActions } from './document-bar-quick-actions';
import type { EditorFloatingDocumentBarProps } from './document-bar-types';
import { getMediaLibraryEntry } from '../../../composition/persistence/media-library';
import { StaleImageWorkspaceError } from '../../../composition/persistence/image-aggregates';
import type { LibraryStorageClass } from '../../../contracts/settings/library-lifecycle';
import { useEditorController } from '../../application/controller-context';
import { connectAggregateEditorPresence } from '../../../workflows/aggregate-editor-presence/client';
import { useEditorEmbedContext } from '../../application/embed-context/context';
import { promoteEditorImageToLibrary } from '../../workflows/promote-image-to-library';
import { saveStaleEditorImageCopy } from '../../workflows/save-stale-image-copy';
import { DocumentSaveError } from './document-save-conflict';
import { DocumentAutosaveStatus } from './document-autosave-status';
import { EditorDocumentTitleEditor } from './document-title';
import { EditorAnchoredAlert } from './anchored-feedback';
export type { EditorFloatingDocumentController } from './document-bar-types';

const DOCUMENT_BAR_CLASS_NAME = floatingChromeClassNames(
  'absolute left-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)]',
  'items-center overflow-visible max-[720px]:right-3'
);

const DOCUMENT_TITLE_CLASS_NAME = [
  'flex min-w-[8rem] max-w-[18rem] max-[1799px]:max-w-[11rem] flex-col px-2.5',
  'max-[720px]:min-w-0 max-[720px]:max-w-[9.5rem]',
].join(' ');

const DOCUMENT_STATUS_CLASS_NAME = [
  'mt-0.5 flex min-h-3 items-center gap-1.5 text-[11px] leading-none',
  'text-[var(--sniptale-color-text-muted)]',
].join(' ');

const DOCUMENT_STORAGE_BADGE_CLASS_NAME = 'max-w-full truncate rounded px-1 py-0.5';

const DOCUMENT_STORAGE_BADGE_LIBRARY_CLASS_NAME = 'text-[var(--sniptale-color-text-secondary)]';

const DOCUMENT_STORAGE_BADGE_DRAFT_CLASS_NAME = [
  'border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_55%,var(--sniptale-color-border-soft)_45%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-warning)_12%,transparent)]',
  'text-[var(--sniptale-color-warning)]',
].join(' ');

const DOCUMENT_PROMOTION_BUTTON_CLASS_NAME = [
  'relative shrink-0',
  'motion-safe:transition-[opacity,transform] motion-safe:duration-150',
].join(' ');

const DOCUMENT_PROMOTION_STATE_CLASS_NAME = {
  library: 'scale-90 opacity-0',
  temporary:
    'scale-100 opacity-100 !bg-[color:color-mix(in_srgb,var(--sniptale-color-warning)_12%,transparent)] ' +
    '!text-[var(--sniptale-color-warning)]',
} as const;

type InFlightDocumentOperation = {
  aggregateId: string;
  kind: 'copy' | 'promote';
  promise: Promise<void>;
  token: symbol;
};

type DocumentOperationFeedback = {
  aggregateId: string | null;
  state: 'idle' | 'saving' | 'error';
};

type ActiveDocumentGeneration = {
  aggregateId: string | null;
  generation: number;
};

function useDocumentBarState() {
  return useEditorStore(
    useShallow((state) => ({
      pageTitle: state.pageTitle,
      saveErrorMessage: state.saveErrorMessage,
      saveState: state.saveState,
      sessionId: state.sessionId,
    }))
  );
}

function updateActiveDocumentGeneration(
  activeDocumentRef: { current: ActiveDocumentGeneration },
  aggregateId: string | null,
  enabled: boolean
) {
  const activeAggregateId = enabled ? aggregateId : null;
  if (activeDocumentRef.current.aggregateId !== activeAggregateId) {
    activeDocumentRef.current = {
      aggregateId: activeAggregateId,
      generation: activeDocumentRef.current.generation + 1,
    };
  }
}

function useDocumentLibraryStatus(aggregateId: string | null, enabled: boolean) {
  const [libraryStatus, setLibraryStatus] = useState<{
    aggregateId: string;
    storageClass: LibraryStorageClass;
    promotionButtonVisible: boolean;
  } | null>(null);
  const activeStatus = enabled && libraryStatus?.aggregateId === aggregateId ? libraryStatus : null;
  const storageClass = activeStatus?.storageClass ?? null;
  const promotionButtonVisible = activeStatus?.promotionButtonVisible ?? false;
  const setStorageClass = useCallback(
    (next: LibraryStorageClass) => {
      if (!aggregateId) return;
      setLibraryStatus((current) => ({
        aggregateId,
        promotionButtonVisible:
          current?.aggregateId === aggregateId && current.promotionButtonVisible,
        storageClass: next,
      }));
    },
    [aggregateId]
  );

  useEffect(() => {
    if (!enabled || !aggregateId) return;
    let cancelled = false;
    void getMediaLibraryEntry(aggregateId)
      .then((entry) => {
        if (cancelled) return;
        const next = entry?.lifecycle?.storageClass ?? 'temporary';
        setLibraryStatus({
          aggregateId,
          storageClass: next,
          promotionButtonVisible: next === 'temporary',
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLibraryStatus({ aggregateId, storageClass: 'temporary', promotionButtonVisible: true });
      });
    return () => {
      cancelled = true;
    };
  }, [aggregateId, enabled]);

  useEffect(() => {
    if (storageClass !== 'library' || !promotionButtonVisible) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setLibraryStatus((current) =>
        current?.aggregateId === aggregateId
          ? { ...current, promotionButtonVisible: false }
          : current
      );
      return;
    }
    const timer = window.setTimeout(
      () =>
        setLibraryStatus((current) =>
          current?.aggregateId === aggregateId
            ? { ...current, promotionButtonVisible: false }
            : current
        ),
      180
    );
    return () => window.clearTimeout(timer);
  }, [aggregateId, promotionButtonVisible, storageClass]);

  return { promotionButtonVisible, setStorageClass, storageClass };
}

function useDocumentStorageClass(aggregateId: string | null, pageTitle: string, enabled: boolean) {
  const editorController = useEditorController();
  const { promotionButtonVisible, setStorageClass, storageClass } = useDocumentLibraryStatus(
    aggregateId,
    enabled
  );
  const [operationFeedback, setOperationFeedback] = useState<DocumentOperationFeedback>({
    aggregateId: null,
    state: 'idle',
  });
  const inFlightOperationsRef = useRef(new Map<string, InFlightDocumentOperation>());
  const activeDocumentRef = useRef<ActiveDocumentGeneration>({
    aggregateId: enabled ? aggregateId : null,
    generation: 0,
  });
  updateActiveDocumentGeneration(activeDocumentRef, aggregateId, enabled);

  const promote = useCallback((): Promise<void> => {
    const autosaveService = editorController.autosaveService;
    if (!aggregateId || !autosaveService) {
      return Promise.reject(new Error('Image autosave is unavailable.'));
    }
    const current = inFlightOperationsRef.current.get(aggregateId);
    if (current?.kind === 'promote') {
      return current.promise;
    }
    if (current) {
      return Promise.reject(new Error('Another image operation is already in progress.'));
    }
    if (activeDocumentRef.current.aggregateId !== aggregateId) {
      return Promise.reject(new Error('The active image changed before promotion started.'));
    }
    const token = Symbol(`promote:${aggregateId}`);
    const promise = (async () => {
      setOperationFeedback({ aggregateId, state: 'saving' });
      try {
        await promoteEditorImageToLibrary({
          aggregateId,
          port: {
            saveNow: (serialize) => autosaveService.saveNow(serialize),
            getDurableRevision: () => autosaveService.getDurableRevision(),
            renderPresentation: () =>
              editorController.renderForExport({ format: 'png', quality: 1 }),
            serializeDocument: () => editorController.exportDocument(),
          },
        });
        if (activeDocumentRef.current.aggregateId !== aggregateId) return;
        setStorageClass('library');
        setOperationFeedback({ aggregateId, state: 'idle' });
      } catch (error) {
        if (activeDocumentRef.current.aggregateId === aggregateId) {
          setOperationFeedback({ aggregateId, state: 'error' });
        }
        throw error;
      } finally {
        if (inFlightOperationsRef.current.get(aggregateId)?.token === token) {
          inFlightOperationsRef.current.delete(aggregateId);
        }
      }
    })();
    inFlightOperationsRef.current.set(aggregateId, {
      aggregateId,
      kind: 'promote',
      promise,
      token,
    });
    return promise;
  }, [aggregateId, editorController, setStorageClass]);

  const saveConflictCopy = useCallback((): Promise<void> => {
    const sourceAggregateId = activeDocumentRef.current.aggregateId;
    const sourceGeneration = activeDocumentRef.current.generation;
    const autosaveService = editorController.autosaveService;
    if (!sourceAggregateId || !autosaveService) {
      return Promise.reject(new Error('Image autosave is unavailable.'));
    }
    if (inFlightOperationsRef.current.has(sourceAggregateId)) {
      return Promise.reject(new Error('Another image operation is already in progress.'));
    }
    const token = Symbol(`copy:${sourceAggregateId}`);
    const promise = (async () => {
      setOperationFeedback({ aggregateId: sourceAggregateId, state: 'saving' });
      try {
        const result = await saveStaleEditorImageCopy({
          autosaveService,
          controller: editorController,
          isSourceActive: () =>
            activeDocumentRef.current.aggregateId === sourceAggregateId &&
            activeDocumentRef.current.generation === sourceGeneration,
          pageTitle,
          sourceAggregateId,
        });
        if (result === 'stale') return;
        setStorageClass('library');
        setOperationFeedback({ aggregateId: sourceAggregateId, state: 'idle' });
      } catch (error) {
        if (activeDocumentRef.current.aggregateId === sourceAggregateId) {
          setOperationFeedback({ aggregateId: sourceAggregateId, state: 'error' });
        }
        throw error;
      } finally {
        if (inFlightOperationsRef.current.get(sourceAggregateId)?.token === token) {
          inFlightOperationsRef.current.delete(sourceAggregateId);
        }
      }
    })();
    inFlightOperationsRef.current.set(sourceAggregateId, {
      aggregateId: sourceAggregateId,
      kind: 'copy',
      promise,
      token,
    });
    return promise;
  }, [editorController, pageTitle, setStorageClass]);

  useEffect(() => {
    if (!enabled || !aggregateId) return;
    const presence = connectAggregateEditorPresence({
      aggregate: { id: aggregateId, kind: 'image' },
      promote,
    });
    return () => presence.dispose();
  }, [aggregateId, enabled, promote]);

  return {
    hasStaleConflict:
      editorController.autosaveService?.getLastWriteError() instanceof StaleImageWorkspaceError,
    promote,
    promotionState:
      enabled && aggregateId && inFlightOperationsRef.current.has(aggregateId)
        ? 'saving'
        : operationFeedback.aggregateId === aggregateId
          ? operationFeedback.state
          : 'idle',
    promotionButtonVisible,
    saveConflictCopy,
    storageClass,
  };
}

function resolveDocumentTitle(pageTitle: string, hasImage: boolean): string {
  const trimmedTitle = pageTitle.trim();
  if (trimmedTitle) {
    return trimmedTitle;
  }

  return hasImage ? translate('editor.page.documentTitle') : translate('editor.page.title');
}

function EditorFloatingDocumentSummary(props: {
  documentState: ReturnType<typeof useDocumentBarState>;
  hasImage: boolean;
  standalone: boolean;
  onEdit: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const storage = useDocumentStorageClass(
    props.documentState.sessionId,
    props.documentState.pageTitle,
    props.standalone && props.hasImage
  );
  const promotionButtonRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className={DOCUMENT_TITLE_CLASS_NAME}>
        <button
          ref={props.triggerRef}
          data-ui="editor.floating.document-bar.title"
          type="button"
          disabled={!props.hasImage}
          onClick={props.onEdit}
          title={resolveDocumentTitle(props.documentState.pageTitle, props.hasImage)}
          className={[
            'truncate rounded text-left text-sm font-semibold leading-snug',
            'text-[var(--sniptale-color-text-primary)] hover:underline focus-visible:outline',
            'focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-accent)]',
            'disabled:no-underline',
          ].join(' ')}
        >
          {resolveDocumentTitle(props.documentState.pageTitle, props.hasImage)}
        </button>
        {props.hasImage && props.standalone ? (
          <div className={DOCUMENT_STATUS_CLASS_NAME}>
            <span
              className={[
                DOCUMENT_STORAGE_BADGE_CLASS_NAME,
                storage.storageClass === 'library'
                  ? DOCUMENT_STORAGE_BADGE_LIBRARY_CLASS_NAME
                  : DOCUMENT_STORAGE_BADGE_DRAFT_CLASS_NAME,
              ].join(' ')}
              data-storage-class={storage.storageClass === 'library' ? 'library' : 'temporary'}
            >
              {translate(
                storage.storageClass === 'library'
                  ? 'editor.documentActions.inLibrary'
                  : 'editor.documentActions.draft'
              )}
            </span>
            {storage.hasStaleConflict || props.documentState.saveState === 'error' ? (
              <DocumentSaveError
                key={`save-error:${props.documentState.sessionId}`}
                conflict={storage.hasStaleConflict}
                pending={storage.promotionState === 'saving'}
                onSaveCopy={storage.saveConflictCopy}
              />
            ) : null}
            <DocumentAutosaveStatus
              key={`autosave:${props.documentState.sessionId}`}
              saveState={props.documentState.saveState}
              hasSaveError={storage.hasStaleConflict || props.documentState.saveState === 'error'}
            />
          </div>
        ) : null}
      </div>
      {storage.promotionButtonVisible ? (
        <ContentToolbarButton
          ref={promotionButtonRef}
          title={translate(
            storage.promotionState === 'saving'
              ? 'editor.documentActions.savingToLibrary'
              : 'editor.documentActions.saveToLibrary'
          )}
          disabled={storage.promotionState === 'saving'}
          aria-busy={storage.promotionState === 'saving'}
          className={[
            DOCUMENT_PROMOTION_BUTTON_CLASS_NAME,
            storage.storageClass === 'library'
              ? DOCUMENT_PROMOTION_STATE_CLASS_NAME.library
              : DOCUMENT_PROMOTION_STATE_CLASS_NAME.temporary,
          ].join(' ')}
          onClick={() => void storage.promote().catch(() => undefined)}
          dataUi="editor.floating.document-bar.promote-button"
          aria-label={translate(
            storage.promotionState === 'saving'
              ? 'editor.documentActions.savingToLibrary'
              : 'editor.documentActions.saveToLibrary'
          )}
        >
          {storage.promotionState === 'saving' ? (
            <LoaderCircle
              size={16}
              strokeWidth={2}
              className="motion-safe:animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Images size={16} strokeWidth={2} aria-hidden="true" />
          )}
        </ContentToolbarButton>
      ) : null}
      {storage.promotionState === 'error' ? (
        <EditorAnchoredAlert
          anchorEl={promotionButtonRef.current}
          dataUi="editor.floating.document-bar.promotion-error"
        >
          {translate('editor.documentActions.saveToLibraryError')}
        </EditorAnchoredAlert>
      ) : null}
    </>
  );
}

export function EditorFloatingDocumentBar(props: EditorFloatingDocumentBarProps) {
  const documentState = useDocumentBarState();
  const embed = useEditorEmbedContext();
  const standalone = embed.mode !== 'scenario';

  return (
    <div data-ui="editor.floating.document-bar" className={DOCUMENT_BAR_CLASS_NAME}>
      <FloatingChromeToolbar dataUi="editor.floating.document-bar.surface">
        <EditorDocumentTitleEditor
          hasImage={props.hasImage}
          title={documentState.pageTitle}
          aggregateId={documentState.sessionId}
        >
          {(onEdit, triggerRef) => (
            <>
              {standalone && (
                <EditorFloatingDocumentSummary
                  documentState={documentState}
                  hasImage={props.hasImage}
                  standalone={standalone}
                  onEdit={onEdit}
                  triggerRef={triggerRef}
                />
              )}
              <EditorFloatingDocumentQuickActions
                documentController={props.documentController}
                hasImage={props.hasImage}
                onBeforeSelectionAwareAction={props.onBeforeSelectionAwareAction}
              />
            </>
          )}
        </EditorDocumentTitleEditor>
      </FloatingChromeToolbar>
    </div>
  );
}
