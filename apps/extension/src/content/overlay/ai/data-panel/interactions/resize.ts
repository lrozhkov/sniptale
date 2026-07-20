import type React from 'react';

export type ResizePointerEvent = Pick<
  React.MouseEvent,
  'clientY' | 'preventDefault' | 'stopPropagation'
>;

export function resizeElement(
  event: ResizePointerEvent,
  element: HTMLElement | null,
  setResizing: React.Dispatch<React.SetStateAction<boolean>>
) {
  event.preventDefault();
  event.stopPropagation();

  if (!element) {
    return;
  }

  setResizing(true);

  const startY = event.clientY;
  const startHeight = element.clientHeight;
  const handleMouseMove = (moveEvent: MouseEvent) => {
    const newHeight = Math.max(80, startHeight + (moveEvent.clientY - startY));
    element.style.height = `${newHeight}px`;
  };
  const handleMouseUp = () => {
    setResizing(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}
