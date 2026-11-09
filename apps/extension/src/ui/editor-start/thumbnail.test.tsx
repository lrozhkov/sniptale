// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorStartThumbnail } from './thumbnail';
import type { EditorStartItem } from './use-items';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const load = vi.fn<(signal: AbortSignal) => Promise<Blob | undefined>>();
function item(id = 'project'): EditorStartItem {
  return { id, title: id, detail: '', loadThumbnail: load };
}
async function render(value = item()) {
  await act(async () =>
    root.render(<EditorStartThumbnail item={value} fallback={<span>Fallback</span>} />)
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:cover'), revokeObjectURL: vi.fn() });
  load.mockReset().mockResolvedValue(new Blob(['cover']));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('loads only near the viewport, once, and releases its request and URL on unmount', async () => {
  let intersect = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        intersect = () => callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  await render();
  expect(load).not.toHaveBeenCalled();
  await act(async () => {
    intersect();
    intersect();
  });
  expect(load).toHaveBeenCalledOnce();
  expect(container.querySelector('img')?.src).toBe('blob:cover');
  const signal = load.mock.calls[0]?.[0];
  act(() => root.unmount());
  root = createRoot(container);
  expect(signal?.aborted).toBe(true);
  expect(disconnect).toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cover');
});

it('does not publish an old async cover after the card revision changes', async () => {
  let finishOld: (blob: Blob) => void = () => {};
  const current = new Blob(['current']);
  load
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        })
    )
    .mockResolvedValueOnce(current);
  await render(item('same'));
  const oldSignal = load.mock.calls[0]?.[0];
  await render(item('same'));
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => finishOld(new Blob(['old'])));
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
  expect(vi.mocked(URL.createObjectURL).mock.calls[0]?.[0]).toBe(current);
});

it('keeps a fallback for missing, failed, unavailable and undecodable previews', async () => {
  load.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('decode'));
  await render();
  expect(container.textContent).toContain('Fallback');
  await render();
  expect(container.querySelector('img')).toBeNull();
  await render({ ...item(), unavailable: true });
  expect(load).toHaveBeenCalledTimes(2);
  await render();
  act(() => container.querySelector('img')?.dispatchEvent(new Event('error')));
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain('Fallback');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cover');
});

it('keeps a loaded image during same-id refresh, missing results and failure until replacement', async () => {
  vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:next');
  await render();
  let finish!: (blob: Blob | undefined) => void;
  load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  expect(container.querySelector('img')?.src).toBe('blob:first');
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  await act(async () => finish(undefined));
  expect(container.querySelector('img')?.src).toBe('blob:first');
  load.mockRejectedValueOnce(new Error('temporary read failure'));
  await render();
  expect(container.querySelector('img')?.src).toBe('blob:first');
  await render();
  expect(container.querySelector('img')?.src).toBe('blob:next');
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:first');
});

it('does not keep a previous identity visible while the next image is pending', async () => {
  await render(item('first'));
  load.mockImplementationOnce(() => new Promise(() => {}));
  await render(item('second'));
  expect(container.querySelector('img')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cover');
});
