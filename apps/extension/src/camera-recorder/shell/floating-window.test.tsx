// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { FloatingRecordingWindow } from './floating-window';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let frame: HTMLIFrameElement | null = null;
function Draft() {
  const [text, setText] = useState('retained script');
  return <textarea aria-label="Script" value={text} onChange={(e) => setText(e.target.value)} />;
}
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(
      <FloatingRecordingWindow>
        <Draft />
      </FloatingRecordingWindow>
    )
  );
}
async function click(button: Element | null | undefined) {
  expect(button).toBeTruthy();
  await act(async () => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  frame?.remove();
  delete window.documentPictureInPicture;
  vi.restoreAllMocks();
});
it('moves the same draft into PiP and restores it on close without remounting', async () => {
  frame = document.createElement('iframe');
  document.body.append(frame);
  const pip = frame.contentWindow;
  if (!pip) throw new Error('Missing test window');
  const close = vi
    .spyOn(pip, 'close')
    .mockImplementation(() => pip.dispatchEvent(new Event('pagehide')));
  const requestWindow = vi.fn().mockResolvedValue(pip);
  window.documentPictureInPicture = { requestWindow };
  document.documentElement.setAttribute('data-theme', 'dark');
  await mount();
  const draft = host?.querySelector('textarea');
  await click(host?.querySelector('button'));
  expect(requestWindow).toHaveBeenCalledTimes(1);
  expect(pip.document.querySelector('textarea')).toBe(draft);
  expect(pip.document.documentElement.getAttribute('data-theme')).toBe('dark');
  await click(pip.document.querySelector('button'));
  expect(close).toHaveBeenCalledTimes(1);
  expect(host?.querySelector('textarea')).toBe(draft);
  expect(draft?.value).toBe('retained script');
});
it('preserves the draft after rejection and permits retry', async () => {
  const requestWindow = vi.fn().mockRejectedValue(new Error('refused'));
  window.documentPictureInPicture = { requestWindow };
  await mount();
  const draft = host?.querySelector('textarea');
  await click(host?.querySelector('button'));
  expect(host?.querySelector('[role="alert"]')?.textContent).toContain('teleprompterFloatError');
  expect(host?.querySelector('textarea')).toBe(draft);
  await click(host?.querySelector('button'));
  expect(requestWindow).toHaveBeenCalledTimes(2);
});
it('keeps the script available when Document PiP is unsupported', async () => {
  await mount();
  expect(host?.querySelector('button')?.disabled).toBe(true);
  expect(host?.querySelector('textarea')?.value).toBe('retained script');
});
it('closes a pending PiP result after host unmount', async () => {
  let resolve: ((pip: Window) => void) | undefined;
  window.documentPictureInPicture = {
    requestWindow: () =>
      new Promise((done) => {
        resolve = done;
      }),
  };
  await mount();
  await click(host?.querySelector('button'));
  act(() => root?.unmount());
  root = null;
  const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
  await act(async () => resolve?.(window));
  expect(close).toHaveBeenCalledOnce();
});
