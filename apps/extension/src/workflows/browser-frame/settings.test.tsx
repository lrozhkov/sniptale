// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { WindowHeaderSettings } from './settings';
import { DEFAULT_WINDOW_HEADER, type WindowHeader } from '../../features/browser-frame/header';
const acquire = vi.hoisted(() => vi.fn());
vi.mock('./favicon', () => ({ acquireWindowHeaderFavicon: acquire }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const icon = 'data:image/png;base64,iVBORw0KGgo=';

it('keeps saved icon offline, clears on disable, and reacquires only on explicit enable', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let current: WindowHeader | undefined;
  function Harness() {
    const [header, setHeader] = useState<WindowHeader | undefined>({
      ...DEFAULT_WINDOW_HEADER,
      url: 'example.test',
      faviconEnabled: true,
      faviconDataUrl: icon,
    });
    current = header;
    return <WindowHeaderSettings header={header} onChange={setHeader} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(acquire).not.toHaveBeenCalled();
    const button = host.querySelector<HTMLButtonElement>('button[aria-pressed="true"][title]')!;
    // Segmented controls have titles too; favicon is the final button.
    const toggle = () =>
      host
        .querySelectorAll<HTMLButtonElement>('button')
        .item(host.querySelectorAll('button').length - 1);
    await act(async () => toggle().click());
    expect(current?.faviconEnabled).toBe(false);
    expect(current?.faviconDataUrl).toBeUndefined();
    expect(acquire).not.toHaveBeenCalled();
    acquire.mockResolvedValue(icon);
    await act(async () => toggle().click());
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(current?.faviconDataUrl).toBe(icon);
    expect(button).toBeTruthy();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('does not restore a late favicon after the user disables it', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let resolve!: (value: string) => void;
  acquire.mockReturnValue(
    new Promise<string>((done) => {
      resolve = done;
    })
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let current: WindowHeader | undefined;
  function Harness() {
    const [header, setHeader] = useState<WindowHeader | undefined>({
      ...DEFAULT_WINDOW_HEADER,
      url: 'example.test',
    });
    current = header;
    return <WindowHeaderSettings header={header} onChange={setHeader} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    const toggle = () =>
      host
        .querySelectorAll<HTMLButtonElement>('button')
        .item(host.querySelectorAll('button').length - 1);
    await act(async () => toggle().click());
    await act(async () => toggle().click());
    await act(async () => resolve(icon));
    expect(current?.faviconEnabled).toBe(false);
    expect(current?.faviconDataUrl).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('keeps typing local until blur or Enter and cancels an edit with Escape', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();
  function Harness() {
    const [header, setHeader] = useState<WindowHeader | undefined>(DEFAULT_WINDOW_HEADER);
    return (
      <WindowHeaderSettings
        header={header}
        onChange={(next) => {
          changed(next);
          setHeader(next);
        }}
      />
    );
  }
  const input = () => host.querySelector<HTMLInputElement>('input')!;
  const type = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input(),
        value
      );
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => input().focus());
    await type('A');
    await type('A title');
    expect(input().value).toBe('A title');
    expect(changed).not.toHaveBeenCalled();
    await act(async () => input().blur());
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'A title' }));
    await act(async () => input().focus());
    await type('Cancel');
    await act(async () =>
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(changed).toHaveBeenCalledTimes(1);
    expect(input().value).toBe('A title');
    await act(async () => input().focus());
    await type('Accepted');
    await act(async () =>
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    );
    expect(changed).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('does not start favicon acquisition after an async image edit outlives its inspector', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await act(async () =>
    root.render(
      <WindowHeaderSettings
        header={{ ...DEFAULT_WINDOW_HEADER, url: 'example.test' }}
        onChange={() => pending}
      />
    )
  );
  const buttons = host.querySelectorAll<HTMLButtonElement>('button');
  await act(async () => buttons.item(buttons.length - 1).click());
  await act(async () => root.unmount());
  await act(async () => finish());
  expect(acquire).not.toHaveBeenCalled();
});
