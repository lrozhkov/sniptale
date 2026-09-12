import { useEffect, useRef } from 'react';

const DWELL_MS = 50;
const CONTEXT =
  '.guide-block, .guide-insertion, .guide-image-surface, .guide-voice-field, article, section';

/** Owns transient pointer intent; focus and active operations remain immediate CSS states. */
export function useGuideHoverIntent() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let point: { x: number; y: number } | null = null;
    const revealed = new Set<Element>();
    const cancel = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const clear = () => {
      cancel();
      for (const element of revealed) element.removeAttribute('data-guide-hover');
      revealed.clear();
    };
    const contexts = (target: EventTarget | null) => {
      const result: Element[] = [];
      if (!(target instanceof Element) || !root.contains(target)) return result;
      for (
        let element: Element | null = target;
        element && element !== root;
        element = element.parentElement
      ) {
        if (element.matches(CONTEXT)) result.push(element);
      }
      return result;
    };
    const reveal = (elements: Element[]) => {
      for (const element of elements) {
        if (!root.contains(element)) continue;
        element.setAttribute('data-guide-hover', '');
        revealed.add(element);
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      point = { x: event.clientX, y: event.clientY };
      cancel();
      if (event.buttons) {
        clear();
        return;
      }
      const next = contexts(event.target);
      for (const element of revealed) {
        if (!next.includes(element)) {
          element.removeAttribute('data-guide-hover');
          revealed.delete(element);
        }
      }
      if (next.some((element) => !revealed.has(element)))
        timer = setTimeout(() => reveal(next), DWELL_MS);
    };
    const leave = () => {
      point = null;
      clear();
    };
    const scroll = () => {
      clear();
      if (!point) return;
      timer = setTimeout(() => {
        if (point) reveal(contexts(root.ownerDocument.elementFromPoint(point.x, point.y)));
      }, DWELL_MS);
    };
    root.addEventListener('pointermove', move, { passive: true });
    root.addEventListener('pointerleave', leave);
    root.addEventListener('scroll', scroll, { capture: true, passive: true });
    return () => {
      clear();
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', leave);
      root.removeEventListener('scroll', scroll, true);
    };
  }, []);
  return ref;
}
