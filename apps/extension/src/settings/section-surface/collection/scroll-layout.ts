import { useLayoutEffect, type RefObject } from 'react';

export function useSettingsCollectionScrollLayout(
  root: RefObject<HTMLDivElement | null>,
  visible = true
) {
  useLayoutEffect(() => {
    const element = root.current;
    const owner = element?.closest<HTMLElement>('[data-ui="settings.page.content-scroll"]');
    if (!visible || !element || !owner) return;
    const update = () => {
      const bottom = Math.min(owner.getBoundingClientRect().bottom, window.innerHeight);
      const available = Math.max(56, Math.floor(bottom - element.getBoundingClientRect().top - 8));
      element.style.maxHeight = `${available}px`;
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    let ancestor: HTMLElement | null = element;
    while (ancestor && owner.contains(ancestor)) {
      observer?.observe(ancestor);
      if (ancestor === owner) break;
      ancestor = ancestor.parentElement;
    }
    update();
    owner.addEventListener('scroll', update);
    owner.addEventListener('animationend', update);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      owner.removeEventListener('scroll', update);
      owner.removeEventListener('animationend', update);
      window.removeEventListener('resize', update);
      element.style.removeProperty('max-height');
    };
  }, [root, visible]);
}
