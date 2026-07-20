import type { Canvas } from 'fabric';

export function bindRichShapeTextEditorEvents(options: {
  canvas: Canvas;
  cleanupRefreshHandlers: () => void;
  commit: () => void;
  element: HTMLTextAreaElement;
  onInput: () => void;
}): () => void {
  const canvasElement = options.canvas.getSelectionElement();
  const handleDocumentPointerDown = (event: Event) => {
    if (event.target instanceof Node && options.element.contains(event.target)) {
      return;
    }
    options.commit();
  };
  const handleTextareaKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (
      event.key === 'Escape' ||
      event.key === 'Tab' ||
      (event.key === 'Enter' && (event.ctrlKey || event.metaKey))
    ) {
      event.preventDefault();
      options.commit();
    }
  };
  options.element.addEventListener('input', options.onInput);
  options.element.addEventListener('blur', options.commit);
  options.element.addEventListener('keydown', handleTextareaKeyDown, true);
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  document.addEventListener('mousedown', handleDocumentPointerDown, true);
  canvasElement.addEventListener('pointerdown', handleDocumentPointerDown, true);
  canvasElement.addEventListener('mousedown', handleDocumentPointerDown, true);
  return () => {
    options.cleanupRefreshHandlers();
    options.element.removeEventListener('input', options.onInput);
    options.element.removeEventListener('blur', options.commit);
    options.element.removeEventListener('keydown', handleTextareaKeyDown, true);
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    document.removeEventListener('mousedown', handleDocumentPointerDown, true);
    canvasElement.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    canvasElement.removeEventListener('mousedown', handleDocumentPointerDown, true);
  };
}
