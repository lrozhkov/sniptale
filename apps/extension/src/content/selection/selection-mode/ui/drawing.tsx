import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import {
  createDrawingSession,
  findDrawingObjectsIntersectingPath,
  type DrawingPoint,
} from '../../../../features/drawing/public';
import type { ContentDrawingCaptureSnapshot } from '../../../drawing/capture';
import {
  createContentDrawingController,
  synchronizeContentDrawingPreferences,
  type ContentDrawingController,
} from '../../../drawing/controller';
import { getDrawingViewportProjection, toDrawingScenePoint } from '../../../drawing/surface';
import { isTrustedKeyboardEvent } from '../../../platform/trusted-events';
import { createCropDrawingView, type CropDrawingInteraction } from './drawing-view';

function bindCropDrawingEraser(options: {
  layer: HTMLElement;
  controller: ContentDrawingController;
  isActive(): boolean;
  onExit(): void;
}) {
  let pointerId: number | null = null;
  let path: DrawingPoint[] = [];
  const cancel = () => {
    pointerId = null;
    path = [];
  };
  const finalize = () => {
    if (pointerId === null) return;
    const touched = findDrawingObjectsIntersectingPath(
      options.controller.session.getSnapshot().document.objects,
      path
    );
    options.controller.session.deleteObjects(touched.map((object) => object.id));
    cancel();
  };
  const down = (event: PointerEvent) => {
    if (
      !options.isActive() ||
      event.button !== 0 ||
      !event.composedPath().includes(options.layer) ||
      event
        .composedPath()
        .some((target) => target instanceof Element && target.matches('button, input, textarea'))
    )
      return;
    pointerId = event.pointerId;
    path = [toDrawingScenePoint(event, options.controller.getScrollRoot())];
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const move = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    path.push(toDrawingScenePoint(event, options.controller.getScrollRoot()));
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const up = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    path.push(toDrawingScenePoint(event, options.controller.getScrollRoot()));
    finalize();
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const escape = (event: KeyboardEvent) => {
    if (
      !options.isActive() ||
      event.key !== 'Escape' ||
      event.defaultPrevented ||
      !isTrustedKeyboardEvent(event) ||
      event
        .composedPath()
        .some(
          (target) => target instanceof Element && target.matches('input, textarea, [role="menu"]')
        )
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    options.onExit();
  };
  document.addEventListener('pointerdown', down, true);
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', cancel, true);
  window.addEventListener('keydown', escape, true);
  return {
    finalize,
    cancel,
    dispose() {
      cancel();
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('keydown', escape, true);
    },
  };
}

function mountCropToolbarSlots(tooltip: ContentSizeTooltipDom) {
  const sizingChildren = Array.from(tooltip.root.children).filter(
    (element) => element !== tooltip.actions
  );
  const resize = document.createElement('div');
  resize.dataset['ui'] = 'content.crop.resize-slot';
  Object.assign(resize.style, { display: 'inline-flex', alignItems: 'center', gap: 'inherit' });
  tooltip.root.insertBefore(resize, tooltip.root.firstChild);
  resize.append(...sizingChildren);
  const mode = document.createElement('div');
  mode.dataset['ui'] = 'content.crop.mode-slot';
  mode.style.display = 'inline-flex';
  const controls = document.createElement('div');
  controls.dataset['ui'] = 'content.crop.drawing-slot';
  Object.assign(controls.style, { display: 'none', alignItems: 'center' });
  tooltip.root.prepend(mode, controls);
  tooltip.root.dataset['cropMode'] = 'resize';
  tooltip.root.dataset['ui'] = 'shared.ui.content-toolbar';
  return {
    mode,
    controls,
    projectDrawing(drawing: boolean) {
      resize.style.display = drawing ? 'none' : 'inline-flex';
      controls.style.display = drawing ? 'inline-flex' : 'none';
      tooltip.root.dataset['cropMode'] = drawing ? 'drawing' : 'resize';
    },
    dispose() {
      mode.remove();
      controls.remove();
      resize.replaceWith(...Array.from(resize.childNodes));
    },
  };
}

function projectCropFrameDrawingMode(container: HTMLElement, drawing: boolean) {
  container
    .querySelectorAll<HTMLElement>(
      '.sniptale-selection-final-frame, .sniptale-selection-event-catcher'
    )
    .forEach((element) => {
      element.style.pointerEvents = drawing ? 'none' : 'auto';
    });
  container.querySelectorAll<HTMLElement>('.sniptale-resize-handle').forEach((handle) => {
    handle.style.display = drawing ? 'none' : '';
  });
}

export function createSelectionDrawingRuntime(options: {
  container: HTMLElement;
  onLayout(): void;
}) {
  const controller: ContentDrawingController = {
    ...createContentDrawingController(createDrawingSession({ onDocumentCommit: () => true })),
    prepareActivation: () => true,
  };
  const stopPreferences = synchronizeContentDrawingPreferences(controller);
  const view = createCropDrawingView({
    container: options.container,
    controller,
    onModeChange: setDrawing,
    onInteractionChange(next) {
      interaction = next;
      render();
    },
  });
  let drawing = false;
  let disposed = false;
  let interaction: CropDrawingInteraction = 'select';
  let toolbar: ContentSizeTooltipDom | null = null;
  let slots: ReturnType<typeof mountCropToolbarSlots> | null = null;
  let observedSize = '';
  const eraser = bindCropDrawingEraser({
    layer: view.layer,
    controller,
    isActive: () => drawing && interaction === 'eraser',
    onExit: () => setDrawing(false),
  });

  const render = () => {
    if (disposed) return;
    view.render({ drawing, interaction, slots });
  };

  function setDrawing(next: boolean) {
    if (disposed || drawing === next) return;
    if (next && !controller.prepareActivation()) return;
    controller.finalizeInteraction();
    eraser.cancel();
    drawing = next;
    if (next) interaction = controller.session.getSnapshot().activeTool;
    slots?.projectDrawing(drawing);
    projectCropFrameDrawingMode(options.container, drawing);
    render();
    options.onLayout();
  }

  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (!toolbar || disposed) return;
          const rect = toolbar.root.getBoundingClientRect();
          const nextSize = `${rect.width}:${rect.height}`;
          if (nextSize === observedSize) return;
          observedSize = nextSize;
          options.onLayout();
        });
  const refreshLayout = () => {
    if (!disposed) options.onLayout();
  };
  window.addEventListener('resize', refreshLayout);
  render();

  return {
    attachToolbar(next: ContentSizeTooltipDom) {
      if (disposed) return;
      setDrawing(false);
      observer?.disconnect();
      slots?.dispose();
      toolbar = next;
      slots = mountCropToolbarSlots(next);
      observedSize = '';
      observer?.observe(next.root);
      render();
      options.onLayout();
    },
    isDrawing: () => drawing,
    finalize(): ContentDrawingCaptureSnapshot {
      controller.finalizeInteraction();
      eraser.finalize();
      return {
        objects: controller.session.getSnapshot().document.objects,
        projection: getDrawingViewportProjection(controller.getScrollRoot()),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    },
    dispose() {
      if (disposed) return;
      setDrawing(false);
      disposed = true;
      observer?.disconnect();
      eraser.dispose();
      window.removeEventListener('resize', refreshLayout);
      view.dispose();
      slots?.dispose();
      stopPreferences();
      controller.session.dispose();
    },
  };
}
