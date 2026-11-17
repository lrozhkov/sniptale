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
            // Extra commands have a reserved scroll area; their contents must not choose the layout.
            if (child.closest('.review-selection-specific-actions')) return true;
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
    let frame = 0;
    const schedule = () => {
      if (frame || !mounted) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    measure();
    const observedWidths = new Map<Element, number>();
    const resize = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width === observedWidths.get(entry.target)) continue;
        observedWidths.set(entry.target, width);
        changed = true;
      }
      if (changed) schedule();
    });
    // Side widths are measured output; available width and transport content are independent inputs.
    resize.observe(toolbar);
    const transport = toolbar.querySelector('[data-toolbar-transport]');
    if (transport) resize.observe(transport);
    const content = new MutationObserver((changes) => {
      if (
        changes.some((change) => {
          const target =
            change.target instanceof Element ? change.target : change.target.parentElement;
          if (
            !target ||
            target.closest(
              [
                'svg,[data-toolbar-transport],.review-timeline-selection-actions',
                '[data-ui="gallery.videoReview.noteHistoryTools"]',
              ].join(',')
            )
          )
            return false;
          if (change.type === 'characterData')
            return !!target.closest('[data-review-toolbar-label]');
          return [...change.addedNodes, ...change.removedNodes].some(
            (node) =>
              node instanceof Element &&
              (node.matches('button,[data-review-toolbar-label]') ||
                !!node.querySelector('button,[data-review-toolbar-label]'))
          );
        })
      )
        schedule();
    });
    content.observe(toolbar, { subtree: true, childList: true, characterData: true });
    void document.fonts?.ready.then(schedule);
    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      content.disconnect();
    };
  }, []);
  return ref;
}
