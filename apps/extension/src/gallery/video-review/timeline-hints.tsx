import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { reviewTimeLabel } from './controls';
import './timeline-hints.css';

/** Lane owners supply content; one surface owns hint timing, placement and dismissal. */
export function reviewTimelineHint(label: string, start: number, end?: number, detail?: string) {
  return [
    label,
    end === undefined
      ? reviewTimeLabel(start)
      : `${reviewTimeLabel(start)} – ${reviewTimeLabel(end)} · ${reviewTimeLabel(end - start)}`,
    detail,
  ]
    .filter(Boolean)
    .join('\n');
}

export function ReviewTimelineHints() {
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const id = useId();
  const dismiss = useRef<() => void>(() => {});
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hint, setHint] = useState<{ text: string; target: HTMLElement; host: Element } | null>(
    null
  );
  useEffect(() => {
    const surface = anchor.current?.closest('[data-ui="gallery.videoReview.timeline"]');
    if (!surface) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: HTMLElement | null = null;
    let nativeTitle: string | null = null;
    let gesturing = false;
    const ancestorTitles = new Map<Element, string>();
    let describedBy: string | null = null;
    const hide = () => {
      clearTimeout(timer);
      clearTimeout(leaveTimer.current);
      if (active) {
        active.removeAttribute('data-review-native-hint');
        if (nativeTitle !== null) active.setAttribute('title', nativeTitle);
        if (describedBy === null) active.removeAttribute('aria-describedby');
        else active.setAttribute('aria-describedby', describedBy);
      }
      for (const [node, title] of ancestorTitles) node.setAttribute('title', title);
      ancestorTitles.clear();
      active = null;
      nativeTitle = null;
      describedBy = null;
      setHint(null);
    };
    dismiss.current = hide;
    const show = (event: Event) => {
      clearTimeout(leaveTimer.current);
      if (
        gesturing ||
        (event instanceof PointerEvent && (event.buttons || event.pointerType === 'touch'))
      )
        return;
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              '[data-review-hint],[data-review-native-hint],[title],button[aria-label],[role="button"][aria-label]'
            )
          : null;
      if (target === active) return;
      hide();
      if (!target || !surface.contains(target)) return;
      const text =
        target.dataset['reviewHint'] ||
        target.dataset['reviewNativeHint'] ||
        target.getAttribute('title') ||
        target.getAttribute('aria-label');
      if (!text?.trim()) return;
      active = target;
      nativeTitle = target.getAttribute('title');
      describedBy = target.getAttribute('aria-describedby');
      target.setAttribute('data-review-native-hint', text);
      target.removeAttribute('title');
      for (
        let parent = target.parentElement;
        parent && surface.contains(parent);
        parent = parent.parentElement
      ) {
        const title = parent.getAttribute('title');
        if (title !== null) {
          ancestorTitles.set(parent, title);
          parent.removeAttribute('title');
        }
      }
      timer = setTimeout(() => {
        if (!target.isConnected) return hide();
        target.setAttribute('aria-describedby', [describedBy, id].filter(Boolean).join(' '));
        setHint({ text, target, host: surface.closest('dialog') ?? document.body });
      }, 500);
    };
    const leave = (event: Event) => {
      const related =
        event instanceof PointerEvent || event instanceof FocusEvent ? event.relatedTarget : null;
      if (
        related instanceof Node &&
        (active?.contains(related) || tooltip.current?.contains(related))
      )
        return;
      if (tooltip.current) leaveTimer.current = setTimeout(hide, 150);
      else hide();
    };
    const key = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') hide();
    };
    const beginGesture = () => {
      gesturing = true;
      hide();
    };
    const endGesture = () => {
      gesturing = false;
    };
    surface.addEventListener('pointerover', show);
    surface.addEventListener('pointerout', leave);
    surface.addEventListener('focusin', show);
    surface.addEventListener('focusout', leave);
    surface.addEventListener('pointerdown', beginGesture, true);
    window.addEventListener('pointerup', endGesture, true);
    window.addEventListener('pointercancel', endGesture, true);
    window.addEventListener('blur', endGesture);
    surface.addEventListener('keydown', key);
    const scroll = (event: Event) => {
      if (event.target instanceof Node && tooltip.current?.contains(event.target)) return;
      hide();
    };
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', hide);
    return () => {
      hide();
      surface.removeEventListener('pointerover', show);
      surface.removeEventListener('pointerout', leave);
      surface.removeEventListener('focusin', show);
      surface.removeEventListener('focusout', leave);
      surface.removeEventListener('pointerdown', beginGesture, true);
      window.removeEventListener('pointerup', endGesture, true);
      window.removeEventListener('pointercancel', endGesture, true);
      window.removeEventListener('blur', endGesture);
      surface.removeEventListener('keydown', key);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', hide);
    };
  }, [id]);
  useLayoutEffect(() => {
    const node = tooltip.current;
    if (!hint || !node) return;
    const bounds = hint.target.getBoundingClientRect();
    const size = node.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(bounds.left + bounds.width / 2 - size.width / 2, window.innerWidth - size.width - 8)
    );
    const top =
      bounds.top >= size.height + 8
        ? bounds.top - size.height - 8
        : Math.min(bounds.bottom + 8, window.innerHeight - size.height - 8);
    node.style.left = `${left}px`;
    node.style.top = `${Math.max(8, top)}px`;
  }, [hint]);
  return (
    <>
      <span ref={anchor} hidden />
      {hint
        ? createPortal(
            <div
              ref={tooltip}
              id={id}
              role="tooltip"
              className="review-timeline-hint"
              onPointerEnter={() => clearTimeout(leaveTimer.current)}
              onPointerLeave={(event) => {
                if (
                  event.relatedTarget instanceof Node &&
                  hint.target.contains(event.relatedTarget)
                )
                  return;
                leaveTimer.current = setTimeout(() => dismiss.current(), 150);
              }}
            >
              {hint.text}
            </div>,
            hint.host
          )
        : null}
    </>
  );
}
