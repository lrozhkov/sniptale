// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';
import { VideoEditorLibraryPanelBody } from './body';
vi.mock('./thumbnails/use-thumbnails', () => ({ useLibraryThumbnails: () => ({}) }));
vi.mock('./media-preview', () => ({ MediaPreviewPane: () => null }));
vi.mock('../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
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
function item(kind: 'recording' | 'screenshot' | 'audio'): MediaLibraryItem {
  return {
    id: kind,
    kind,
    source: { kind: 'screenshot' },
    filename: kind,
    originalFilename: kind,
    mimeType: kind === 'recording' ? 'video/webm' : kind === 'audio' ? 'audio/webm' : 'image/png',
    createdAt: 1,
    updatedAt: 1,
    size: 100,
    width: 320,
    height: 180,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
    hasThumbnail: false,
  };
}
function render(overrides = {}) {
  act(() =>
    root.render(
      <VideoEditorLibraryPanelBody
        savedViews={[]}
        items={[item('recording'), item('screenshot'), item('audio')]}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        onAddMedia={vi.fn()}
        onClose={vi.fn()}
        {...overrides}
      />
    )
  );
}
it('defaults to videos, switches to screenshots and excludes unsupported media', () => {
  render();
  const list = () => container.querySelector('[data-ui="recordings-scroll"]')!.textContent;
  expect(list()).toContain('recording');
  expect(list()).not.toContain('screenshot');
  expect(list()).not.toContain('audio');
  act(() => container.querySelectorAll<HTMLButtonElement>('nav button')[1]!.click());
  expect(list()).toContain('screenshot');
  expect(list()).not.toContain('recording');
  expect(container.querySelector('input[type=file]')).toBeNull();
  expect(container.textContent).not.toContain('diagnostics');
});
it('filters within the active category and restores results when cleared', () => {
  render();
  const input = container.querySelector('input')!;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    set.call(input, 'missing');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container.querySelector('[data-ui="recordings-scroll"]')!.textContent).toContain(
    'libraryNoSearchResults'
  );
  act(() => {
    set.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container.querySelector('[data-ui="recordings-scroll"]')!.textContent).toContain(
    'recording'
  );
});

it('does not expose internal project asset copies as additional library sources', () => {
  render({
    items: [
      item('recording'),
      {
        ...item('recording'),
        id: 'project-copy',
        kind: 'video',
        source: { kind: 'project-asset', projectAssetId: 'stored-copy' },
      },
    ],
  });
  expect(container.querySelectorAll('[data-ui="recordings-scroll"] button')).toHaveLength(1);
});
it('exposes loading and a retryable read error without showing stale media', () => {
  const onRefresh = vi.fn();
  render({ loading: true });
  expect(container.querySelector('[role=status]')).not.toBeNull();
  expect(container.querySelector('[data-ui="recordings-scroll"]')).toBeNull();
  render({ error: 'Read failed', onRefresh });
  expect(container.querySelector('[role=alert]')?.textContent).toBe('Read failed');
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="videoEditor.sidebar.libraryRefresh"]')!
      .click()
  );
  expect(onRefresh).toHaveBeenCalledOnce();
});

it('applies supported saved filters, switches category and clears the preset through category navigation', () => {
  const filters = {
    activeTags: ['keep'],
    scope: 'all',
    facetFilters: {
      created: [],
      updated: [],
      format: [],
      size: [],
      resolution: [],
      duration: [],
      source: [],
    },
  };
  const preset = {
    id: 'saved',
    name: 'Chosen screenshots',
    folderFilter: 'screenshot',
    filters,
    createdAt: 1,
    updatedAt: 1,
  };
  render({
    items: [
      item('recording'),
      { ...item('screenshot'), tags: ['keep'] },
      { ...item('screenshot'), id: 'other', filename: 'Other screenshot' },
    ],
    savedViews: [
      preset,
      { ...preset, id: 'unsupported', name: 'Web pages', folderFilter: 'web-snapshot' },
    ],
  });
  const buttons = () => Array.from(container.querySelectorAll<HTMLButtonElement>('nav button'));
  expect(buttons().map((b) => b.textContent)).not.toContain('Web pages');
  act(() =>
    buttons()
      .find((b) => b.textContent === 'Chosen screenshots')!
      .click()
  );
  expect(container.querySelector('[data-ui="recordings-scroll"]')!.textContent).toContain(
    'screenshot'
  );
  expect(container.querySelector('[data-ui="recordings-scroll"]')!.textContent).not.toContain(
    'Other screenshot'
  );
  act(() => buttons()[1]!.click());
  expect(container.querySelector('[data-ui="recordings-scroll"]')!.textContent).toContain(
    'Other screenshot'
  );
  act(() =>
    buttons()
      .find((b) => b.textContent === 'Chosen screenshots')!
      .click()
  );
  render({ savedViews: [] });
  expect(container.querySelector('[data-ui="recordings-scroll"]')!.textContent).toContain(
    'screenshot'
  );
  expect(buttons()[1]!.getAttribute('aria-pressed')).toBe('true');
});
