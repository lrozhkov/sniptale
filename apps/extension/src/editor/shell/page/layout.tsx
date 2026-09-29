import React, { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate } from '../../../platform/i18n';
import { EditorCommandPalette } from '../command-palette';
import { CanvasWrapper } from '../../workspace/canvas';
import {
  EDITOR_CANVAS_CONTEXT_MENU_DATA_UI,
  EDITOR_CANVAS_CONTEXT_SURFACE_DATA_UI,
  EDITOR_CANVAS_EMPTY_DROPZONE_DATA_UI,
} from '../../workspace/canvas/context-menu/types';
import { EditorFloatingWorkspace } from '../../workspace/floating';
import type { EditorOpenStatus } from '../../runtime/open-status';

const EDITOR_PAGE_ROOT_CLASS_NAME = [
  'sniptale-extension-surface relative h-screen min-h-0 min-w-[1280px] overflow-hidden',
  'bg-[var(--sniptale-color-surface-canvas)]',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');

const editorOpenLoadingCardClassName = [
  'flex items-center gap-3 rounded-xl px-5 py-4 shadow-lg',
  'bg-[var(--sniptale-color-surface-panel)]',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');

const editorOpenErrorClassName = [
  'absolute inset-x-4 top-4 z-50 mx-auto max-w-lg',
  'rounded-xl border border-[var(--sniptale-color-border-soft)] p-4 shadow-lg',
  'bg-[var(--sniptale-color-surface-panel)]',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');

const EDITOR_CANVAS_CONTEXT_MENU_SELECTOR = [
  `[data-ui="${EDITOR_CANVAS_CONTEXT_MENU_DATA_UI}"]`,
  `[data-ui="${EDITOR_CANVAS_CONTEXT_SURFACE_DATA_UI}"]`,
  `[data-ui="${EDITOR_CANVAS_EMPTY_DROPZONE_DATA_UI}"]`,
].join(', ');

function shouldAllowEditorPageContextMenu(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(EDITOR_CANVAS_CONTEXT_MENU_SELECTOR));
}

function handleEditorPageContextMenuCapture(event: React.MouseEvent<HTMLDivElement>) {
  if (shouldAllowEditorPageContextMenu(event.target)) {
    return;
  }

  event.preventDefault();
}

export function EditorPageLayout(props: {
  commandPaletteOpen: boolean;
  hasImage: boolean;
  openStatus: EditorOpenStatus;
  onCloseCommandPalette: () => void;
  onRecoverOriginal: () => Promise<void>;
  afterLayout?: React.ReactNode;
  startPage?: React.ReactNode;
}) {
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);

  const recoverOriginal = async () => {
    setRecoveryFailed(false);
    try {
      await props.onRecoverOriginal();
      setConfirmRecovery(false);
    } catch (error) {
      setRecoveryFailed(true);
      throw error;
    }
  };

  return (
    <div
      data-ui="editor.page.root"
      className={EDITOR_PAGE_ROOT_CLASS_NAME}
      onContextMenuCapture={handleEditorPageContextMenuCapture}
    >
      <div className="absolute inset-0 min-h-0 min-w-0" data-ui="editor.canvas.layer">
        <CanvasWrapper hasImage={props.hasImage} />
      </div>
      <div
        className={
          props.hasImage || !props.startPage ? 'contents' : 'invisible pointer-events-none'
        }
        aria-hidden={!props.hasImage && Boolean(props.startPage)}
      >
        <EditorFloatingWorkspace hasImage={props.hasImage} />
      </div>
      <EditorCommandPalette
        hasImage={props.hasImage}
        isOpen={props.commandPaletteOpen}
        onClose={props.onCloseCommandPalette}
      />
      {!props.hasImage && props.startPage && props.openStatus !== 'loading' ? (
        <div className="absolute inset-0 z-40" data-ui="editor.page.start">
          {props.startPage}
        </div>
      ) : null}
      {props.openStatus === 'loading' ? (
        <div
          className="absolute inset-0 z-50 grid place-items-center bg-[var(--sniptale-color-surface-canvas)]/80"
          data-ui="editor.page.open-loading"
          role="status"
          aria-live="polite"
        >
          <div className={editorOpenLoadingCardClassName}>
            <LoaderCircle
              aria-hidden="true"
              className="size-5 animate-spin motion-reduce:animate-none"
            />
            <span>{translate('editor.page.loadingImage')}</span>
          </div>
        </div>
      ) : null}
      {props.openStatus === 'error' ? (
        <div
          className={`pointer-events-none ${editorOpenErrorClassName}`}
          data-ui="editor.page.open-error"
          role="alert"
        >
          <p className="font-semibold">{translate('editor.page.openFailedTitle')}</p>
          <p className="mt-1 text-sm text-[var(--sniptale-color-text-muted)]">
            {translate('editor.page.openFailedHint')}
          </p>
        </div>
      ) : null}
      {props.openStatus === 'missing' ? (
        <div className={editorOpenErrorClassName} data-ui="editor.page.open-missing" role="alert">
          <p className="font-semibold">{translate('editor.page.documentFileMissingTitle')}</p>
          <p className="mt-1 text-sm text-[var(--sniptale-color-text-muted)]">
            {translate('editor.page.documentFileMissingHint')}
          </p>
          <ProductActionButton
            compact
            tone="secondary"
            className="mt-3"
            data-ui="editor.page.recover-original"
            onClick={() => {
              setRecoveryFailed(false);
              setConfirmRecovery(true);
            }}
          >
            {translate('editor.page.recoverOriginalAction')}
          </ProductActionButton>
        </div>
      ) : null}
      {confirmRecovery && props.openStatus === 'missing' ? (
        <ProductConfirmDialog
          title={translate('editor.page.recoverOriginalTitle')}
          message={
            <>
              {translate('editor.page.recoverOriginalMessage')}
              {recoveryFailed ? (
                <p className="mt-2 text-[var(--sniptale-color-text-danger)]" role="alert">
                  {translate('editor.page.recoverOriginalFailed')}
                </p>
              ) : null}
            </>
          }
          confirmText={translate('editor.page.recoverOriginalConfirm')}
          cancelText={translate('editor.page.recoverOriginalCancel')}
          onConfirm={recoverOriginal}
          onCancel={() => setConfirmRecovery(false)}
        />
      ) : null}
      {props.afterLayout}
    </div>
  );
}
