// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AnnotationTemplateTagEditor } from './editor';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function controller(): ComponentProps<typeof AnnotationTemplateTagEditor>['controller'] {
  return {
    actions: {
      create: vi.fn(async () => true),
      delete: vi.fn(async () => true),
      merge: vi.fn(async () => true),
      rename: vi.fn(async () => true),
      reset: vi.fn(async () => true),
    },
    error: false,
    isLoading: false,
    state: {
      activeFilterTagIds: [],
      schemaVersion: 1,
      tags: [
        { id: 'review', label: 'Review', origin: 'user' },
        { id: 'training', label: 'Training', origin: 'user' },
      ],
    },
    usage: new Map(),
  };
}

async function render(props: ComponentProps<typeof AnnotationTemplateTagEditor>) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<AnnotationTemplateTagEditor {...props} />));
  return document.querySelector<HTMLInputElement>('#annotation-template-tag-name')!;
}

function change(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

it('clears the tag name without saving and returns focus for replacement', async () => {
  const state = controller();
  const onClose = vi.fn();
  const input = await render({ controller: state, editor: { mode: 'create' }, onClose });
  expect(document.querySelector('[aria-label="highlighter.templateTags.mergeTarget"]')).toBeNull();
  await act(async () => change(input, 'New tag'));
  const clear = document.querySelector<HTMLButtonElement>('.sniptale-field-clear')!;
  await act(async () => clear.click());
  expect(input.value).toBe('');
  expect(document.activeElement).toBe(input);
  expect(input.maxLength).toBe(32);
  expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  expect(state.actions.create).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => change(input, 'Replacement'));
  await act(async () =>
    document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
  );
  expect(state.actions.create).toHaveBeenCalledWith('Replacement');
  expect(onClose).toHaveBeenCalledOnce();
});

it('merges an edited custom tag only after a target selection', async () => {
  const state = controller();
  const onClose = vi.fn();
  await render({ controller: state, editor: { mode: 'edit', tag: state.state.tags[0]! }, onClose });
  const merge = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'highlighter.templateTags.merge'
  )!;
  expect(merge.disabled).toBe(true);
  const select = document.querySelector<HTMLButtonElement>(
    'button[aria-label="highlighter.templateTags.mergeTarget"]'
  )!;
  await act(async () => select.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (node) => node.textContent === 'Training'
  )!;
  await act(async () => option.click());
  await act(async () => merge.click());
  expect(state.actions.merge).toHaveBeenCalledWith('review', 'training');
  expect(onClose).toHaveBeenCalledOnce();
});

it('keeps a rejected rename draft and permits cancellation', async () => {
  const state = controller();
  vi.mocked(state.actions.rename).mockResolvedValue(false);
  const onClose = vi.fn();
  const input = await render({
    controller: state,
    editor: { mode: 'edit', tag: state.state.tags[0]! },
    onClose,
  });
  await act(async () => change(input, 'Renamed'));
  await act(async () =>
    document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
  );
  expect(state.actions.rename).toHaveBeenCalledWith('review', 'Renamed');
  expect(onClose).not.toHaveBeenCalled();
  expect(input.value).toBe('Renamed');
  const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'common.actions.cancel'
  )!;
  await act(async () => cancel.click());
  expect(onClose).toHaveBeenCalledOnce();
});
