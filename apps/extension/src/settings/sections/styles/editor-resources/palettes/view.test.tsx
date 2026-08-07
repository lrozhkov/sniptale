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
    draggedIndex: null,
    dragOverIndex: null,
    setDraggedIndex: vi.fn(),
    setDragOverIndex: vi.fn(),
    clearDrag: vi.fn(),
    dropColor: vi.fn(),
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
  state.value.draggedIndex = 0;
  state.value.dragOverIndex = 0;
  state.value.colors = ['#123456', '#654321'];
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<PalettesSettings />));
  const ownerButtons = node.querySelectorAll('section > div button');
  const rows = node.querySelectorAll('[draggable="true"]');
  const input = node.querySelector('input');
  act(() => {
    (ownerButtons[1] as HTMLElement | undefined)?.click();
    rows[0]?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    rows[1]?.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    rows[0]?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    rows[0]?.dispatchEvent(new Event('dragend', { bubbles: true }));
    if (input) {
      input.value = '#abcdef';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  expect(state.value.setKey).toHaveBeenCalled();
  expect(state.value.setDraggedIndex).toHaveBeenCalledWith(0);
  expect(state.value.setDragOverIndex).toHaveBeenCalledWith(1);
  expect(state.value.dropColor).toHaveBeenCalledWith(0);
  expect(state.value.clearDrag).toHaveBeenCalled();
  act(() => root.unmount());
});
