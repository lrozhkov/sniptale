// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));

import { PopupToolsPanel } from './panel';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('opens the toolbar directly or with each supported working mode selected', () => {
  const onOpen = vi.fn();
  act(() => root.render(<PopupToolsPanel disabledReason={null} onOpen={onOpen} />));

  const buttons = [...container.querySelectorAll('button')];
  expect(buttons).toHaveLength(6);
  act(() => buttons.forEach((button) => button.click()));

  expect(onOpen.mock.calls).toEqual([
    [undefined],
    ['drawing'],
    ['highlighter'],
    ['quick-edit'],
    ['design-review'],
    ['video-recording'],
  ]);
  expect(container.textContent).toContain('popup.home.toolsOpenLabel');
  expect(container.textContent).toContain('content.toolbar.designReviewEnable');
  expect(container.textContent).toContain('popup.home.toolsEditingGroup');
  expect(container.textContent).toContain('popup.home.toolsWorkflowGroup');
  expect(buttons[4]?.title).toBe('content.toolbar.designReviewEnable');
  expect(buttons[4]?.querySelector('svg')?.getAttribute('class')).toContain('lucide-swatch-book');
  expect(buttons[5]?.title).toBe('content.toolbar.videoRecordingEnable');
  expect(buttons.every((button) => button.className.includes('shrink-0'))).toBe(true);
  expect(container.querySelector('[data-ui="popup.tools.actions"]')?.className).toContain('pb-1');
});

it('disables every tools action when page preparation is unavailable', () => {
  act(() => root.render(<PopupToolsPanel disabledReason="blocked" onOpen={vi.fn()} />));

  const buttons = [...container.querySelectorAll('button')];
  expect(buttons.every((button) => button.disabled && button.title === 'blocked')).toBe(true);
});
