import { VOICE_INPUT_TRANSCRIPT_MAX_CHARS } from '@sniptale/runtime-contracts/voice-input';

export interface CalloutTranscriptInsertion {
  apply(event: { isFinal: boolean; sequence: number; text: string }): boolean;
}

function getEditableSelection(editable: HTMLElement): Selection | null {
  const root = editable.getRootNode();
  if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) {
    const getSelection = (root as ShadowRoot & { getSelection?: () => Selection | null })
      .getSelection;
    const selection = getSelection?.call(root);
    if (selection) return selection;
  }
  return editable.ownerDocument.defaultView?.getSelection() ?? null;
}

function createCaretRange(editable: HTMLDivElement): Range {
  const selection = getEditableSelection(editable);
  const selectedRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const range = editable.ownerDocument.createRange();
  if (
    selectedRange &&
    editable.contains(selectedRange.startContainer) &&
    editable.contains(selectedRange.endContainer)
  ) {
    range.setStart(selectedRange.startContainer, selectedRange.startOffset);
    range.collapse(true);
    return range;
  }
  range.selectNodeContents(editable);
  range.collapse(false);
  return range;
}

function readAdjacentText(
  editable: HTMLDivElement,
  caret: Range
): { after: string; before: string } {
  const beforeRange = editable.ownerDocument.createRange();
  beforeRange.selectNodeContents(editable);
  beforeRange.setEnd(caret.startContainer, caret.startOffset);
  const afterRange = editable.ownerDocument.createRange();
  afterRange.selectNodeContents(editable);
  afterRange.setStart(caret.startContainer, caret.startOffset);
  return { after: afterRange.toString().slice(0, 1), before: beforeRange.toString().slice(-1) };
}

function restoreCaret(editable: HTMLDivElement, textNode: Text, offset: number): void {
  const selection = getEditableSelection(editable);
  if (!selection) return;
  const range = editable.ownerDocument.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Owns one replaceable plain-text voice span inside the rich-text callout DOM. */
export function createCalloutTranscriptInsertion(
  editable: HTMLDivElement
): CalloutTranscriptInsertion {
  const caret = createCaretRange(editable);
  const adjacent = readAdjacentText(editable, caret);
  const prefix = adjacent.before && !/\s/u.test(adjacent.before) ? ' ' : '';
  const suffix = adjacent.after && !/\s/u.test(adjacent.after) ? ' ' : '';
  const textNode = editable.ownerDocument.createTextNode('');
  caret.insertNode(textNode);
  let finalText = '';
  let interimText = '';
  let lastSequence = -1;

  return {
    apply(event) {
      if (event.sequence <= lastSequence || !textNode.isConnected) return false;
      lastSequence = event.sequence;
      const fragment = event.text.trim();
      if (event.isFinal) {
        finalText = `${finalText}${finalText && fragment ? ' ' : ''}${fragment}`.slice(
          0,
          VOICE_INPUT_TRANSCRIPT_MAX_CHARS
        );
        interimText = '';
      } else {
        const separatorLength = finalText && fragment ? 1 : 0;
        interimText = fragment.slice(
          0,
          Math.max(VOICE_INPUT_TRANSCRIPT_MAX_CHARS - finalText.length - separatorLength, 0)
        );
      }
      const voiceText = `${finalText}${finalText && interimText ? ' ' : ''}${interimText}`;
      textNode.data = voiceText ? `${prefix}${voiceText}${suffix}` : '';
      editable.focus({ preventScroll: true });
      restoreCaret(editable, textNode, voiceText ? prefix.length + voiceText.length : 0);
      return true;
    },
  };
}
