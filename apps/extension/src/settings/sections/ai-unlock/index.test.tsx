// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../platform/i18n';

const REQUEST_ID = '00000000-0000-4000-8000-000000000001';

const { cancelUnlockRequestMock, submitUnlockPassphraseMock } = vi.hoisted(() => ({
  cancelUnlockRequestMock: vi.fn(),
  submitUnlockPassphraseMock: vi.fn(),
}));

vi.mock('./runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime')>()),
  aiSecretUnlockRuntime: {
    cancelRequest: cancelUnlockRequestMock,
    submitPassphrase: submitUnlockPassphraseMock,
  },
}));

import { AISecretUnlockPage } from '.';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState(
    {},
    '',
    `/apps/extension/src/settings/index.html?aiUnlock=1&requestId=${REQUEST_ID}`
  );
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  vi.useRealTimers();
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

async function renderUnlockPage(): Promise<HTMLDivElement> {
  if (!container) {
    throw new Error('Expected test container');
  }
  root = createRoot(container);
  await act(async () => {
    root?.render(<AISecretUnlockPage />);
  });
  return container;
}

async function submitPassphrase(containerElement: HTMLElement): Promise<void> {
  const input = containerElement.querySelector('input');
  const form = containerElement.querySelector('form');
  if (!input || !form) {
    throw new Error('Expected unlock form');
  }

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, 'passphrase');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

it('renders the compact AI unlock page in the settings surface', () => {
  const markup = renderToStaticMarkup(<AISecretUnlockPage />);

  expect(markup).toContain(translate('settings.aiProviders.secretProtectionUnlockTitle'));
  expect(markup).toContain(translate('settings.aiProviders.secretProtectionPassphraseLabel'));
});

it('closes after a completed unlock response', async () => {
  vi.useFakeTimers();
  submitUnlockPassphraseMock.mockResolvedValueOnce({
    requestId: REQUEST_ID,
    status: 'completed',
    success: true,
  });
  const closeSpy = vi.spyOn(globalThis, 'close').mockImplementation(() => undefined);
  const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');

  const rendered = await renderUnlockPage();
  await submitPassphrase(rendered);

  expect(submitUnlockPassphraseMock).toHaveBeenCalledWith({
    requestId: REQUEST_ID,
    passphrase: 'passphrase',
  });
  expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 150);
  await act(async () => {
    vi.advanceTimersByTime(150);
  });
  expect(closeSpy).toHaveBeenCalledOnce();

  closeSpy.mockRestore();
  timeoutSpy.mockRestore();
});

it('shows the unlock response error when submission does not complete', async () => {
  submitUnlockPassphraseMock.mockResolvedValueOnce({
    error: 'AI secret unlock submission state was interrupted',
    requestId: REQUEST_ID,
    status: 'restart-required',
    success: false,
  });

  const rendered = await renderUnlockPage();
  await submitPassphrase(rendered);

  expect(rendered.textContent).toContain('AI secret unlock submission state was interrupted');
});

it('requires a passphrase before submitting the unlock request', async () => {
  const rendered = await renderUnlockPage();
  const form = rendered.querySelector('form');
  if (!form) {
    throw new Error('Expected unlock form');
  }

  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  expect(submitUnlockPassphraseMock).not.toHaveBeenCalled();
  expect(rendered.textContent).toContain(
    translate('settings.aiProviders.secretProtectionPassphraseRequired')
  );
});

it('shows thrown submission errors from runtime messaging', async () => {
  submitUnlockPassphraseMock.mockRejectedValueOnce(new Error('runtime disconnected'));

  const rendered = await renderUnlockPage();
  await submitPassphrase(rendered);

  expect(rendered.textContent).toContain('runtime disconnected');
});

it('cancels the unlock request before closing the unlock window', async () => {
  cancelUnlockRequestMock.mockResolvedValueOnce(undefined);
  const closeSpy = vi.spyOn(globalThis, 'close').mockImplementation(() => undefined);

  const rendered = await renderUnlockPage();
  const cancelButton = rendered.querySelector('button');
  if (!cancelButton) {
    throw new Error('Expected cancel button');
  }

  await act(async () => {
    cancelButton.click();
    await Promise.resolve();
  });

  expect(cancelUnlockRequestMock).toHaveBeenCalledWith(REQUEST_ID);
  expect(closeSpy).toHaveBeenCalledOnce();

  closeSpy.mockRestore();
});

it('closes locally without runtime messaging when the unlock request id is missing', async () => {
  window.history.pushState({}, '', '/apps/extension/src/settings/index.html?aiUnlock=1');
  const originalClose = globalThis.close;
  Object.defineProperty(globalThis, 'close', {
    configurable: true,
    value: undefined,
  });

  const rendered = await renderUnlockPage();
  const cancelButton = rendered.querySelector('button');
  if (!cancelButton) {
    throw new Error('Expected cancel button');
  }

  await act(async () => {
    cancelButton.click();
    await Promise.resolve();
  });

  expect(cancelUnlockRequestMock).not.toHaveBeenCalled();
  Object.defineProperty(globalThis, 'close', {
    configurable: true,
    value: originalClose,
  });
});
