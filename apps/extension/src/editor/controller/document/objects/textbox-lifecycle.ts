import type { Textbox } from 'fabric';
import { translate } from '../../../../platform/i18n';

type TextboxWithLifecycle = Textbox & {
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

  const editingExitedHandler = () => {
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
  textbox.on('editing:exited', editingExitedHandler);
}
