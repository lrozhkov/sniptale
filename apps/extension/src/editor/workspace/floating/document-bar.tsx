import { Menu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  FloatingChromeDivider,
  FloatingChromePanel,
  FloatingChromeToolbar,
  floatingChromeClassNames,
} from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { useEditorStore } from '../../state/useEditorStore';
import { EditorInspectorDocumentActions } from '../../inspector/document-actions';
import { getDocumentRequiredTitle } from '../toolbar/section-helpers';
import { EditorFloatingDocumentQuickActions } from './document-bar-quick-actions';
import type { EditorFloatingDocumentBarProps } from './document-bar-types';
import { getMediaLibraryEntry } from '../../../composition/persistence/media-library';
import { getEditorSessionDraft } from '../../../composition/persistence/editor-sessions';
import { promoteStoredItem } from '../../../composition/persistence/library-lifecycle';
import type { LibraryStorageClass } from '../../../contracts/settings/library-lifecycle';
export type { EditorFloatingDocumentController } from './document-bar-types';

const DOCUMENT_BAR_CLASS_NAME = floatingChromeClassNames(
  'absolute left-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)]',
  'items-center overflow-visible max-[720px]:right-3'
);

const DOCUMENT_TITLE_CLASS_NAME = [
  'flex min-w-[8rem] max-w-[18rem] flex-col px-2.5',
  'max-[720px]:min-w-0 max-[720px]:max-w-[9.5rem]',
].join(' ');

const DOCUMENT_STATUS_CLASS_NAME = [
  'mt-0.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase leading-none',
  'text-[var(--sniptale-color-text-muted)]',
].join(' ');

const DOCUMENT_MENU_CLASS_NAME = floatingChromeClassNames(
  'absolute left-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(42rem,calc(100vh-5rem))]',
  'w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto p-3',
  '[scrollbar-gutter:stable_both-edges]'
);

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

function useDocumentStorageClass(sessionId: string | null) {
  const [storageClass, setStorageClass] = useState<LibraryStorageClass>('temporary');
  const [promotionState, setPromotionState] = useState<'idle' | 'saving' | 'error'>('idle');
  const assetId = new URLSearchParams(window.location.search).get('assetId');

  useEffect(() => {
    void (
      assetId ? getMediaLibraryEntry(assetId) : sessionId ? getEditorSessionDraft(sessionId) : null
    )?.then((entry) => setStorageClass(entry?.lifecycle?.storageClass ?? 'temporary'));
  }, [assetId, sessionId]);

  const promote = async () => {
    const target = assetId
      ? { kind: 'media' as const, id: assetId }
      : sessionId
        ? { kind: 'editor-session' as const, id: sessionId }
        : null;
    if (!target) return;
    setPromotionState('saving');
    try {
      await promoteStoredItem(target);
      setStorageClass('library');
      setPromotionState('idle');
    } catch {
      setPromotionState('error');
    }
  };

  return { promote, promotionState, storageClass };
}

function resolveDocumentTitle(pageTitle: string, hasImage: boolean): string {
  const trimmedTitle = pageTitle.trim();
  if (trimmedTitle) {
    return trimmedTitle;
  }

  return hasImage ? translate('editor.page.documentTitle') : translate('editor.page.title');
}

function resolveDocumentStatus(state: ReturnType<typeof useDocumentBarState>) {
  if (state.saveState === 'saving') {
    return translate('common.states.saving');
  }
  if (state.saveState === 'saved') {
    return translate('common.states.saved');
  }

  if (state.saveState === 'error') {
    return state.saveErrorMessage ?? translate('common.states.error');
  }

  return translate('common.states.saved');
}

function useDismissableMenu(open: boolean, onClose: () => void) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) {
        return;
      }

      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  return rootRef;
}

