// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEditorStartItems, type EditorStartSourceItem } from './use-items';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let last: ReturnType<typeof useEditorStartItems>;
const thumbnail = vi.fn<(id: string) => Promise<Blob | undefined>>();
function Harness(props: { list: () => Promise<EditorStartSourceItem[]> }) {
  last = useEditorStartItems(props.list, thumbnail);
  return (
    <span data-testid="status">
      {last.status}:{last.items.map((item) => item.id).join(',')}
    </span>
  );
}
function item(id: string, updatedAt = 1): EditorStartSourceItem {
  return { id, title: id, detail: 'Saved', updatedAt, thumbnailId: id };
}
async function render(list: () => Promise<EditorStartSourceItem[]>) {
  await act(async () => root.render(<Harness list={list} />));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => `blob:${Math.random()}`),
    revokeObjectURL: vi.fn(),
  });
  thumbnail.mockReset().mockResolvedValue(new Blob(['thumb']));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('loads sorted cards without waiting for preview I/O and refreshes the list', async () => {
  const list = vi
    .fn()
    .mockResolvedValueOnce([item('a', 1), item('b', 2)])
    .mockResolvedValueOnce([item('c', 3)]);
  await render(list);
  expect(last.items.map((entry) => entry.id)).toEqual(['b', 'a']);
  expect(last.status).toBe('ready');
  expect(thumbnail).not.toHaveBeenCalled();
  const controller = new AbortController();
  await last.items[1]?.loadThumbnail?.(controller.signal);
  expect(thumbnail).toHaveBeenCalledWith('a', controller.signal);
  await act(async () => last.refresh());
  expect(last.items.map((entry) => entry.id)).toEqual(['c']);
});

it('keeps list errors recoverable without coupling readiness to a thumbnail', async () => {
  const list = vi
    .fn()
    .mockRejectedValueOnce(new Error('storage'))
    .mockResolvedValueOnce([item('available')]);
  await render(list);
  expect(last.status).toBe('error');
  await act(async () => last.refresh());
  expect(last.status).toBe('ready');
  expect(last.items[0]?.loadThumbnail).toBeDefined();
});

it('discards an older list response after focus starts a newer read', async () => {
  let resolveOld: (items: EditorStartSourceItem[]) => void = () => undefined;
  const list = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<EditorStartSourceItem[]>((resolve) => {
          resolveOld = resolve;
        })
    )
    .mockResolvedValueOnce([item('new')]);
  await act(async () => root.render(<Harness list={list} />));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(last.items[0]?.id).toBe('new');
  await act(async () => resolveOld([item('old')]));
  expect(last.items[0]?.id).toBe('new');
});
