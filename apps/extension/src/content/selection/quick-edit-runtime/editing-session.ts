import type { EditableElement } from '../../../features/highlighter/contracts';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'ContentQuickEditSession' });

function resolveEditableElementSession(
  editingElements: Map<string, EditableElement>,
  element: HTMLElement
) {
  const id = element.dataset['sniptaleEditableId'];
  if (!id) {
    return null;
  }

  const editableData = editingElements.get(id);
  if (!editableData) {
    return null;
  }

  return { editableData, id };
}

function withEditableElementSession(
  editingElements: Map<string, EditableElement>,
  element: HTMLElement,
  onSession: (session: { editableData: EditableElement; id: string }) => void
): void {
  const session = resolveEditableElementSession(editingElements, element);
  if (!session) {
    return;
  }

  onSession(session);
}

function finalizeEditableElementSession(args: {
  clearElementEditingState: (element: HTMLElement, id: string) => void;
  editingElements: Map<string, EditableElement>;
  element: HTMLElement;
  id: string;
}): void {
  args.editingElements.delete(args.id);
  args.clearElementEditingState(args.element, args.id);
}

function syncAttribute(
  element: HTMLElement,
  name: 'class' | 'style',
  value: string | undefined
): void {
  if (value) {
    element.setAttribute(name, value);
    return;
  }

  element.removeAttribute(name);
}

function restoreEditableContent(element: HTMLElement, editableData: EditableElement): void {
  if (editableData.originalChildNodes) {
    element.replaceChildren(...editableData.originalChildNodes.map((node) => node.cloneNode(true)));
    return;
  }

  element.textContent = editableData.originalText;
}

export function finishEditableElement(
  editingElements: Map<string, EditableElement>,
  clearElementEditingState: (element: HTMLElement, id: string) => void,
  element: HTMLElement
) {
  withEditableElementSession(editingElements, element, ({ editableData, id }) => {
    const currentText = element.textContent || '';
    const wasChanged = currentText !== editableData.originalText;

    element.contentEditable = editableData.originalContentEditable;
    element.classList.remove('sniptale-editing');

    finalizeEditableElementSession({ clearElementEditingState, editingElements, element, id });

    if (wasChanged) {
      logger.log('Text changed', {
        currentLength: currentText.length,
        deltaLength: currentText.length - editableData.originalText.length,
        originalLength: editableData.originalText.length,
      });
    }

    logger.log('Editing finished', id);
  });
}

export function cancelEditableElement(
  editingElements: Map<string, EditableElement>,
  clearElementEditingState: (element: HTMLElement, id: string) => void,
  element: HTMLElement
) {
  withEditableElementSession(editingElements, element, ({ editableData, id }) => {
    restoreEditableContent(element, editableData);
    element.contentEditable = editableData.originalContentEditable;
    syncAttribute(element, 'class', editableData.originalClass);
    syncAttribute(element, 'style', editableData.originalStyle);

    finalizeEditableElementSession({ clearElementEditingState, editingElements, element, id });
    logger.log('Editing cancelled', id);
  });
}
