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

it('uses the standard collection and creates and renames tags through its editor', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<AnnotationTemplateTagsSettings />));
  expect(host.textContent).toContain('Используется: 3');
  expect(host.querySelector('[data-settings-collection-item="review"]')).not.toBeNull();
  expect(host.querySelector('h2')).toBeNull();
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  const create = Array.from(host.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Создать тег')
  );
  await act(async () => create?.click());
  let input = host.querySelector<HTMLInputElement>('#annotation-template-tag-name');
  await act(async () => {
    setValue?.call(input, 'Training');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const submitCreate = host.querySelector<HTMLButtonElement>('button[type="submit"]');
  await act(async () => submitCreate?.click());
  expect(controller.actions.create).toHaveBeenCalledWith('Training');
  const edit = host.querySelector<HTMLButtonElement>('[aria-label="Редактировать"]');
  await act(async () => edit?.click());
  input = host.querySelector<HTMLInputElement>('#annotation-template-tag-name');
  await act(async () => {
    setValue?.call(input, 'Review 2');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
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

  const edit = host.querySelector<HTMLButtonElement>('[aria-label="Редактировать"]');
  await act(async () => edit?.click());
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

  const remove = host.querySelector<HTMLButtonElement>('[aria-label="Удалить"]');
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
