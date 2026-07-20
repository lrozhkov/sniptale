import { vi } from 'vitest';

type LayerHeightLayoutMetrics = {
  actionsHeight: number;
  bodyClientHeight: number;
  bodyOffsetHeight: number;
  bodyScrollHeight: number;
  headerHeight: number;
  listClientHeight: number;
  listScrollHeight: number;
  parentHeight: number;
};

function stubAnimationFrame() {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
}

function stubResizeObserver(callbackRef?: { current: (() => void) | null }) {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      constructor(callback: () => void) {
        if (callbackRef) {
          callbackRef.current = callback;
        }
      }

      disconnect() {}

      observe() {}

      unobserve() {}
    }
  );
}

function getClientHeightValue(element: HTMLElement, metrics: LayerHeightLayoutMetrics) {
  if (element.getAttribute('data-testid') === 'panel-parent') {
    return metrics.parentHeight;
  }

  if (element.getAttribute('data-ui') === 'editor.layers.list-viewport') {
    return metrics.listClientHeight;
  }

  if (element.getAttribute('data-ui') === 'editor.layers.panel-body') {
    return metrics.bodyClientHeight;
  }

  return 0;
}

function getOffsetHeightValue(element: HTMLElement, metrics: LayerHeightLayoutMetrics) {
  if (element.getAttribute('data-ui') === 'editor.layers.panel-header') {
    return metrics.headerHeight;
  }

  if (element.getAttribute('data-ui') === 'editor.layers.selection-actions') {
    return metrics.actionsHeight;
  }

  if (element.getAttribute('data-ui') === 'editor.layers.panel-body') {
    return metrics.bodyOffsetHeight;
  }

  return 0;
}

function getScrollHeightValue(element: HTMLElement, metrics: LayerHeightLayoutMetrics) {
  if (element.getAttribute('data-ui') === 'editor.layers.panel-body') {
    return metrics.bodyScrollHeight;
  }

  if (element.getAttribute('data-ui') === 'editor.layers.list-viewport') {
    return metrics.listScrollHeight;
  }

  return 0;
}

function stubElementMeasurements(getMetrics: () => LayerHeightLayoutMetrics) {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return getClientHeightValue(this, getMetrics());
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return getOffsetHeightValue(this, getMetrics());
  });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return getScrollHeightValue(this, getMetrics());
  });
}

export function stubLayerHeightMeasurementEnvironment(args: {
  getMetrics: () => LayerHeightLayoutMetrics;
  resizeObserverCallbackRef?: { current: (() => void) | null };
}) {
  stubAnimationFrame();
  stubResizeObserver(args.resizeObserverCallbackRef);
  stubElementMeasurements(args.getMetrics);
}
