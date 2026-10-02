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
  const list = () => container.querySelector('[data-ui="library-materials-list"]')!.textContent;
  expect(list()).toContain('recording');
  expect(list()).not.toContain('screenshot');
  expect(list()).not.toContain('audio');
  act(() => container.querySelectorAll<HTMLButtonElement>('nav button')[1]!.click());
  expect(list()).toContain('screenshot');
  expect(list()).not.toContain('recording');
  expect(container.querySelector('input[type=file]')).toBeNull();
  expect(container.textContent).not.toContain('diagnostics');
});

it('shows the All materials icon aligned with the category rail', () => {
  render();
  const buttons = container.querySelectorAll<HTMLButtonElement>('nav > div > button');
  const all = buttons[0]!;
  const image = buttons[1]!;
  expect(all.textContent).toBe('gallery.preview.folderAll');
  expect(all.querySelector('svg')).not.toBeNull();
  expect(all.querySelector('[aria-hidden="true"]')).not.toBeNull();
  expect(image.querySelector('svg')).not.toBeNull();
  expect(all.className).toContain('text-left');
  expect(image.className).toContain('text-left');
});
it('filters within the active category and restores results when cleared', () => {
  render();
  const input = container.querySelector('input')!;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    set.call(input, 'missing');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container.querySelector('[data-ui="library-materials-list"]')!.textContent).toContain(
    'libraryNoSearchResults'
  );
  act(() => {
    set.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container.querySelector('[data-ui="library-materials-list"]')!.textContent).toContain(
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
  expect(
    container.querySelectorAll('[data-ui="library-materials-list"] button[aria-pressed]')
  ).toHaveLength(1);
});
it('exposes loading and a retryable read error without showing stale media', () => {
  const onRefresh = vi.fn();
  render({ loading: true });
  expect(container.querySelector('[role=status]')).not.toBeNull();
  expect(container.querySelectorAll('[data-ui="library-materials-list"] button')).toHaveLength(0);
  render({ error: 'Read failed', onRefresh });
  expect(container.querySelector('[role=alert]')?.textContent).toBe('Read failed');
  act(() =>
    container.querySelector<HTMLButtonElement>('[aria-label="common.actions.retry"]')!.click()
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
  expect(container.querySelector('[data-ui="library-materials-list"]')!.textContent).toContain(
    'screenshot'
  );
  expect(container.querySelector('[data-ui="library-materials-list"]')!.textContent).not.toContain(
    'Other screenshot'
  );
  act(() => buttons()[1]!.click());
  expect(container.querySelector('[data-ui="library-materials-list"]')!.textContent).toContain(
    'Other screenshot'
  );
  act(() =>
    buttons()
      .find((b) => b.textContent === 'Chosen screenshots')!
      .click()
  );
  render({ savedViews: [] });
  expect(container.querySelector('[data-ui="library-materials-list"]')!.textContent).toContain(
    'screenshot'
  );
  expect(buttons()[1]!.getAttribute('aria-pressed')).toBe('true');
});

it('keeps all-media filters only in all media and includes both supported kinds', () => {
  render({
    savedViews: [
      {
        id: 'all-view',
        name: 'All saved',
        folderFilter: 'all',
        filters: {
          activeTags: [],
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
        },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });
  expect(container.querySelector('[data-ui="library-filters-video"]')!.textContent).not.toContain(
    'All saved'
  );
  expect(container.querySelector('[data-ui="library-filters-image"]')!.textContent).not.toContain(
    'All saved'
  );
  const all = container.querySelector('[data-ui="library-filters-all"]')!;
  expect(all.textContent).toContain('All saved');
  act(() => all.querySelector<HTMLButtonElement>('button')!.click());
  const list = container.querySelector('[data-ui="library-materials-list"]')!.textContent;
  expect(list).toContain('recording');
  expect(list).toContain('screenshot');
  expect(list).toContain('audio');
});

it('offers audio and imports the selected audio through the material owner', async () => {
  const onAddMedia = vi.fn().mockResolvedValue(undefined);
  render({ onAddMedia });
  const audio = Array.from(container.querySelectorAll<HTMLButtonElement>('nav button')).find(
    (b) => b.textContent === 'videoEditor.app.materialsAudio'
  );
  expect(audio).toBeDefined();
  act(() => audio!.click());
  const list = container.querySelector('[data-ui="library-materials-list"]')!;
  expect(list.textContent).toContain('audio');
  expect(list.textContent).not.toContain('recording');
  await act(async () =>
    list.querySelector<HTMLButtonElement>('[data-ui="video-editor.library.add-material"]')!.click()
  );
  expect(onAddMedia).toHaveBeenCalledWith('audio');
});

it('applies a nonempty format preset to filenames and extensionless MIME metadata', () => {
  render({
    items: [
      { ...item('screenshot'), id: 'file', filename: 'File.png' },
      { ...item('screenshot'), id: 'fallback', filename: 'Extensionless' },
      { ...item('screenshot'), id: 'jpeg', filename: 'Other.jpg', mimeType: 'image/jpeg' },
    ],
    savedViews: [
      {
        id: 'format-view',
        name: 'PNG files',
        folderFilter: 'all',
        createdAt: 1,
        updatedAt: 1,
        filters: {
          activeTags: [],
          scope: 'all',
          facetFilters: {
            created: [],
            updated: [],
            format: ['png'],
            size: [],
            resolution: [],
            duration: [],
            source: [],
          },
        },
      },
    ],
  });
  const preset = Array.from(container.querySelectorAll<HTMLButtonElement>('nav button')).find(
    (button) => button.textContent === 'PNG files'
  )!;
  act(() => preset.click());
  const list = container.querySelector('[data-ui="library-materials-list"]')!.textContent!;
  expect(list).toContain('File.png');
  expect(list).toContain('Extensionless');
  expect(list).not.toContain('Other.jpg');
});
