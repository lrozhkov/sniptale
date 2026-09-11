// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTranslator } from '../../platform/i18n';
import { GuideImageUpload } from './image-upload';
let root: Root;
let host: HTMLDivElement;
const upload = vi.fn<(file: File, signal: AbortSignal) => Promise<boolean>>();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  upload.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <GuideImageUpload
        frame={{ width: 960, height: 540 }}
        disabled={false}
        onUpload={upload}
        t={createTranslator('en')}
      />
    )
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function choose() {
  const input = host.querySelector('input');
  if (!input) throw new Error('Missing upload input');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['image'], 'test.png', { type: 'image/png' })],
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
it('keeps an unavailable image recoverable and allows another file selection', async () => {
  upload.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await choose();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await choose();
  expect(upload).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
it('rejects duplicate upload and aborts pending preparation on unmount', async () => {
  let finish: ((accepted: boolean) => void) | undefined;
  upload.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await choose();
  await choose();
  expect(upload).toHaveBeenCalledTimes(1);
  expect(host.querySelector('button')?.disabled).toBe(true);
  const signal = upload.mock.calls[0]?.[1];
  act(() => root.render(null));
  expect(signal?.aborted).toBe(true);
  await act(async () => finish?.(true));
});
it('aborts explicitly and does not display late failure from the cancelled file', async () => {
  let finish: ((accepted: boolean) => void) | undefined;
  upload
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValue(true);
  await choose();
  const cancel = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Cancel preparation'
  );
  await act(async () => cancel?.click());
  expect(upload.mock.calls[0]?.[1].aborted).toBe(true);
  await choose();
  await act(async () => finish?.(false));
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
