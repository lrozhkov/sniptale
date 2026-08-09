// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const controller = vi.hoisted(() => ({
  actions: {
    create: vi.fn(async () => true),
    delete: vi.fn(async () => true),
    merge: vi.fn(async () => true),
    rename: vi.fn(async () => true),
  },
  error: false,
  isLoading: false,
  state: {
    activeFilterTagIds: [],
    schemaVersion: 1,
    tags: [{ id: 'review', label: 'Review' }],
  },
  usage: new Map([['review', 3]]),
}));

vi.mock('./controller', () => ({ useAnnotationTemplateTagsController: () => controller }));
import { AnnotationTemplateTagsSettings } from '.';

it('creates and renames tags while showing cross-catalog usage', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<AnnotationTemplateTagsSettings />));
  expect(host.textContent).toContain('Используется: 3');
  const inputs = host.querySelectorAll<HTMLInputElement>('input');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setValue?.call(inputs[0], 'Training');
    inputs[0]?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const create = Array.from(host.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Создать тег')
  );
  await act(async () => create?.click());
  expect(controller.actions.create).toHaveBeenCalledWith('Training');
  await act(async () => {
    setValue?.call(inputs[1], 'Review 2');
    inputs[1]?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const rename = Array.from(host.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Переименовать')
  );
  await act(async () => rename?.click());
  expect(controller.actions.rename).toHaveBeenCalledWith('review', 'Review 2');
  act(() => root.unmount());
  host.remove();
});

it('supports merge and confirmed deletion and renders loading, error, and empty states', async () => {
  controller.state.tags = [
    { id: 'review', label: 'Review' },
    { id: 'training', label: 'Training' },
  ];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<AnnotationTemplateTagsSettings />));

  const select = host.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]');
  await act(async () => select?.click());
  const target = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
    (option) => option.textContent?.includes('Training')
  );
  await act(async () => target?.click());
  const merge = Array.from(host.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Объединить')
  );
  await act(async () => merge?.click());
  expect(controller.actions.merge).toHaveBeenCalledWith('review', 'training');

  const remove = Array.from(host.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Удалить')
  );
  await act(async () => remove?.click());
  const confirm = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')
  ).find((button) => button.textContent?.trim() === 'Удалить');
  await act(async () => confirm?.click());
  expect(controller.actions.delete).toHaveBeenCalledWith('review');

  controller.isLoading = true;
  await act(async () => root.render(<AnnotationTemplateTagsSettings />));
  expect(host.textContent).toContain('Загрузка');
  controller.isLoading = false;
  controller.error = true;
  await act(async () => root.render(<AnnotationTemplateTagsSettings />));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  controller.error = false;
  controller.state.tags = [];
  await act(async () => root.render(<AnnotationTemplateTagsSettings />));
  expect(host.textContent).toContain('Теги ещё не созданы');

  act(() => root.unmount());
  host.remove();
  controller.state.tags = [{ id: 'review', label: 'Review' }];
});
