import type { Textbox } from 'fabric';
import { translate } from '../../../../platform/i18n';
import { synchronizeEditorDrawingTextLayout } from '../../../drawing/object/vector';

type TextboxWithLifecycle = Textbox & {
  sniptaleDrawingTextChangedHandler?: (() => void) | undefined;
  sniptaleEditingExitedHandler?: (() => void) | undefined;
};

type TextboxEditSnapshot = Pick<Textbox, 'height' | 'left' | 'text' | 'top' | 'width'> & {
  drawingJson: string | undefined;
};

const editSnapshots = new WeakMap<Textbox, TextboxEditSnapshot>();
const cancelledEdits = new WeakSet<Textbox>();

export function beginEditorTextboxEditing(textbox: Textbox): void {
  if (editSnapshots.has(textbox)) return;
  editSnapshots.set(textbox, {
    drawingJson: textbox.sniptaleDrawingJson,
    height: textbox.height,
    left: textbox.left,
    text: textbox.text,
    top: textbox.top,
    width: textbox.width,
  });
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
    if (snapshot.drawingJson === undefined) {
      delete textbox.sniptaleDrawingJson;
    } else {
      textbox.sniptaleDrawingJson = snapshot.drawingJson;
    }
    textbox.setCoords();
  }
  cancelledEdits.add(textbox);
  textbox.exitEditing();
}

export function attachEditorTextboxLifecycle(
  textbox: TextboxWithLifecycle,
  options: {
    onEmpty: () => void;
    onCommit: (textbox: Textbox) => void;
  }
): void {
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
    textbox.sniptaleDrawingTextAutoWidth = false;
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
    options.onCommit(textbox);
  };

  textbox.sniptaleEditingExitedHandler = editingExitedHandler;
  textbox.sniptaleDrawingTextChangedHandler = changedHandler;
  textbox.on('changed', changedHandler);
  textbox.on('editing:exited', editingExitedHandler);
}
