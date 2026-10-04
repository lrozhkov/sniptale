import { useEffect, useRef, useState, type RefObject } from 'react';

const INACTIVITY_MS = 2000;

/** One fullscreen activity session; media time updates do not extend its inactivity deadline. */
function bindControlsActivity(
  container: HTMLElement,
  controls: HTMLElement,
  setVisible: (visible: boolean) => void
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let keyboard = document.activeElement?.matches(':focus-visible') ?? false;
  let hovering = controls.matches(':hover');
  let gesture = false;
  let live = true;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const pinned = () => {
    const focused = document.activeElement;
    return (
      hovering ||
      gesture ||
      controls.querySelector('[aria-expanded="true"]') !== null ||
      (controls.contains(focused) && (keyboard || focused?.matches(':focus-visible')))
    );
  };
  const reveal = () => {
    if (!live) return;
    clear();
    setVisible(true);
    if (pinned()) return;
    timer = setTimeout(() => {
      timer = null;
      if (pinned()) return;
      const focused = document.activeElement;
      // Mouse-focused seek previews follow their existing blur owner when the panel disappears.
      if (focused instanceof HTMLElement && controls.contains(focused)) focused.blur();
      clear();
      setVisible(false);
    }, INACTIVITY_MS);
  };
  const onMove = (event: PointerEvent) => {
    hovering = event.target instanceof Node && controls.contains(event.target);
    reveal();
  };
  const onDown = (event: PointerEvent) => {
    keyboard = false;
    gesture = event.target instanceof Node && controls.contains(event.target);
    reveal();
  };
  const onRelease = () => {
    if (!gesture) return;
    gesture = false;
    reveal();
  };
  const onLeave = () => {
    hovering = false;
    reveal();
  };
  const onKey = () => {
    keyboard = true;
    reveal();
  };
  const onFocusOut = (event: FocusEvent) => {
    if (!(event.relatedTarget instanceof Node) || !controls.contains(event.relatedTarget))
      queueMicrotask(reveal);
  };
  const observer = new MutationObserver(reveal);
  observer.observe(controls, {
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-expanded'],
  });
  container.addEventListener('pointermove', onMove, true);
  container.addEventListener('pointerdown', onDown, true);
  container.addEventListener('pointerleave', onLeave);
  container.addEventListener('keydown', onKey, true);
  container.addEventListener('focusin', reveal);
  container.addEventListener('focusout', onFocusOut);
  window.addEventListener('pointerup', onRelease);
  window.addEventListener('pointercancel', onRelease);
  reveal();
  return () => {
    live = false;
    clear();
    observer.disconnect();
    container.removeEventListener('pointermove', onMove, true);
    container.removeEventListener('pointerdown', onDown, true);
    container.removeEventListener('pointerleave', onLeave);
    container.removeEventListener('keydown', onKey, true);
    container.removeEventListener('focusin', reveal);
    container.removeEventListener('focusout', onFocusOut);
    window.removeEventListener('pointerup', onRelease);
    window.removeEventListener('pointercancel', onRelease);
  };
}

/** Visibility is transient and resets with its source, fullscreen activation and transport availability. */
export function useVideoControlsVisibility({
  container,
  src,
  fullscreen,
  canHide,
}: {
  container: RefObject<HTMLDivElement | null>;
  src: string;
  fullscreen: boolean;
  canHide: boolean;
}) {
  const controls = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    if (!fullscreen || !canHide || !container.current || !controls.current) return;
    return bindControlsActivity(container.current, controls.current, setVisible);
  }, [container, src, fullscreen, canHide]);
  return { controls, visible: !fullscreen || !canHide || visible };
}
