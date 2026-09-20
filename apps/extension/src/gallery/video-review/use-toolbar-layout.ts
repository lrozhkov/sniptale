import { useLayoutEffect, useRef } from 'react';

/** One layout owner hides captions before relaxing centering or moving tools to another row. */
export function useReviewToolbarLayout() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const toolbar = ref.current;
    if (!toolbar) return;
    let mounted = true;
    const sides = Array.from(toolbar.querySelectorAll<HTMLElement>('[data-toolbar-side]'));
    const fits = () => sides.every((side) => side.scrollWidth <= side.clientWidth + 1);
    const measure = () => {
      if (!mounted) return;
      // These attributes are presentation-only and belong exclusively to this layout observer.
      toolbar.dataset['layout'] = 'balanced';
      toolbar.dataset['labels'] = 'shown';
      if (!fits()) toolbar.dataset['labels'] = 'hidden';
      if (!fits()) toolbar.dataset['layout'] = 'compact';
      if (toolbar.scrollWidth > toolbar.clientWidth + 1 || !fits())
        toolbar.dataset['layout'] = 'stacked';
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(toolbar);
    sides.forEach((side) => resize.observe(side));
    const content = new MutationObserver((changes) => {
      if (
        changes.some((change) => {
          const target =
            change.target instanceof Element ? change.target : change.target.parentElement;
          return !target?.closest('[data-toolbar-transport]');
        })
      )
        measure();
    });
    content.observe(toolbar, { subtree: true, childList: true, characterData: true });
    void document.fonts?.ready.then(measure);
    return () => {
      mounted = false;
      resize.disconnect();
      content.disconnect();
    };
  }, []);
  return ref;
}
