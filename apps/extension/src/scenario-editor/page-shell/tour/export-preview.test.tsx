// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { TourExportPreview } from './export-preview';
it('binds sandbox status to source, opaque origin and nonce; times out and unmounts failed frames', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(<TourExportPreview title="Guide" mode="guide" blob={new Blob(['html'])} />)
  );
  const frame = host.querySelector('iframe')!;
  const nonce = new URL(frame.src).hash.slice(1);
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  act(() => frame.dispatchEvent(new Event('load')));
  expect(post).toHaveBeenCalledWith(expect.objectContaining({ nonce, mode: 'guide' }), '*');
  const send = (source: Window | null, origin: string, token = nonce) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source,
        origin,
        data: { kind: 'scenario-preview-status', nonce: token, status: 'ready' },
      })
    );
  act(() => {
    send(window, 'null');
    send(frame.contentWindow, location.origin);
    send(frame.contentWindow, 'null', 'old');
  });
  expect(host.querySelector('[role=status]')).not.toBeNull();
  act(() => send(frame.contentWindow, 'null'));
  expect(host.querySelector('[role=status]')).toBeNull();
  act(() =>
    root.render(
      <TourExportPreview key="next" title="Guide" mode="guide" blob={new Blob(['html'])} />
    )
  );
  act(() => vi.advanceTimersByTime(15000));
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  expect(host.querySelector('iframe')).toBeNull();
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});
