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
