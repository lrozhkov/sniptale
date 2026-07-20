// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS } from '@sniptale/ui/inspector-shell';
import type { GallerySidebarProps } from './types';

const sectionMocks = vi.hoisted(() => ({
  backupActions: vi.fn(),
  folderList: vi.fn(),
  storageCard: vi.fn(),
  tagsCard: vi.fn(),
}));

vi.mock('./sections', () => ({
  GalleryBackupActions: (props: unknown) => {
    sectionMocks.backupActions(props);
    return <div data-ui="test.backup-actions" />;
  },
  GalleryFolderList: (props: unknown) => {
    sectionMocks.folderList(props);
    return <div data-ui="test.folder-list" />;
  },
  GalleryStorageCard: (props: unknown) => {
    sectionMocks.storageCard(props);
    return <div data-ui="test.storage-card" />;
  },
  GalleryTagsCard: (props: unknown) => {
    sectionMocks.tagsCard(props);
    return <div data-ui="test.tags-card" />;
  },
}));

import { GallerySidebar } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(): GallerySidebarProps {
  return {
    activeStorageBarClass: 'storage-normal',
    activeTags: ['alpha'],
    allTags: ['alpha', 'beta'],
    counts: { all: 2, export: 0, recording: 0, scenario: 1, screenshot: 2 },
    folderFilter: 'all',
    isBusy: false,
    onActiveTagsChange: vi.fn(),
    onExportBackup: vi.fn(),
    onFolderFilterChange: vi.fn(),
    onImportBackupClick: vi.fn(),
    onStorageManagerOpen: vi.fn(),
    storageInfo: { usage: 10 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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

it('composes folder list, storage card, tags card, and backup actions inside the shared shell', () => {
  const props = createProps();

  act(() => {
    root?.render(<GallerySidebar {...props} />);
  });

  expect(container?.querySelector('aside')?.className).toContain(
    INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS
  );
  expect(sectionMocks.folderList).toHaveBeenCalledWith(expect.objectContaining(props));
  expect(sectionMocks.storageCard).toHaveBeenCalledWith(expect.objectContaining(props));
  expect(sectionMocks.tagsCard).toHaveBeenCalledWith(expect.objectContaining(props));
  expect(sectionMocks.backupActions).toHaveBeenCalledWith(expect.objectContaining(props));
});
