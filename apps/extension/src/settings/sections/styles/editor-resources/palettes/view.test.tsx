// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
const state = vi.hoisted(() => ({
  value: {
    key: 'drawing',
    setKey: vi.fn(),
    colors: ['#123456'],
    moveColor: vi.fn(),
    changeColor: vi.fn(),
  } as any,
}));
vi.mock('./controller', () => ({ usePalettesController: () => state.value }));
import { PalettesSettings } from './view';
it('renders each palette color once as a picker without a duplicate heading or visible index', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<PalettesSettings />));
  expect(node.textContent?.match(/#123456/gi)).toHaveLength(1);
  expect(node.textContent).not.toMatch(/#1(?![0-9a-f])/i);
  expect(node.querySelector('h2')).toBeNull();
  expect(node.querySelectorAll('[data-ui="shared.ui.color-selector"]')).toHaveLength(1);
  act(() => root.unmount());
});

it('forwards palette selection, reorder, and picker updates', async () => {
  state.value.colors = ['#123456', '#654321'];
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  await act(async () => root.render(<PalettesSettings />));
  const ownerButtons = node.querySelectorAll('section > div button');
  await act(async () => {
    (ownerButtons[1] as HTMLElement | undefined)?.click();
    [...node.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('settings.collection.actions.moveDown'))
      ?.click();
  });
  await act(async () =>
    node
      .querySelector<HTMLButtonElement>('[data-ui="shared.ui.color-selector.picker-trigger"]')
      ?.click()
  );
  const input = document.querySelector<HTMLInputElement>(
    '[data-ui="shared.ui.color-selector.picker"] input[type="text"]'
  );
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setValue?.call(input, '#abcdef');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const apply = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'shared.ui.colorSelectorApply'
  );
  await act(async () => apply?.click());
  expect(state.value.setKey).toHaveBeenCalled();
  expect(state.value.moveColor).toHaveBeenCalledWith(0, null);
  expect(state.value.changeColor).toHaveBeenCalledWith(0, '#abcdef');
  await act(async () => root.unmount());
  node.remove();
});
