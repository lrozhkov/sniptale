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
vi.mock('../gradients/view', () => ({
  GradientPresetsSettings: () => <div>gradient-presets</div>,
}));
import { PalettesSettings } from './view';
it.each([
  ['distinct', ['#123456', '#654321']],
  ['duplicate', ['#123456', '#123456']],
] as const)(
  'retains the moved %s color handle after successful publication',
  async (_name, colors) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    state.value.colors = [...colors];
    let finish!: () => void;
    state.value.moveColor.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(async () => root.render(<PalettesSettings />));
      const handles = () =>
        node.querySelectorAll<HTMLButtonElement>('[aria-label="settings.collection.dragHandle"]');
      const source = handles()[0]!;
      act(() => source.focus());
      for (const key of ['Enter', 'ArrowDown', 'Enter'])
        act(() => source.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
      await act(async () => {
        state.value.colors = [colors[1], colors[0]];
        root.render(<PalettesSettings />);
        finish();
      });
      expect(handles()[1]).toBe(source);
      expect(document.activeElement).toBe(source);
    } finally {
      await act(async () => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    }
  }
);

it('renders each palette color once as a picker without a duplicate heading or visible index', () => {
  state.value.colors = ['#123456'];
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<PalettesSettings />));
  expect(node.textContent?.match(/#123456/gi)).toHaveLength(1);
  expect(node.textContent).not.toMatch(/#1(?![0-9a-f])/i);
  expect(node.querySelector('h2')).toBeNull();
  expect(node.textContent).toContain('settings.editor.drawingQuickColorsDescription');
  expect(node.textContent).not.toContain('gradient-presets');
  expect(node.querySelectorAll('[data-ui="shared.ui.color-selector"]')).toHaveLength(1);
  act(() => root.unmount());
});

it('keeps a color editor mounted through value edits and authoritative list changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.value.colors = ['#123456', '#654321'];
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const rows = () => [...node.querySelectorAll('[data-settings-collection-item]')];
  try {
    await act(async () => root.render(<PalettesSettings />));
    const original = rows();
    await act(async () => {
      state.value.colors = ['#abcdef', '#654321'];
      root.render(<PalettesSettings />);
    });
    expect(rows()).toEqual(original);
    await act(async () => {
      state.value.colors = ['#654321', '#abcdef', '#abcdef'];
      root.render(<PalettesSettings />);
    });
    expect(rows()[0]).toBe(original[1]);
    expect(rows()[1]).toBe(original[0]);
    expect(
      new Set(rows().map((row) => row.getAttribute('data-settings-collection-item'))).size
    ).toBe(3);
    await act(async () => {
      state.value.colors = ['#abcdef'];
      root.render(<PalettesSettings />);
    });
    expect(rows()).toHaveLength(1);
    state.value.key = 'sceneBackground';
    await act(async () => root.render(<PalettesSettings />));
    expect(rows()[0]).not.toBe(original[0]);
  } finally {
    await act(async () => root.unmount());
    node.remove();
    state.value.key = 'drawing';
    vi.unstubAllGlobals();
  }
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

it('does not describe drawing shortcuts for other palettes', () => {
  state.value.key = 'sceneBackground';
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<PalettesSettings />));
  expect(node.textContent).not.toContain('settings.editor.drawingQuickColorsDescription');
  act(() => root.unmount());
  state.value.key = 'drawing';
});
