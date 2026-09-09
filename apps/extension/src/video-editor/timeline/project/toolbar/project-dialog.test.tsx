// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectNameDialog } from './project-dialog';
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
const hosts: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of hosts.splice(0)) cleanup();
  vi.unstubAllGlobals();
});
function mount(copy = false, onCreate = vi.fn().mockResolvedValue(undefined)) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  const onVisibilityChange = vi.fn();
  act(() =>
    root.render(
      <ProjectNameDialog
        copy={copy}
        projectName="Original"
        onCreate={onCreate}
        onClose={onClose}
        onVisibilityChange={onVisibilityChange}
      />
    )
  );
  hosts.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, onClose, onVisibilityChange, onCreate };
}
it('does not create before confirmation and rejects whitespace', () => {
  const { host, onCreate, onClose } = mount();
  expect(onCreate).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(true);
  act(() => host.querySelectorAll<HTMLButtonElement>('button')[1]!.click());
  expect(onClose).toHaveBeenCalledOnce();
  expect(onCreate).not.toHaveBeenCalled();
});
it('keeps dialog open on failure and allows retry', async () => {
  const create = vi
    .fn()
    .mockRejectedValueOnce(new Error('failed'))
    .mockResolvedValueOnce(undefined);
  const { host, onClose } = mount(true, create);
  await act(async () => host.querySelector<HTMLButtonElement>('[type=submit]')!.click());
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => host.querySelector<HTMLButtonElement>('[type=submit]')!.click());
  expect(onClose).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledTimes(2);
});
it('prevents duplicate submissions and cancellation while creating', async () => {
  let resolve!: () => void;
  const create = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      })
  );
  const { host, onClose } = mount(true, create);
  act(() => host.querySelector<HTMLButtonElement>('[type=submit]')!.click());
  act(() => host.querySelector<HTMLButtonElement>('[type=submit]')!.click());
  expect(create).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  expect(
    [...host.querySelectorAll<HTMLButtonElement>('button')].every((button) => button.disabled)
  ).toBe(true);
  await act(async () => resolve());
  expect(onClose).toHaveBeenCalledOnce();
});

it('traps focus within the dialog and closes on Escape without creating', () => {
  const { host, onClose, onCreate } = mount(true);
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];
  const dialog = host.querySelector<HTMLElement>('[role=dialog]')!;
  act(() => buttons.at(-1)!.focus());
  act(() =>
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    )
  );
  expect(document.activeElement).toBe(buttons[0]);
  act(() =>
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    )
  );
  expect(document.activeElement).toBe(buttons.at(-1));
  act(() => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(onClose).toHaveBeenCalledOnce();
  expect(onCreate).not.toHaveBeenCalled();
});
