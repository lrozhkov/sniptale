// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import {
  GalleryBackupActions,
  GalleryFolderList,
  GalleryStorageCard,
  GalleryTagsCard,
} from './sections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: ReactNode) {
  act(() => {
    root?.render(node);
  });
}

function findButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
}

function click(element: Element | undefined) {
  if (!(element instanceof HTMLElement)) {
    throw new Error('Expected clickable element');
  }

  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders folder actions, highlights the active folder, and forwards selection changes', () => {
  const onFolderFilterChange = vi.fn();

  render(
    <GalleryFolderList
      counts={{ all: 7, export: 1, recording: 2, scenario: 3, screenshot: 4 }}
      folderFilter="recording"
      onFolderFilterChange={onFolderFilterChange}
    />
  );

  const activeButton = findButton(translate('gallery.preview.folderRecording'));
  const nextButton = findButton(translate('gallery.preview.folderExport'));
  expect(activeButton?.className).toContain('shadow-sm');
  expect(container?.textContent).toContain('7');
  expect(translate('gallery.preview.folderWebSnapshot')).toBe('Веб-снимки');
  expect(container?.textContent).toContain('Веб-снимки');

  click(nextButton);

  expect(onFolderFilterChange).toHaveBeenCalledWith('export');

  render(
    <GalleryFolderList
      counts={{ all: 8, export: 1, recording: 2, scenario: 3, screenshot: 4, 'web-snapshot': 5 }}
      folderFilter="web-snapshot"
      onFolderFilterChange={onFolderFilterChange}
    />
  );

  expect(findButton(translate('gallery.preview.folderWebSnapshot'))?.textContent).toContain('5');
  expect(translate('gallery.preview.kindWebSnapshot')).toBe('Веб-снимок');
});

it('renders storage usage states, clamps minimal bar width, and opens the manager', () => {
  const onStorageManagerOpen = vi.fn();

  render(
    <GalleryStorageCard
      activeStorageBarClass="is-active"
      onStorageManagerOpen={onStorageManagerOpen}
      storageInfo={{ isPersistent: false, quota: 2048, usage: 1024, usageRatio: 0.5 }}
    />
  );

  expect(container?.textContent).toContain(`${formatBytes(1024)} / ${formatBytes(2048)}`);
  expect(container?.textContent).toContain(translate('gallery.app.storagePersistentPending'));

  render(
    <GalleryStorageCard
      activeStorageBarClass="is-active"
      onStorageManagerOpen={onStorageManagerOpen}
      storageInfo={{ usage: 5 }}
    />
  );

  expect(container?.textContent).toContain(translate('gallery.app.storageUnavailable'));
  expect(container?.textContent).toContain(translate('gallery.app.storagePersistentUnavailable'));
  expect((container?.querySelector('.is-active') as HTMLElement | null)?.style.width).toBe('4%');

  click(findButton(translate('gallery.app.openStorageManager')));

  expect(onStorageManagerOpen).toHaveBeenCalledTimes(1);

  render(
    <GalleryStorageCard
      activeStorageBarClass="is-active"
      onStorageManagerOpen={onStorageManagerOpen}
      storageInfo={{ isPersistent: true, quota: 4096, usage: 2048, usageRatio: 0.5 }}
    />
  );

  expect(container?.textContent).toContain(translate('gallery.app.storagePersistentEnabled'));
});

it('toggles tag filters in both directions and shows the empty state when no tags exist', () => {
  const onActiveTagsChange = vi.fn();

  render(
    <GalleryTagsCard
      activeTags={['beta']}
      allTags={['alpha', 'beta']}
      onActiveTagsChange={onActiveTagsChange}
    />
  );

  click(findButton('#alpha'));
  click(findButton('#beta'));

  expect(onActiveTagsChange.mock.calls[0]?.[0](['beta'])).toEqual(['beta', 'alpha']);
  expect(onActiveTagsChange.mock.calls[1]?.[0](['alpha', 'beta'])).toEqual(['alpha']);

  render(<GalleryTagsCard activeTags={[]} allTags={[]} onActiveTagsChange={onActiveTagsChange} />);

  expect(container?.textContent).toContain(translate('gallery.app.tagsEmpty'));
});

it('disables backup actions while busy', () => {
  const onExportBackup = vi.fn();
  const onImportBackupClick = vi.fn();

  render(
    <GalleryBackupActions
      isBusy={false}
      onExportBackup={onExportBackup}
      onImportBackupClick={onImportBackupClick}
    />
  );

  click(findButton(translate('gallery.app.exportBackup')));
  click(findButton(translate('gallery.app.importBackup')));
  expect(onExportBackup).toHaveBeenCalledTimes(1);
  expect(onImportBackupClick).toHaveBeenCalledTimes(1);

  render(
    <GalleryBackupActions
      isBusy
      onExportBackup={onExportBackup}
      onImportBackupClick={onImportBackupClick}
    />
  );

  expect(
    Array.from(container?.querySelectorAll('button') ?? []).every((button) => button.disabled)
  ).toBe(true);
});
