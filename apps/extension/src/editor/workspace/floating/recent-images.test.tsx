// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), open: vi.fn(), subscribe: vi.fn(() => vi.fn()) }));
vi.mock('../../workflows/recent-images', () => ({
  listRecentEditorImages: mocks.list,
  readRecentEditorThumbnail: vi.fn(),
}));
vi.mock('../../workflows/switch-image', () => ({ openRecentEditorImage: mocks.open }));
vi.mock('../../../features/media-hub/events', () => ({
  subscribeToMediaHubEvents: mocks.subscribe,
}));
vi.mock('../../application/controller-context', () => ({ useEditorController: () => ({}) }));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: (select: (state: { sessionId: string }) => unknown) =>
    select({ sessionId: 'image-0' }),
}));
import { EditorRecentImagesButton } from './recent-images';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const query = (ui: string) => host.querySelector<HTMLButtonElement>(`[data-ui="${ui}"]`)!;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.list.mockReset().mockResolvedValue(
    Array.from({ length: 15 }, (_, i) => ({
      id: `image-${i}`,
      title: `Image ${i}`,
      detail: '640 × 360',
      updatedAt: 100 - i,
    }))
  );
  mocks.open.mockReset().mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function open() {
  await act(async () => root.render(<EditorRecentImagesButton />));
  expect(query('editor.recent-images.panel')).toBeNull();
  await act(async () => query('editor.recent-images.trigger').click());
}
it('opens a transient bounded list, marks current, and closes with Escape restoring focus', async () => {
  await open();
  expect(host.querySelectorAll('[data-ui="editor.recent-images.item"]')).toHaveLength(12);
  expect(host.querySelector('[data-recent-close]')).toBeNull();
  expect(query('editor.recent-images.panel').textContent).not.toContain('Recent images');
  expect(document.activeElement).toBe(host.querySelector('[aria-current="true"]'));
  expect(host.querySelector('[aria-current="true"]')?.getAttribute('data-asset-id')).toBe(
    'image-0'
  );
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-current="true"]')?.click());
  expect(mocks.open).not.toHaveBeenCalled();
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(query('editor.recent-images.panel')).toBeNull();
  expect(document.activeElement).toBe(query('editor.recent-images.trigger'));
});
it('admits one switch at a time and retains the popup and selection after failure for retry', async () => {
  await open();
  let reject!: (error: Error) => void;
  mocks.open.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  const buttons = host.querySelectorAll<HTMLButtonElement>('[data-ui="editor.recent-images.item"]');
  await act(async () => {
    buttons[1]!.click();
    buttons[2]!.click();
  });
  expect(mocks.open).toHaveBeenCalledOnce();
  await act(async () => reject(new Error('save refused')));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.querySelector('[aria-current="true"]')).not.toBeNull();
  await act(async () => buttons[1]!.click());
  expect(mocks.open).toHaveBeenCalledTimes(2);
  expect(query('editor.recent-images.panel')).toBeNull();
});
it('outside dismissal keeps the destination focus', async () => {
  await open();
  const other = document.createElement('button');
  document.body.append(other);
  other.focus();
  act(() => other.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(query('editor.recent-images.panel')).toBeNull();
  expect(document.activeElement).toBe(other);
  other.remove();
});
it('shows empty and retryable loading error states', async () => {
  mocks.list.mockRejectedValueOnce(new Error('read refused'));
  await open();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  mocks.list.mockResolvedValue([]);
  await act(async () =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === 'Retry')?.click()
  );
  expect(host.querySelectorAll('[data-ui="editor.recent-images.item"]')).toHaveLength(0);
});
