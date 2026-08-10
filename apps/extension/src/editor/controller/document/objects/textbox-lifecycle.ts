import type { Textbox } from 'fabric';
import { translate } from '../../../../platform/i18n';
import { synchronizeEditorDrawingTextLayout } from '../../../drawing/object/vector';

type TextboxWithLifecycle = Textbox & {
  sniptaleDrawingTextChangedHandler?: () => void;
  sniptaleEditingExitedHandler?: () => void;
};

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
