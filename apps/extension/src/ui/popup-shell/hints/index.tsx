import { useEffect } from 'react';

const HINT_SELECTOR = '[data-popup-hint]';
const FOCUSABLE_SELECTOR = 'button, a[href], input, select, textarea, [tabindex]';
function clipped(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    (style.overflowX !== 'visible' && element.scrollWidth > element.clientWidth + 1) ||
    (style.overflowY !== 'visible' && element.scrollHeight > element.clientHeight + 1)
  );
}

function visibleText(element: HTMLElement): string {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement;
    if (!parent || parent.closest('.sr-only, [hidden]')) continue;
    let ancestor: Element | null = parent;
    let hidden = false;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
        hidden = true;
      if (ancestor === element) break;
      ancestor = ancestor.parentElement;
    }
    if (hidden) continue;
    parts.push(walker.currentNode.textContent ?? '');
  }
  return parts.join(' ');
}

function normalize(text: string): string {
  return text.replace(/[\s.•]+/gu, ' ').trim();
}

export function resolvePopupHint(element: HTMLElement): string | null {
  const hint = element.dataset['popupHint']?.trim();
  if (!hint) return null;
  if (!normalize(visibleText(element)).includes(normalize(hint))) return hint;
  return [element, ...element.querySelectorAll<HTMLElement>('*')].some(
    (candidate) => candidate.textContent?.trim() && clipped(candidate)
  )
    ? hint
    : null;
}

function findPopupHintTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return (
    target.closest<HTMLElement>(HINT_SELECTOR) ??
    [
      ...(target.closest(FOCUSABLE_SELECTOR)?.querySelectorAll<HTMLElement>(HINT_SELECTOR) ?? []),
    ].find((element) => resolvePopupHint(element)) ??
    null
  );
}

function bindPopupHints() {
  const originals = new Map<HTMLElement, { title: string | null }>();
  const observed = new Set<HTMLElement>();
  let hovered: HTMLElement | null = null;
  let focused: HTMLElement | null = null;
  const restore = (element: HTMLElement) => {
    const original = originals.get(element);
    if (!original) return;
    if (original.title === null) element.removeAttribute('title');
    else element.setAttribute('title', original.title);
    resize.unobserve(element);
    observed.delete(element);
    originals.delete(element);
  };
  const update = () => {
    if (!hovered?.isConnected) hovered = null;
    if (!focused?.isConnected) focused = null;
    for (const element of originals.keys()) {
      if (element !== hovered && element !== focused) restore(element);
    }
    for (const element of new Set([hovered, focused])) {
      if (!element) continue;
      if (!originals.has(element))
        originals.set(element, {
          title: element.getAttribute('title'),
        });
      const hint = resolvePopupHint(element);
      if (hint) element.setAttribute('title', hint);
      else element.removeAttribute('title');
      if (!observed.has(element)) {
        observed.add(element);
        resize.observe(element);
      }
    }
  };
  const enter = (event: Event) => {
    hovered = findPopupHintTarget(event.target);
    update();
  };
  const focus = (event: Event) => {
    focused = findPopupHintTarget(event.target);
    update();
  };
  const leave = (event: Event) => {
    const next =
      event instanceof MouseEvent || event instanceof FocusEvent ? event.relatedTarget : null;
    if (event.type === 'focusout') focused = findPopupHintTarget(next);
    else hovered = findPopupHintTarget(next);
    update();
  };
  const resize = new ResizeObserver(update);
  const mutations = new MutationObserver(update);
  mutations.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-popup-hint'],
  });
  document.addEventListener('pointerover', enter);
  document.addEventListener('pointerout', leave);
  document.addEventListener('focusin', focus);
  document.addEventListener('focusout', leave);
  window.addEventListener('resize', update);
  return () => {
    document.removeEventListener('pointerover', enter);
    document.removeEventListener('pointerout', leave);
    document.removeEventListener('focusin', focus);
    document.removeEventListener('focusout', leave);
    window.removeEventListener('resize', update);
    resize.disconnect();
    mutations.disconnect();
    for (const element of originals.keys()) restore(element);
  };
}

export function PopupHints() {
  useEffect(bindPopupHints, []);
  return null;
}
