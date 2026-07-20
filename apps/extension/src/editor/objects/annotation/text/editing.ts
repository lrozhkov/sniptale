import type { Textbox } from 'fabric';
import { applyTextLayout } from './layout';

type EditableTextbox = Textbox & {
  _setEditingProps?: () => void;
  sniptaleTextCalloutEditingAttached?: boolean;
};

export function attachTextCalloutEditingLifecycle(textbox: Textbox): void {
  const editableTextbox = textbox as EditableTextbox;
  if (
    editableTextbox.sniptaleTextCalloutEditingAttached ||
    typeof editableTextbox._setEditingProps !== 'function'
  ) {
    return;
  }

  const setEditingProps = editableTextbox._setEditingProps.bind(editableTextbox);
  editableTextbox._setEditingProps = function setTextCalloutEditingProps() {
    setEditingProps();
    this.hasControls = false;
    applyTextLayout(this);
  };
  editableTextbox.sniptaleTextCalloutEditingAttached = true;
}
