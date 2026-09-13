// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
it('accepts only one bound parent file and releases its child URL on exit', async () => {
  const nonce = '12345678-1234-1234-1234-123456789abc';
  location.hash = nonce;
  const create = vi.fn(() => 'blob:isolated');
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    }
  );
  const append = vi.spyOn(document.body, 'append').mockImplementation(() => {});
  await import('./index');
  const blob = new Blob(['<!doctype html>'], { type: 'text/html' });
  const send = (data: unknown, source: Window | null = window, origin = location.origin) =>
    window.dispatchEvent(new MessageEvent('message', { source, origin, data }));
  const message = { kind: 'tour-preview', nonce, blob };
  send(message, null);
  send(message, window, 'https://untrusted.example');
  send({ ...message, nonce: 'other' });
  expect(create).not.toHaveBeenCalled();
  send(message);
  send(message);
  expect(create).toHaveBeenCalledExactlyOnceWith(blob);
  const frame = append.mock.calls[0]![0];
  if (!(frame instanceof HTMLIFrameElement)) throw new Error('Missing frame');
  expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
  window.dispatchEvent(new Event('pagehide'));
  expect(revoke).toHaveBeenCalledWith('blob:isolated');
  frame.remove();
  append.mockRestore();
  vi.unstubAllGlobals();
});
