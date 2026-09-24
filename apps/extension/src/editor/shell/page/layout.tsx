import React from 'react';
import { LoaderCircle } from 'lucide-react';
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
  'sniptale-extension-surface relative h-screen min-h-0 overflow-hidden',
  'bg-[var(--sniptale-color-surface-canvas)]',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');

const editorOpenLoadingCardClassName = [
  'flex items-center gap-3 rounded-xl px-5 py-4 shadow-lg',
  'bg-[var(--sniptale-color-surface-panel)]',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');

const editorOpenErrorClassName = [
  'pointer-events-none absolute inset-x-4 top-4 z-50 mx-auto max-w-lg',
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
  afterLayout?: React.ReactNode;
}) {
  return (
    <div
      data-ui="editor.page.root"
      className={EDITOR_PAGE_ROOT_CLASS_NAME}
      onContextMenuCapture={handleEditorPageContextMenuCapture}
    >
      <div className="absolute inset-0 min-h-0 min-w-0" data-ui="editor.canvas.layer">
        <CanvasWrapper hasImage={props.hasImage} />
      </div>
      <EditorFloatingWorkspace hasImage={props.hasImage} />
      <EditorCommandPalette
        hasImage={props.hasImage}
        isOpen={props.commandPaletteOpen}
        onClose={props.onCloseCommandPalette}
      />
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
        <div className={editorOpenErrorClassName} data-ui="editor.page.open-error" role="alert">
          <p className="font-semibold">{translate('editor.page.openFailedTitle')}</p>
          <p className="mt-1 text-sm text-[var(--sniptale-color-text-muted)]">
            {translate('editor.page.openFailedHint')}
          </p>
        </div>
      ) : null}
      {props.afterLayout}
    </div>
  );
}