function EditorFloatingDocumentSummary(props: {
  documentState: ReturnType<typeof useDocumentBarState>;
  hasImage: boolean;
}) {
  const storage = useDocumentStorageClass(props.documentState.sessionId);
  return (
    <div className={DOCUMENT_TITLE_CLASS_NAME}>
      <div className="truncate text-sm font-semibold leading-snug text-[var(--sniptale-color-text-primary)]">
        {resolveDocumentTitle(props.documentState.pageTitle, props.hasImage)}
      </div>
      <div data-state={props.documentState.saveState} className={DOCUMENT_STATUS_CLASS_NAME}>
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--sniptale-color-accent)]" />
        <span className="truncate">{resolveDocumentStatus(props.documentState)}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--sniptale-color-text-muted)]">
        <span>
          {translate(
            storage.storageClass === 'library'
              ? 'editor.documentActions.inLibrary'
              : 'editor.documentActions.draft'
          )}
        </span>
        {storage.storageClass === 'temporary' ? (
          <button
            type="button"
            className="text-[var(--sniptale-color-accent-emphasis)] hover:underline"
            disabled={storage.promotionState === 'saving'}
            onClick={() => void storage.promote()}
          >
            {translate('editor.documentActions.saveToLibrary')}
          </button>
        ) : null}
        {storage.promotionState === 'error' ? (
          <span role="alert">{translate('editor.documentActions.saveToLibraryError')}</span>
        ) : null}
      </div>
    </div>
  );
}

function EditorFloatingDocumentMenu({
  documentController,
}: Pick<EditorFloatingDocumentBarProps, 'documentController'>) {
  return (
    <FloatingChromePanel
      dataUi="editor.floating.document-bar.file-menu"
      className={DOCUMENT_MENU_CLASS_NAME}
    >
      <EditorInspectorDocumentActions
        canvasSize={documentController.canvasSize}
        copyRenderedImageDisabledReason={documentController.copyRenderedImageDisabledReason}
        defaultImagePresetId={documentController.defaultImagePresetId}
        savePresets={documentController.savePresets}
        onCloseDocument={documentController.onCloseDocument}
        onCopyRenderedImage={documentController.onCopyRenderedImage}
        onExportSession={documentController.onExportSession}
        onImportSession={documentController.onImportSession}
        onOpenImage={documentController.onOpenImage}
        onSaveImage={documentController.onSaveImage}
        onSaveImageAs={documentController.onSaveImageAs}
        onSaveToPreset={documentController.saveToPreset}
      />
    </FloatingChromePanel>
  );
}

export function EditorFloatingDocumentBar(props: EditorFloatingDocumentBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useDismissableMenu(menuOpen, () => setMenuOpen(false));
  const documentState = useDocumentBarState();
  const fileMenuTitle = getDocumentRequiredTitle(
    translate('editor.documentActions.fileSection'),
    props.hasImage
  );

  return (
    <div ref={rootRef} data-ui="editor.floating.document-bar" className={DOCUMENT_BAR_CLASS_NAME}>
      <FloatingChromeToolbar dataUi="editor.floating.document-bar.surface">
        <ContentToolbarButton
          title={fileMenuTitle}
          active={menuOpen}
          disabled={!props.hasImage}
          onClick={() => setMenuOpen((open) => !open)}
          dataUi="editor.floating.document-bar.file-menu-button"
        >
          <Menu size={18} strokeWidth={2} />
        </ContentToolbarButton>
        <EditorFloatingDocumentSummary documentState={documentState} hasImage={props.hasImage} />
        <FloatingChromeDivider className="max-[720px]:hidden" />
        <EditorFloatingDocumentQuickActions
          documentController={props.documentController}
          hasImage={props.hasImage}
          onBeforeSelectionAwareAction={props.onBeforeSelectionAwareAction}
        />
      </FloatingChromeToolbar>
      {menuOpen ? (
        <EditorFloatingDocumentMenu documentController={props.documentController} />
      ) : null}
    </div>
  );
}
