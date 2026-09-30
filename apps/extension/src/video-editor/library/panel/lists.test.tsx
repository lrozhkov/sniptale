// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';
import { LibraryMediaSection } from './lists';
vi.mock('./media-preview', () => ({
  MediaPreviewPane: ({ item }: { item: MediaLibraryItem | null }) => (
    <div data-ui="selected">{item?.filename ?? 'empty'}</div>
  ),
}));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function item(id: string): MediaLibraryItem {
  return {
    id,
    kind: 'recording',
    source: { kind: 'recording', recordingId: id },
    filename: id,
    originalFilename: id,
    mimeType: 'video/webm',
    createdAt: 1,
    updatedAt: 1,
    size: 100,
    width: 320,
    height: 180,
    duration: 3,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
    hasThumbnail: false,
  };
}
function render(items: MediaLibraryItem[]) {
  act(() =>
    root.render(<LibraryMediaSection items={items} thumbnails={{}} onAddMedia={vi.fn()} />)
  );
}
it('selects media and recovers selection when a filter removes the selected item', () => {
  const items = [item('first'), item('second')];
  render(items);
  act(() => container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')[1]!.click());
  expect(container.querySelector('[data-ui=selected]')?.textContent).toBe('second');
  expect(container.querySelectorAll('button[aria-pressed]')[1]?.getAttribute('aria-pressed')).toBe(
    'true'
  );
  render(items.slice(0, 1));
  expect(container.querySelector('[data-ui=selected]')?.textContent).toBe('first');
  render([]);
  expect(container.querySelector('[data-ui=selected]')?.textContent).toBe('empty');
});

it('marks selection with a quiet size-stable cue separate from hover and focus', () => {
  render([item('first'), item('second')]);
  const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
  expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
  expect(buttons[0]?.className).not.toContain('border-accent');
  expect(buttons[0]?.className).not.toContain('surface-panel)]');
  expect(
    buttons[0]?.querySelector('[data-ui="video-editor.library.selection-mark"]')
  ).not.toBeNull();
  expect(buttons[1]?.querySelector('[data-ui="video-editor.library.selection-mark"]')).toBeNull();
  expect(buttons[0]?.className).toContain('focus-visible:ring');
  act(() => buttons[1]!.click());
  expect(
    buttons[1]?.querySelector('[data-ui="video-editor.library.selection-mark"]')
  ).not.toBeNull();
});
