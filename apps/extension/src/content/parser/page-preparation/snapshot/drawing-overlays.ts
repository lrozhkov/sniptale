import { getDrawingSelectionBounds, type DrawingObject } from '../../../../features/drawing/public';
import { captureDrawingObjects, captureDrawingFrame } from '../../../drawing/frame';
import type { VirtualDomOriginalElementResolver } from '../../dom-tree-parser/traversal';

function applyDrawingAnchor(
  snapshot: Document,
  node: HTMLElement,
  anchor: HTMLElement | SVGElement,
  original: Element
): void {
  const name = `--sniptale-ink-${crypto.randomUUID()}`;
  const token = name.slice(2);
  const previous = anchor.style.getPropertyValue('anchor-name');
  const sourceNames =
    previous ||
    original.ownerDocument.defaultView
      ?.getComputedStyle(original)
      .getPropertyValue('anchor-name') ||
    '';
  anchor.style.setProperty(
    'anchor-name',
    sourceNames && sourceNames !== 'none' ? `${sourceNames}, ${name}` : name
  );
  const rect = original.getBoundingClientRect();
  const view = original.ownerDocument.defaultView;
  const x = Number.parseFloat(node.style.left) || 0;
  const y = Number.parseFloat(node.style.top) || 0;
  const dx = x - rect.left;
  const dy = y - rect.top;
  node.style.position = 'absolute';
  node.style.zIndex = '2147483647';
  node.style.left = `min(100%, ${x + (view?.scrollX ?? 0)}px)`;
  node.style.top = `${y + (view?.scrollY ?? 0)}px`;
  node.setAttribute('data-sniptale-drawing-anchor', token);
  const style = snapshot.createElement('style');
  style.textContent = `@supports (left: anchor(left)) { [data-sniptale-drawing-anchor="${token}"] { left: min(100%, calc(anchor(${name} left, ${rect.left + (view?.scrollX ?? 0)}px) + ${dx}px)) !important; top: calc(anchor(${name} top, ${rect.top + (view?.scrollY ?? 0)}px) + ${dy}px) !important; } }`;
  snapshot.head.append(style);
}

function wrapAnchoredDrawing(
  snapshot: Document,
  node: HTMLElement,
  object: DrawingObject
): HTMLElement {
  const bounds = getDrawingSelectionBounds([object]);
  const padding =
    bounds && (object.kind === 'text' || object.kind === 'blur')
      ? Math.max(0, object.bounds.x - bounds.x)
      : 0;
  const wrapper = snapshot.createElement('div');
  Object.assign(wrapper.style, {
    all: 'initial',
    position: 'absolute',
    left: `${(Number.parseFloat(node.style.left) || 0) - padding}px`,
    top: node.style.top,
    right: '0px',
    width: 'auto',
    minWidth: '0px',
    height: node.style.height,
    overflowX: 'clip',
    overflowY: 'visible',
    pointerEvents: 'none',
  });
  node.before(wrapper);
  node.style.position = 'absolute';
  node.style.left = `${padding}px`;
  node.style.top = '0px';
  wrapper.append(node);
  return wrapper;
}

/** Materialize each drawing independently; target identity comes from the snapshot builder. */
export function prepareDrawingOverlayNodes(args: {
  source: Element;
  clone: Element;
  snapshot: Document;
  originals: Map<Node, Node>;
  resolveOriginalElement: VirtualDomOriginalElementResolver;
}): HTMLElement[] {
  const canvas = args.source.querySelector('canvas.sniptale-drawing-canvas');
  const cloneCanvas = args.clone.querySelector('canvas.sniptale-drawing-canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !cloneCanvas) return [];
  const objects = captureDrawingObjects(canvas);
  if (!objects) {
    const frame = captureDrawingFrame(canvas);
    if (frame) {
      cloneCanvas.setAttribute('width', String(frame.width));
      cloneCanvas.setAttribute('height', String(frame.height));
      cloneCanvas.setAttribute('style', frame.style.cssText);
      args.originals.set(cloneCanvas, frame);
    }
    return [];
  }
  const targets = new Map<Node, Element>();
  for (const element of args.snapshot.querySelectorAll('*')) {
    const original = args.resolveOriginalElement(element);
    if (original) targets.set(original, element);
  }
  const floating: HTMLElement[] = [];
  for (const entry of objects) {
    const node = entry.canvas
      ? args.snapshot.importNode(entry.canvas, true)
      : Array.from(
          args.clone.querySelectorAll<HTMLElement>('[data-sniptale-drawing-object-id]')
        ).find(
          (element) => element.getAttribute('data-sniptale-drawing-object-id') === entry.object.id
        );
    if (!node) continue;
    if (entry.canvas) {
      args.originals.set(node, entry.canvas);
      cloneCanvas.before(node);
    }
    const target = entry.anchor ? targets.get(entry.anchor) : null;
    if ((target instanceof HTMLElement || target instanceof SVGElement) && entry.anchor) {
      const wrapper = wrapAnchoredDrawing(args.snapshot, node, entry.object);
      applyDrawingAnchor(args.snapshot, wrapper, target, entry.anchor);
      floating.push(wrapper);
    } else {
      const wrapper = args.snapshot.createElement('div');
      const view = canvas.ownerDocument.defaultView;
      Object.assign(wrapper.style, {
        position: 'absolute',
        left: `${view?.scrollX ?? 0}px`,
        top: `${view?.scrollY ?? 0}px`,
        width: '100%',
        height: `${view?.innerHeight ?? 0}px`,
        overflowX: 'clip',
        overflowY: 'visible',
        transform: 'translateZ(0px)',
        pointerEvents: 'none',
        zIndex: '2147483647',
      });
      node.before(wrapper);
      wrapper.append(node);
      floating.push(wrapper);
    }
  }
  cloneCanvas.remove();
  return floating;
}
