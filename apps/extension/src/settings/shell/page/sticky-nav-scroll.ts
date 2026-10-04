import { useLayoutEffect, type RefObject } from 'react';

const STICKY_NAV_SELECTOR = '[data-ui="settings.subpage-tabs"][data-sticky="true"]';

export function useSettingsStickyNavScrollPadding(scrollRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    let currentNav: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const measure = () => {
      scroll.style.scrollPaddingTop = currentNav
        ? `${Math.ceil(currentNav.getBoundingClientRect().height) + 4}px`
        : '';
    };
    const syncNav = () => {
      const nextNav = scroll.querySelector<HTMLElement>(STICKY_NAV_SELECTOR);
      if (nextNav === currentNav) return;
      resizeObserver?.disconnect();
      currentNav = nextNav;
      measure();
      if (nextNav && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(measure);
        resizeObserver.observe(nextNav);
      }
    };

    const mutationObserver = new MutationObserver(syncNav);
    mutationObserver.observe(scroll, { childList: true, subtree: true });
    syncNav();
    window.addEventListener('resize', measure);
    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
      scroll.style.scrollPaddingTop = '';
    };
  }, [scrollRef]);
}
