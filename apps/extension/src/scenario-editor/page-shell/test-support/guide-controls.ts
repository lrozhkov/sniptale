import { act } from 'react';
import { vi } from 'vitest';

/** JSDOM has no layout; menu placement reads this anchor during the committed open render. */
export async function openGuideInsertionMenu(trigger: HTMLButtonElement | null) {
  const anchor = trigger?.parentElement;
  if (!anchor) throw new Error('Missing insertion anchor');
  const geometry = vi
    .spyOn(anchor, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(100, 100, 32, 32));
  try {
    await act(async () => trigger?.click());
  } finally {
    geometry.mockRestore();
  }
}

/** Drives the visible guide controls through the same menu path as a user. */
export async function clickGuideControl(label: string, scope: ParentNode) {
  const menus = [
    [
      ['Duplicate project', 'Delete project', 'Reload project'],
      '.guide-page-header .guide-action-menu-anchor',
    ],
    [
      ['Move up', 'Move down', 'Duplicate item', 'Remove item', 'Merge with next step'],
      '.guide-document [data-selected="true"] > .guide-item-actions',
    ],
  ] as const;
  const selector =
    scope instanceof Element && scope.matches('.guide-block')
      ? '.guide-block-actions'
      : menus.find(([labels]) => labels.some((name) => name === label))?.[1];
  if (selector) {
    const trigger = scope.querySelector<HTMLButtonElement>(`${selector} button`);
    await act(async () => trigger?.click());
    scope = document.body;
  }
  if (['Text', 'Heading', 'Note', 'Add step', 'Add section'].includes(label)) {
    const insertion = ['Add step', 'Add section'].includes(label)
      ? '.guide-insertion-item[data-end="true"]'
      : '.guide-insertion-block[data-end="true"]';
    const trigger = scope.querySelector<HTMLButtonElement>(
      `${insertion} .guide-action-menu-anchor > button`
    );
    await openGuideInsertionMenu(trigger);
    scope = document.querySelector('.guide-action-menu') ?? scope;
  }
  const button = [...scope.querySelectorAll('button')].find(
    (node) => (node.getAttribute('aria-label') ?? node.textContent) === label
  );
  if (!button) throw new Error(`Missing test control ${label}`);
  await act(async () => button.click());
}
