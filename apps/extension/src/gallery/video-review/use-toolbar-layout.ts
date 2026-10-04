import { useLayoutEffect, useRef } from 'react';

/** Keeps captions in priority order, sharing spare side space before hiding the next group. */
export function useReviewToolbarLayout() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const toolbar = ref.current;
    if (!toolbar) return;
    let mounted = true;
    const sides = Array.from(toolbar.querySelectorAll<HTMLElement>('[data-toolbar-side]'));
    const fits = () =>
      toolbar.scrollWidth <= toolbar.clientWidth + 1 &&
      sides.every((side) => {
        const bounds = side.getBoundingClientRect();
        return (
          side.scrollWidth <= side.clientWidth + 1 &&
          Array.from(side.querySelectorAll('button, input')).every((child) => {
            const rect = child.getBoundingClientRect();
            return (
              rect.width === 0 || (rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1)
            );
          })
        );
      });
    const updateAutosaveDivider = () => {
      // Measure without the divider so its own width cannot oscillate the spacing decision.
      delete toolbar.dataset['autosaveDivider'];
      if (toolbar.dataset['layout'] === 'balanced') return;
      const autosave = toolbar.querySelector<HTMLElement>('[data-ui="autosave-control"]');
      const zoom = toolbar.querySelector<HTMLInputElement>(
        '[data-toolbar-side="trailing"] input[type="range"]'
      );
      if (
        autosave &&
        zoom &&
        zoom.getBoundingClientRect().left - autosave.getBoundingClientRect().right < 24
      )
        toolbar.dataset['autosaveDivider'] = 'shown';
    };
    const measure = () => {
      if (!mounted) return;
      // This observer exclusively owns presentation attributes; no React state or size animation.
      const buttons = Array.from(toolbar.querySelectorAll<HTMLElement>('[data-toolbar-priority]'));
      buttons.forEach((button) => delete button.dataset['captionHidden']);
      const priorities = [
        ...new Set(buttons.map((button) => Number(button.dataset['toolbarPriority']))),
      ].sort((a, b) => a - b);
      const arrange = () => {
        toolbar.dataset['layout'] = 'balanced';
        updateAutosaveDivider();
        if (fits()) return true;
        toolbar.dataset['layout'] = 'compact';
        updateAutosaveDivider();
        return fits();
      };
      for (const priority of priorities) {
        if (arrange()) break;
        buttons
          .filter((button) => Number(button.dataset['toolbarPriority']) === priority)
          .forEach((button) => {
            button.dataset['captionHidden'] = '';
          });
      }
      if (!arrange()) {
        toolbar.dataset['layout'] = 'stacked';
        updateAutosaveDivider();
      }
      const hidden = buttons.filter(
        (button) => button.dataset['captionHidden'] !== undefined
      ).length;
      toolbar.dataset['labels'] =
        hidden === 0 ? 'shown' : hidden === buttons.length ? 'hidden' : 'partial';
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
          return (
            !target?.closest('[data-toolbar-transport]') ||
            !!target?.closest('[data-review-toolbar-label]')
          );
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
