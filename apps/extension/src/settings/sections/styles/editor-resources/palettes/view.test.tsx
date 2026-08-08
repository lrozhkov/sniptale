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
    key: 'shapeStroke',
    setKey: vi.fn(),
    colors: ['#123456'],
    moveColor: vi.fn(),
    changeColor: vi.fn(),
  } as any,
}));
vi.mock('./controller', () => ({ usePalettesController: () => state.value }));
import { PalettesSettings } from './view';
it('renders palette colors in the standard preview area', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<PalettesSettings />));
  expect(node.textContent).toContain('#123456');
  act(() => root.unmount());
});

it('forwards palette selection, reorder, and color updates', () => {
  state.value.colors = ['#123456', '#654321'];
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<PalettesSettings />));
  const ownerButtons = node.querySelectorAll('section > div button');
  const input = node.querySelector('input');
  act(() => {
    (ownerButtons[1] as HTMLElement | undefined)?.click();
    [...node.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('settings.collection.actions.moveDown'))
      ?.click();
    if (input) {
      input.value = '#abcdef';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  expect(state.value.setKey).toHaveBeenCalled();
  expect(state.value.moveColor).toHaveBeenCalledWith(0, null);
  act(() => root.unmount());
});
