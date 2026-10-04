import {
  getDrawingObjectBounds,
  translateDrawingObject,
  type DrawingObject,
  type DrawingPoint,
  type DrawingObjectProjection,
} from '../../features/drawing/public';
import type { PageScrollRoot } from '../platform/page-scroll';
import { getDrawingViewportProjection } from './interaction';
import { resolveContentShadowRoot } from '../platform/dom-host';

interface Binding {
  target: Element;
  origin: DrawingPoint;
  latest: DrawingPoint;
  projected?: DrawingObject;
}

/** Disposable DOM bindings keyed by immutable object version, including versions retained by undo. */
export function createDrawingLayout(getRoot: () => PageScrollRoot) {
  let bindings = new WeakMap<DrawingObject, Binding | null>();
  const listeners = new Set<() => void>();
  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          listeners.forEach((listener) => listener());
        });
  const origin = (target: Element): DrawingPoint => {
    const rect = target.getBoundingClientRect();
    const projection = getDrawingViewportProjection(getRoot());
    return { x: rect.left + projection.x, y: rect.top + projection.y };
  };
  const findTarget = (object: DrawingObject): Element | null => {
    const bounds = getDrawingObjectBounds(object);
    const point =
      object.kind === 'arrow'
        ? object.end
        : { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const projection = getDrawingViewportProjection(getRoot());
    const candidates =
      document.elementsFromPoint?.(point.x - projection.x, point.y - projection.y) ?? [];
    let target =
      candidates.find(
        (element) =>
          element !== document.documentElement &&
          element !== resolveContentShadowRoot()?.host &&
          !element.closest('reclyp-ui[data-wxt-shadow-root]')
      ) ?? null;
    while (target && target !== document.body && getComputedStyle(target).display === 'inline')
      target = target.parentElement;
    if (!target || target === document.documentElement) return null;
    const root = getRoot();
    if (root.kind === 'element' && !root.element.contains(target)) return null;
    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? target : null;
  };
  const projection: DrawingObjectProjection = {
    capture(object, previous) {
      if (bindings.has(object)) return;
      const inherited = previous ? bindings.get(previous) : undefined;
      const target = inherited === undefined ? findTarget(object) : inherited?.target;
      if (!target) {
        bindings.set(object, null);
        return;
      }
      const position = target.isConnected ? origin(target) : (inherited?.latest ?? origin(target));
      bindings.set(object, { target, origin: position, latest: position });
      observer?.observe(target);
    },
    resolve(object) {
      const binding = bindings.get(object);
      if (!binding) return object;
      const current = binding.target.isConnected ? origin(binding.target) : binding.latest;
      const unchanged = current.x === binding.latest.x && current.y === binding.latest.y;
      binding.latest = current;
      if (unchanged && binding.projected) return binding.projected;
      const delta = { x: current.x - binding.origin.x, y: current.y - binding.origin.y };
      if (delta.x === 0 && delta.y === 0) {
        binding.projected = object;
        return object;
      }
      const projected = translateDrawingObject(object, delta);
      binding.projected = projected;
      bindings.set(projected, { target: binding.target, origin: current, latest: current });
      return projected;
    },
  };
  return {
    projection,
    getAnchor(object: DrawingObject): Element | null {
      const target = bindings.get(object)?.target;
      return target?.isConnected ? target : null;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      observer?.disconnect();
      listeners.clear();
      bindings = new WeakMap();
    },
  };
}
