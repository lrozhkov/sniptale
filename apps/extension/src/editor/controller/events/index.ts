import type { Canvas } from 'fabric';
import { createDrawingEventHandlers } from './drawing';
import { createPanEventHandlers } from './pan';
import { createRuntimeEventHandlers } from './runtime';
import type { EditorControllerEventBindings, EditorControllerEventHandlers } from './types';

export type { EditorControllerEventHandlers } from './types';

export function createEditorControllerEventHandlers(
  bindings: EditorControllerEventBindings
): EditorControllerEventHandlers {
  return {
    ...createRuntimeEventHandlers(bindings),
    ...createDrawingEventHandlers(bindings),
    ...createPanEventHandlers(bindings),
  };
}

export function attachEditorControllerEventHandlers(options: {
  canvas: Canvas;
  viewportElement: HTMLElement;
  handlers: EditorControllerEventHandlers;
  onViewportResize: () => void;
}): ResizeObserver {
  const { canvas, viewportElement, handlers, onViewportResize } = options;
  canvas.on('selection:created', handlers.handleSelectionChange);
  canvas.on('selection:updated', handlers.handleSelectionChange);
  canvas.on('selection:cleared', handlers.handleSelectionChange);
  canvas.on('object:moving', handlers.handleObjectMoving);
  canvas.on('object:resizing', handlers.handleObjectResizing);
  canvas.on('object:scaling', handlers.handleObjectScaling);
  canvas.on('object:modified', handlers.handleObjectModified);
  canvas.on('path:created', handlers.handlePathCreated);
  canvas.on('mouse:down:before', handlers.handleMouseDownBefore);
  canvas.on('mouse:down', handlers.handleMouseDown);
  canvas.on('mouse:move:before', handlers.handleMouseMoveBefore);
  canvas.on('mouse:move', handlers.handleMouseMove);
  canvas.on('mouse:up', handlers.handleMouseUp);
  canvas.on('mouse:dblclick', handlers.handleDoubleClick);
  canvas.on('before:render', handlers.handleCanvasBeforeRender);
  canvas.on('after:render', handlers.handleCanvasAfterRender);
  window.addEventListener('keydown', handlers.handleWindowKeyDown);
  window.addEventListener('keyup', handlers.handleWindowKeyUp);
  window.addEventListener('blur', handlers.handleWindowBlur);
  window.addEventListener('mousemove', handlers.handleWindowMouseMove);
  window.addEventListener('mouseup', handlers.handleWindowMouseUp);
  viewportElement.addEventListener('mousedown', handlers.handleViewportMouseDown, true);
  viewportElement.addEventListener('wheel', handlers.handleViewportWheel, { passive: false });
  viewportElement.addEventListener('scroll', handlers.handleViewportScroll, { passive: true });

  const viewportResizeObserver = new ResizeObserver(onViewportResize);
  viewportResizeObserver.observe(viewportElement);
  return viewportResizeObserver;
}

export function detachEditorControllerEventHandlers(options: {
  canvas: Canvas;
  viewportElement: HTMLElement | null;
  handlers: EditorControllerEventHandlers;
  viewportResizeObserver: ResizeObserver | null;
}): void {
  const { canvas, viewportElement, handlers, viewportResizeObserver } = options;
  canvas.off('selection:created', handlers.handleSelectionChange);
  canvas.off('selection:updated', handlers.handleSelectionChange);
  canvas.off('selection:cleared', handlers.handleSelectionChange);
  canvas.off('object:moving', handlers.handleObjectMoving);
  canvas.off('object:resizing', handlers.handleObjectResizing);
  canvas.off('object:scaling', handlers.handleObjectScaling);
  canvas.off('object:modified', handlers.handleObjectModified);
  canvas.off('path:created', handlers.handlePathCreated);
  canvas.off('mouse:down:before', handlers.handleMouseDownBefore);
  canvas.off('mouse:down', handlers.handleMouseDown);
  canvas.off('mouse:move:before', handlers.handleMouseMoveBefore);
  canvas.off('mouse:move', handlers.handleMouseMove);
  canvas.off('mouse:up', handlers.handleMouseUp);
  canvas.off('mouse:dblclick', handlers.handleDoubleClick);
  canvas.off('before:render', handlers.handleCanvasBeforeRender);
  canvas.off('after:render', handlers.handleCanvasAfterRender);
  window.removeEventListener('keydown', handlers.handleWindowKeyDown);
  window.removeEventListener('keyup', handlers.handleWindowKeyUp);
  window.removeEventListener('blur', handlers.handleWindowBlur);
  window.removeEventListener('mousemove', handlers.handleWindowMouseMove);
  window.removeEventListener('mouseup', handlers.handleWindowMouseUp);
  viewportElement?.removeEventListener('mousedown', handlers.handleViewportMouseDown, true);
  viewportElement?.removeEventListener('wheel', handlers.handleViewportWheel);
  viewportElement?.removeEventListener('scroll', handlers.handleViewportScroll);
  viewportResizeObserver?.disconnect();
}
