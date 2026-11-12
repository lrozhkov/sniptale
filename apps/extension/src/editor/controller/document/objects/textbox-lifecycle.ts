import type { Textbox } from 'fabric';
import { translate } from '../../../../platform/i18n';
import { synchronizeEditorDrawingTextLayout } from '../../../drawing/object/vector';

type TextboxWithLifecycle = Textbox & {
  sniptaleDrawingTextChangedHandler?: (() => void) | undefined;
  sniptaleEditingEnteredHandler?: (() => void) | undefined;
  sniptaleEditingExitedHandler?: (() => void) | undefined;
};

type TextboxEditSnapshot = Pick<
  Textbox,
  'height' | 'left' | 'text' | 'top' | 'width' | 'selectionStart' | 'selectionEnd'
> & {
  drawingJson: string | undefined;
  automaticWidth: boolean | undefined;
  maxWidth: number | undefined;
};

const editSnapshots = new WeakMap<Textbox, TextboxEditSnapshot>();
const cancelledEdits = new WeakSet<Textbox>();

export function beginEditorTextboxEditing(textbox: Textbox): void {
  if (editSnapshots.has(textbox)) return;
  editSnapshots.set(textbox, {
    drawingJson: textbox.sniptaleDrawingJson,
    automaticWidth: textbox.sniptaleDrawingTextAutoWidth,
    maxWidth: textbox.sniptaleDrawingTextMaxWidth,
    selectionStart: textbox.selectionStart,
    selectionEnd: textbox.selectionEnd,
    height: textbox.height,
    left: textbox.left,
    text: textbox.text,
    top: textbox.top,
    width: textbox.width,
  });
}

function restoreTextboxLayoutMode(textbox: Textbox, snapshot: TextboxEditSnapshot): void {
  if (snapshot.automaticWidth === undefined) delete textbox.sniptaleDrawingTextAutoWidth;
  else textbox.sniptaleDrawingTextAutoWidth = snapshot.automaticWidth;
  if (snapshot.maxWidth === undefined) delete textbox.sniptaleDrawingTextMaxWidth;
  else textbox.sniptaleDrawingTextMaxWidth = snapshot.maxWidth;
}

export function cancelEditorTextboxEditing(textbox: Textbox): void {
  const snapshot = editSnapshots.get(textbox);
  if (snapshot) {
    textbox.set({
      height: snapshot.height,
      left: snapshot.left,
      text: snapshot.text,
      top: snapshot.top,
      width: snapshot.width,
    });
    restoreTextboxLayoutMode(textbox, snapshot);
    textbox.selectionStart = snapshot.selectionStart;
    textbox.selectionEnd = snapshot.selectionEnd;
    if (textbox.hiddenTextarea) {
      textbox.hiddenTextarea.value = snapshot.text;
      textbox._updateTextarea();
    }
    if (snapshot.drawingJson === undefined) {
      delete textbox.sniptaleDrawingJson;
    } else {
      textbox.sniptaleDrawingJson = snapshot.drawingJson;
    }
    textbox.setCoords();
  }
  cancelledEdits.add(textbox);
  textbox.exitEditing();
  if (snapshot?.text.trim()) {
    restoreTextboxLayoutMode(textbox, snapshot);
    synchronizeEditorDrawingTextLayout(textbox);
    textbox.set({ left: snapshot.left, top: snapshot.top });
    textbox.setCoords();
    textbox.canvas?.requestRenderAll();
  }
}

export function attachEditorTextboxLifecycle(
  textbox: TextboxWithLifecycle,
  options: {
    onEmpty: () => void;
    onCommit: (textbox: Textbox) => void;
  }
): void {
  // Fabric must let Escape reach the editor's cancellation handler before it exits editing.
  textbox.keysMap = { ...textbox.keysMap };
  textbox.keysMapRtl = { ...textbox.keysMapRtl };
  delete textbox.keysMap[27];
  delete textbox.keysMapRtl[27];
  if (textbox.sniptaleEditingEnteredHandler) {
    textbox.off?.('editing:entered', textbox.sniptaleEditingEnteredHandler);
  }
  if (textbox.sniptaleEditingExitedHandler) {
    textbox.off?.('editing:exited', textbox.sniptaleEditingExitedHandler);
  }
  if (textbox.sniptaleDrawingTextChangedHandler) {
    textbox.off?.('changed', textbox.sniptaleDrawingTextChangedHandler);
  }

  const changedHandler = () => {
    synchronizeEditorDrawingTextLayout(textbox);
  };

  const editingExitedHandler = () => {
    const cancelled = cancelledEdits.delete(textbox);
    editSnapshots.delete(textbox);
    if (cancelled) {
      if (!textbox.text || textbox.text.trim().length === 0) options.onEmpty();
      return;
    }
    if (
      !textbox.text ||
      textbox.text.trim().length === 0 ||
      textbox.text.trim() === translate('editor.runtime.defaultTextboxText')
    ) {
      options.onEmpty();
      return;
    }
    synchronizeEditorDrawingTextLayout(textbox);
    options.onCommit(textbox);
  };

  const editingEnteredHandler = () => {
    beginEditorTextboxEditing(textbox);
    changedHandler();
  };
  textbox.sniptaleEditingEnteredHandler = editingEnteredHandler;
  textbox.on('editing:entered', editingEnteredHandler);
  textbox.sniptaleEditingExitedHandler = editingExitedHandler;
  textbox.sniptaleDrawingTextChangedHandler = changedHandler;
  textbox.on('changed', changedHandler);
  textbox.on('editing:exited', editingExitedHandler);
}
