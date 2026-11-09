import { Point, util, type FabricObject } from 'fabric';
import type {
  EditorCanvas,
  EditorLayerPresentationBounds,
} from '../../../../document/canvas-surface/render-region';
import { readFrameAnnotationSnapshot } from '../../../../frame-annotation/proxy';

const geometryKeys: readonly string[] = [
  'transform',
  'translate',
  'scale',
  'rotate',
  'left',
  'top',
  'width',
  'height',
];

function hasActiveGeometryAnimation(element: HTMLElement): boolean {
  return element
    .getAnimations?.()
    .some(
      (animation) =>
        animation.playState === 'running' &&
        animation.effect instanceof KeyframeEffect &&
        animation.effect
          .getKeyframes()
          .some((frame) => Object.keys(frame).some((key) => geometryKeys.includes(key)))
    );
}

function observeFrameAnnotationScene(
  viewport: Element | null,
  refresh: () => void
): MutationObserver {
  let scene: Element | null = null;
  const observer = new MutationObserver(() => {
    const next = viewport?.querySelector('[data-ui="editor.frame-annotation-scene"]') ?? null;
    const changed = scene !== next;
    if (changed) watch(next);
    if (next || changed) refresh();
  });
  function watch(next: Element | null) {
    observer.disconnect();
    scene = next;
    if (!viewport) return;
    if (!scene) {
      observer.observe(viewport, { childList: true, subtree: true });
      return;
    }
    observer.observe(scene, { childList: true, subtree: true, attributes: true });
    let parent = scene.parentElement;
    while (parent && viewport.contains(parent)) {
      observer.observe(parent, { childList: true });
      if (parent === viewport) break;
      parent = parent.parentElement;
    }
  }
  watch(viewport?.querySelector('[data-ui="editor.frame-annotation-scene"]') ?? null);
  return observer;
}

/** Connects annotation presentation geometry to the canvas selection and its transient chrome. */
export function mountProjectedSelection(
  canvas: EditorCanvas,
  render: () => void,
  hover: (object?: FabricObject) => void
) {
  const viewport = canvas.upperCanvasEl.closest('[data-ui="editor.canvas.viewport"]');
  const elements = new Map<string, { element: HTMLElement; kind: string }>();
  const resize = new ResizeObserver(() => render());
  let animationFrame: number | null = null;
  const followAnimation = (element: HTMLElement) => {
    const moving = hasActiveGeometryAnimation(element);
    // CSS transforms change visible bounds without a resize or DOM mutation.
    if (moving && animationFrame === null)
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        render();
      });
  };
  const resolve = (object: FabricObject): EditorLayerPresentationBounds | null | undefined => {
    const kind = readFrameAnnotationSnapshot(object)?.annotationKind;
    if (!kind) return undefined;
    const id = object.sniptaleId;
    if (!id) return null;
    const cached = elements.get(id);
    let element = cached?.kind === kind ? cached.element : undefined;
    if (!element?.isConnected) {
      if (cached) {
        resize.unobserve(cached.element);
        elements.delete(id);
      }
      const selector =
        kind === 'callout'
          ? '.sniptale-callout[data-frame-id]'
          : '.sniptale-step-badge-layer[data-frame-id]';
      const wrapper = Array.from(viewport?.querySelectorAll<HTMLElement>(selector) ?? []).find(
        (candidate) => candidate.dataset['frameId'] === object.sniptaleId
      );
      element =
        kind === 'callout'
          ? wrapper
          : (wrapper?.querySelector<HTMLElement>('.sniptale-step-badge') ?? undefined);
      if (!element) return null;
      elements.set(id, { element, kind });
      resize.observe(element);
    }
    followAnimation(element);
    const rect = element.getBoundingClientRect();
    const backing = canvas.upperCanvasEl.getBoundingClientRect();
    if (!rect.width || !rect.height || !backing.width || !backing.height) return null;
    const inverse = util.invertTransform(canvas.viewportTransform);
    const point = (x: number, y: number) =>
      new Point(
        ((x - backing.left) * canvas.getWidth()) / backing.width,
        ((y - backing.top) * canvas.getHeight()) / backing.height
      ).transform(inverse);
    const start = point(rect.left, rect.top);
    const end = point(rect.right, rect.bottom);
    return {
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
  };
  let hovering = false;
  const move = (event: Event) => {
    if (!(event instanceof PointerEvent)) return;
    const marker =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-frame-id]') : null;
    const object =
      event.buttons === 0 && marker
        ? canvas
            .getObjects()
            .find((candidate) => candidate.sniptaleId === marker.dataset['frameId'])
        : undefined;
    if (object || hovering) hover(object);
    hovering = Boolean(object);
  };
  const leave = () => {
    if (hovering) hover();
    hovering = false;
  };
  const observer = observeFrameAnnotationScene(viewport, () => {
    const ids = new Set(canvas.getObjects().map((object) => object.sniptaleId));
    for (const [id, { element }] of elements) {
      if (!ids.has(id) || !element.isConnected) {
        resize.unobserve(element);
        elements.delete(id);
      }
    }
    render();
  });
  if (viewport) {
    viewport.addEventListener('pointermove', move, true);
    viewport.addEventListener('pointerleave', leave);
  }
  canvas.setLayerPresentationBoundsResolver(resolve);
  return {
    resolve,
    dispose() {
      observer.disconnect();
      resize.disconnect();
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      viewport?.removeEventListener('pointermove', move, true);
      viewport?.removeEventListener('pointerleave', leave);
      canvas.setLayerPresentationBoundsResolver(null);
      elements.clear();
    },
  };
}
