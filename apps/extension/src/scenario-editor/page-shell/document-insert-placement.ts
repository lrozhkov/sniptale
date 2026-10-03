import { useLayoutEffect, type RefObject } from 'react';

type MeasuredBlock = { element: HTMLElement; rect: DOMRect };

/** One editor observer keeps insertion targets aligned with actual wrapped rows. */
export function useGuideInsertPlacement(ref: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        placeInsertions(root);
      });
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const observe = () => {
      resize?.disconnect();
      resize?.observe(root);
      root
        .querySelectorAll('.guide-block-row, .guide-block')
        .forEach((node) => resize?.observe(node));
    };
    const mutation = new MutationObserver(() => {
      observe();
      schedule();
    });
    observe();
    mutation.observe(root, { childList: true, subtree: true });
    placeInsertions(root);
    return () => {
      resize?.disconnect();
      mutation.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [ref]);
}

function placeInsertions(root: HTMLElement): void {
  for (const segment of root.querySelectorAll<HTMLElement>('.guide-block-row')) {
    const rows: MeasuredBlock[][] = [];
    for (const element of segment.querySelectorAll<HTMLElement>(':scope > .guide-block')) {
      const rect = element.getBoundingClientRect();
      if (!rect.width) continue;
      const last = rows.at(-1);
      if (last && Math.abs(last[0]!.rect.top - rect.top) < 2) last.push({ element, rect });
      else rows.push([{ element, rect }]);
    }
    const gap = parseFloat(getComputedStyle(segment).rowGap) || 0;
    for (const row of rows) placeRow(row, gap);
  }
}

function placeRow(row: MeasuredBlock[], gap: number): void {
  const first = row[0]!;
  const left = Math.min(...row.map(({ rect }) => rect.left));
  const right = Math.max(...row.map(({ rect }) => rect.right));
  const bottom = Math.max(...row.map(({ rect }) => rect.bottom));
  row.forEach((block, index) => {
    const previous = row[index - 1];
    const marker = block.element.querySelector<HTMLElement>(
      ':scope > .guide-insertion-block:not([data-end="true"])'
    );
    if (marker) {
      if (previous) {
        position(
          marker,
          block,
          previous.rect.right,
          block.rect.left - previous.rect.right,
          block.rect.top + Math.min(previous.rect.height, block.rect.height) / 2
        );
      } else {
        position(marker, block, left, right - left, first.rect.top - gap / 2);
      }
    }
    const end = block.element.querySelector<HTMLElement>(
      ':scope > .guide-insertion-block[data-end="true"]'
    );
    if (end) position(end, block, left, right - left, bottom + gap / 2);
  });
}

function position(
  marker: HTMLElement,
  block: MeasuredBlock,
  left: number,
  width: number,
  top: number
): void {
  marker.style.left = `${left - block.rect.left}px`;
  marker.style.width = `${width}px`;
  marker.style.top = `${top - block.rect.top}px`;
  marker.style.right = 'auto';
  marker.style.bottom = 'auto';
}
