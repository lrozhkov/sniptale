// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { GradientTemplateResources } from '../../../../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { GradientPresetEditor } from './editor';
import { DEFAULT_DRAWING_COLORS } from '../../../../../features/drawing/public';

const resources: GradientTemplateResources = {
  presets: [],
  actions: {
    onSave: vi.fn().mockResolvedValue(true),
    onUpdate: vi.fn().mockResolvedValue(true),
    onEdit: vi.fn().mockResolvedValue(true),
    onDelete: vi.fn().mockResolvedValue(true),
    onToggleFavorite: vi.fn().mockResolvedValue(true),
    onToggleEnabled: vi.fn().mockResolvedValue(true),
    onSetDefault: vi.fn().mockResolvedValue(true),
    onResetPreset: vi.fn().mockResolvedValue(true),
    onReorder: vi.fn().mockResolvedValue(true),
    onRename: vi.fn().mockResolvedValue(true),
  },
};
const node = document.createElement('div');
let root: ReturnType<typeof createRoot>;
afterEach(() => {
  act(() => root?.unmount());
  node.remove();
  vi.restoreAllMocks();
});
async function mount(onSave = vi.fn().mockResolvedValue(true), onClose = vi.fn()) {
  document.body.append(node);
  root = createRoot(node);
  await act(async () =>
    root.render(
      <GradientPresetEditor
        resources={resources}
        palette={DEFAULT_DRAWING_COLORS}
        onClose={onClose}
        onSave={onSave}
        open
        preset={null}
      />
    )
  );
  return { onSave, onClose };
}
function nameInput() {
  return node.querySelector<HTMLInputElement>('input[maxlength="80"]')!;
}
async function inputName(name: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      nameInput(),
      name
    );
    nameInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function saveButton() {
  return [...node.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Сохранить'
  )!;
}

it('opens the real gradient panel directly with one dialog and one Save action', async () => {
  await mount();
  expect(node.querySelector('[data-ui="shared.ui.paint-selector.popup"]')).not.toBeNull();
  expect(node.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(node.querySelector('[data-ui="shared.ui.paint-selector.trigger"]')).toBeNull();
  expect(nameInput().closest('[data-ui="shared.ui.paint-selector.stop-toolbar"]')).not.toBeNull();
  expect(saveButton().disabled).toBe(true);
  const palette = node.querySelector('.sniptale-paint-color .grid-cols-10')!;
  expect(palette.querySelectorAll('button')).toHaveLength(10);
  expect(
    [...palette.querySelectorAll('button')].map((button) =>
      button.getAttribute('aria-label')?.split(': ').at(-1)
    )
  ).toEqual(DEFAULT_DRAWING_COLORS);
});

it('clears the name without saving and restores focus', async () => {
  const { onSave } = await mount();
  await inputName('Draft name');
  await act(async () => node.querySelector<HTMLButtonElement>('.sniptale-field-clear')!.click());
  expect(nameInput().value).toBe('');
  expect(document.activeElement).toBe(nameInput());
  expect(node.querySelector('.sniptale-field-clear')).toBeNull();
  expect(saveButton().disabled).toBe(true);
  expect(onSave).not.toHaveBeenCalled();
});

it('saves name and edited gradient together and retains both after failure for retry', async () => {
  const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const { onClose } = await mount(onSave);
  await inputName('  My gradient  ');
  const radial = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.getAttribute('aria-label') === 'Радиальный'
  )!;
  await act(async () => radial.click());
  await act(async () => saveButton().click());
  expect(onSave).toHaveBeenLastCalledWith(
    'My gradient',
    expect.objectContaining({ type: 'radial' })
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(nameInput().value).toBe('  My gradient  ');
  await act(async () => saveButton().click());
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(onClose).toHaveBeenCalledOnce();
});

it('blocks duplicate saves, editing, and dismissal while the atomic save is pending', async () => {
  let resolveSave: ((saved: boolean) => void) | undefined;
  const onSave = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        resolveSave = resolve;
      })
  );
  const { onClose } = await mount(onSave);
  await inputName('Pending draft');
  await act(async () => {
    saveButton().click();
    saveButton().click();
  });
  expect(onSave).toHaveBeenCalledOnce();
  expect(nameInput().matches(':disabled')).toBe(true);
  expect(node.querySelector('fieldset')?.hasAttribute('inert')).toBe(true);
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    node.querySelector<HTMLDivElement>('.sniptale-modal-backdrop')!.click();
  });
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => resolveSave?.(false));
  expect(nameInput().matches(':disabled')).toBe(false);
  expect(node.querySelector('fieldset')?.hasAttribute('inert')).toBe(false);
  expect(nameInput().value).toBe('Pending draft');
});

it('retains a rejected save for retry and resets drafts after close and reopen', async () => {
  const onSave = vi
    .fn()
    .mockRejectedValueOnce(new Error('write refused'))
    .mockResolvedValueOnce(true);
  const { onClose } = await mount(onSave);
  await inputName('Retry draft');
  await act(async () => saveButton().click());
  expect(nameInput().value).toBe('Retry draft');
  expect(saveButton().disabled).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () =>
    root.render(
      <GradientPresetEditor
        resources={resources}
        palette={DEFAULT_DRAWING_COLORS}
        onClose={onClose}
        onSave={onSave}
        open={false}
        preset={null}
      />
    )
  );
  await act(async () =>
    root.render(
      <GradientPresetEditor
        resources={resources}
        palette={DEFAULT_DRAWING_COLORS}
        onClose={onClose}
        onSave={onSave}
        open
        preset={null}
      />
    )
  );
  expect(nameInput().value).toBe('');
  expect(saveButton().disabled).toBe(true);
});

it('Escape cancels the outer draft once', async () => {
  const { onClose, onSave } = await mount();
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(onClose).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});

it('restores focus to the connected opener when the editor unmounts', async () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  try {
    await mount();
    nameInput().focus();
    await act(async () =>
      root.render(
        <GradientPresetEditor
          resources={resources}
          palette={DEFAULT_DRAWING_COLORS}
          onClose={vi.fn()}
          onSave={vi.fn()}
          open={false}
          preset={null}
        />
      )
    );
    expect(document.activeElement).toBe(opener);
  } finally {
    opener.remove();
  }
});
