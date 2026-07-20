function clampTextareaHeight(startHeight: number, delta: number) {
  return Math.max(72, Math.min(300, startHeight + delta));
}

export function beginBorderPresetResize({
  clearResizeListeners,
  setIsResizing,
  setTextareaHeight,
  startY,
  textareaHeight,
}: {
  clearResizeListeners: () => void;
  setIsResizing: (next: boolean) => void;
  setTextareaHeight: (next: number | ((current: number) => number)) => void;
  startY: number;
  textareaHeight: number;
}) {
  setIsResizing(true);
  const startHeight = textareaHeight;

  const handleMouseMove = (moveEvent: MouseEvent) => {
    const delta = moveEvent.clientY - startY;
    setTextareaHeight(clampTextareaHeight(startHeight, delta));
  };

  const handleMouseUp = () => {
    clearResizeListeners();
    setIsResizing(false);
  };

  const removeResizeListeners = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  return removeResizeListeners;
}
