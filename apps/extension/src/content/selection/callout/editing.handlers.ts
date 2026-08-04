import { useCallback, useEffect, useRef } from 'react';
import type {
  ClipboardEvent,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
} from 'react';
import type { CalloutEditingHandlers, CalloutEditingHandlersArgs } from './editing.types';
import { sanitizeCalloutHtml } from './dom';

type CalloutTextInputHandlers = Pick<
  CalloutEditingHandlers,
  'finishEditing' | 'handleBlur' | 'handleInput' | 'handleKeyDown' | 'handlePaste'
>;

function isRangeWithinElement(range: Range, element: HTMLElement): boolean {
  return element.contains(range.startContainer) && element.contains(range.endContainer);
}

function getElementSelection(element: HTMLElement): Selection | null {
  const root = element.getRootNode();
  if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) {
    const getSelection = (root as ShadowRoot & { getSelection?: () => Selection | null })
      .getSelection;
    const shadowSelection = getSelection?.call(root);
    if (shadowSelection) {
      return shadowSelection;
    }
  }

  return element.ownerDocument.defaultView?.getSelection() ?? null;
}

function insertPlainTextAtSelection(text: string, editableElement: HTMLDivElement): void {
  const selection = getElementSelection(editableElement);
  const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const hasEditableSelection =
    selectedRange !== null && isRangeWithinElement(selectedRange, editableElement);
  const range = hasEditableSelection
    ? selectedRange.cloneRange()
    : editableElement.ownerDocument.createRange();
  editableElement.focus({ preventScroll: true });
  if (!hasEditableSelection) {
    range.selectNodeContents(editableElement);
    range.collapse(false);
  }

  range.deleteContents();
  const textNode = editableElement.ownerDocument.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function wrapSelectionWithTag(tagName: 'b' | 'i' | 'u'): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return;
  }

  const range = selection.getRangeAt(0);
  const wrapper = document.createElement(tagName);

  try {
    wrapper.append(range.extractContents());
    range.insertNode(wrapper);
    selection.removeAllRanges();

    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    selection.addRange(nextRange);
  } catch {
    return;
  }
}

function commitCalloutContent(
  args: CalloutEditingHandlersArgs,
  editableElement: HTMLDivElement | null
) {
  if (!editableElement) {
    args.onStopEditing();
    return;
  }

  const sanitizedHtml = sanitizeCalloutHtml(editableElement.innerHTML);
  const textContent = editableElement.textContent?.trim() ?? '';

  if (textContent === '' && (args.titleText ?? '').trim() === '') {
    args.onDelete();
  } else {
    args.onContentChange(sanitizedHtml);
  }

  args.onStopEditing();
}

function useCalloutFinishEditing(args: CalloutEditingHandlersArgs) {
  const didFinishEditingRef = useRef(false);

  useEffect(() => {
    if (args.isEditing) {
      didFinishEditingRef.current = false;
    }
  }, [args.isEditing]);

  return useCallback(
    (editableElement: HTMLDivElement | null = args.contentEditableRef.current) => {
      if (didFinishEditingRef.current) {
        return;
      }

      didFinishEditingRef.current = true;
      commitCalloutContent(args, editableElement);
    },
    [args]
  );
}

function useCalloutInputHandler(args: CalloutEditingHandlersArgs) {
  return useCallback(() => {
    const editableElement = args.contentEditableRef.current;
    if (!editableElement) {
      return;
    }

    args.onManualInput();
    args.onContentChange(sanitizeCalloutHtml(editableElement.innerHTML));
  }, [args]);
}

function useCalloutTextInputHandlers(args: CalloutEditingHandlersArgs): CalloutTextInputHandlers {
  const finishEditing = useCalloutFinishEditing(args);
  const handleInput = useCalloutInputHandler(args);

  const handleBlur = useCallback(
    (event?: ReactFocusEvent<HTMLDivElement>) => {
      const interactionRoot = event?.currentTarget.closest('.sniptale-callout');
      if (
        interactionRoot &&
        event?.relatedTarget instanceof Node &&
        interactionRoot.contains(event.relatedTarget)
      ) {
        return;
      }
      finishEditing(event?.currentTarget ?? args.contentEditableRef.current);
    },
    [args.contentEditableRef, finishEditing]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        finishEditing(event.currentTarget as HTMLDivElement);
        return;
      }

      event.stopPropagation();
    },
    [finishEditing]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      const editableElement = event.currentTarget as HTMLDivElement;
      const text = event.clipboardData.getData('text/plain');
      insertPlainTextAtSelection(text, editableElement);
      handleInput();
    },
    [handleInput]
  );

  return {
    finishEditing,
    handleBlur,
    handleInput,
    handleKeyDown,
    handlePaste,
  };
}

function useCalloutPointerHandlers(
  args: CalloutEditingHandlersArgs,
  handleInput: () => void,
  finishEditing: CalloutEditingHandlers['finishEditing']
): Pick<CalloutEditingHandlers, 'applyFormatting' | 'handleClick'> {
  const handleClick = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();

      if (!args.isEditing) {
        const titleInput =
          event.target instanceof HTMLInputElement &&
          event.target.matches('[data-sniptale-callout-title="true"]')
            ? event.target
            : null;
        args.onStartEditing();
        if (titleInput) {
          window.requestAnimationFrame(() => titleInput.focus({ preventScroll: true }));
        }
        return;
      }

      if (!isPointerEventWithinEditable(event, args.contentEditableRef.current)) {
        event.preventDefault();
        finishEditing(args.contentEditableRef.current);
      }
    },
    [args, finishEditing]
  );

  const applyFormatting = useCallback(
    (command: string, event: MouseEvent) => {
      event.preventDefault();

      if (command === 'bold') {
        wrapSelectionWithTag('b');
      } else if (command === 'italic') {
        wrapSelectionWithTag('i');
      } else if (command === 'underline') {
        wrapSelectionWithTag('u');
      }

      handleInput();
    },
    [handleInput]
  );

  return {
    applyFormatting,
    handleClick,
  };
}

function isPointerEventWithinEditable(
  event: MouseEvent,
  editableElement: HTMLDivElement | null
): boolean {
  if (
    event.target instanceof Element &&
    event.target.closest('[data-sniptale-callout-title="true"]')
  ) {
    return true;
  }
  if (!editableElement) {
    return false;
  }

  if (isEventTargetWithinElement(event.target, editableElement)) {
    return true;
  }

  return event.nativeEvent
    .composedPath()
    .some((target) => isEventTargetWithinElement(target, editableElement));
}

function isEventTargetWithinElement(target: EventTarget | null, element: Element): boolean {
  return target instanceof Node && element.contains(target);
}

export function useCalloutEditingHandlers(
  args: CalloutEditingHandlersArgs
): CalloutEditingHandlers {
  const textHandlers = useCalloutTextInputHandlers(args);
  const pointerHandlers = useCalloutPointerHandlers(
    args,
    textHandlers.handleInput,
    textHandlers.finishEditing
  );

  return {
    applyFormatting: pointerHandlers.applyFormatting,
    finishEditing: textHandlers.finishEditing,
    handleBlur: textHandlers.handleBlur,
    handleClick: pointerHandlers.handleClick,
    handleInput: textHandlers.handleInput,
    handleKeyDown: textHandlers.handleKeyDown,
    handlePaste: textHandlers.handlePaste,
  };
}
