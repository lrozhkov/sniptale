import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import type { ContentDrawingCaptureSnapshot } from '../../../drawing/capture';
import {
  createContentDrawingController,
  synchronizeContentDrawingPreferences,
  type ContentDrawingController,
} from '../../../drawing/controller';
import { getDrawingViewportProjection } from '../../../drawing/surface';
import { createCropDrawingView } from './drawing-view';
import { createCropDrawingHistory } from './drawing-history';

function mountCropToolbarSlots(tooltip: ContentSizeTooltipDom) {
  const wasAdopted = tooltip.root.classList.contains('sniptale-content-toolbar-adopted');
  tooltip.root.classList.add('sniptale-content-toolbar-adopted');
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
      if (!wasAdopted) tooltip.root.classList.remove('sniptale-content-toolbar-adopted');
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
  initialDrawing: boolean;
  onModeChange(drawing: boolean): void;
  onLayout(): void;
}) {
  const history = createCropDrawingHistory();
  const controller: ContentDrawingController = {
    ...createContentDrawingController(history.session),
    prepareActivation: () => true,
  };
  const stopPreferences = synchronizeContentDrawingPreferences(controller);
  const view = createCropDrawingView({
    container: options.container,
    controller,
    history: {
      getState: history.getState,
      subscribe: history.subscribe,
      undo() {
        controller.finalizeInteraction();
        history.undo();
      },
      redo() {
        controller.finalizeInteraction();
        history.redo();
      },
    },
    onModeChange(next) {
      if (disposed) return;
      setDrawing(next);
      options.onModeChange(next);
    },
    onExitDrawing: () => setDrawing(false),
  });
  let drawing = false;
  let disposed = false;
  let toolbar: ContentSizeTooltipDom | null = null;
  let slots: ReturnType<typeof mountCropToolbarSlots> | null = null;
  let observedSize = '';

  const render = () => {
    if (disposed) return;
    view.render({ drawing, slots });
  };

  function setDrawing(next: boolean) {
    if (disposed || drawing === next) return;
    if (next && !controller.prepareActivation()) return;
    controller.finalizeInteraction();
    drawing = next;
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
      const nextDrawing = toolbar === null ? options.initialDrawing : drawing;
      observer?.disconnect();
      slots?.dispose();
      toolbar = next;
      slots = mountCropToolbarSlots(next);
      slots.projectDrawing(drawing);
      setDrawing(nextDrawing);
      observedSize = '';
      observer?.observe(next.root);
      render();
      options.onLayout();
    },
    isDrawing: () => drawing,
    finalize(): ContentDrawingCaptureSnapshot {
      controller.finalizeInteraction();
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
      window.removeEventListener('resize', refreshLayout);
      view.dispose();
      slots?.dispose();
      stopPreferences();
      controller.session.dispose();
    },
  };
}
