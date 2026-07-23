import React from 'react';
import { EditorCommandPalette } from '../command-palette';
import { CanvasWrapper } from '../../workspace/canvas';
import {
  EDITOR_CANVAS_CONTEXT_MENU_DATA_UI,
  EDITOR_CANVAS_CONTEXT_SURFACE_DATA_UI,
  EDITOR_CANVAS_EMPTY_DROPZONE_DATA_UI,
} from '../../workspace/canvas/context-menu/types';
import { EditorFloatingWorkspace } from '../../workspace/floating';

const EDITOR_PAGE_ROOT_CLASS_NAME = [
  'sniptale-extension-surface relative h-screen min-h-0 overflow-hidden',
  'bg-[var(--sniptale-color-surface-canvas)]',
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
      {props.afterLayout}
    </div>
  );
}
