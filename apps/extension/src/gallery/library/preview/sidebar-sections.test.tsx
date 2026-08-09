// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createMediaItem } from '../actions/test-support';
import { PreviewActions } from './sidebar-sections';
import type { PreviewPanelProps } from './types';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createProps(onPromote?: () => Promise<void>): PreviewPanelProps {
  return {
    filenameDraft: 'draft.png',
    inspectorCollapsed: false,
    item: createMediaItem({
      lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
    }),
    onAddTag: vi.fn(),
    onClose: vi.fn(),
    onCopy: vi.fn(),
    onDelete: vi.fn(),
    onDownload: vi.fn(),
    onEdit: vi.fn(),
    onFilenameChange: vi.fn(),
    onInspectorToggle: vi.fn(),
    ...(onPromote ? { onPromote } : {}),
    onRemoveTag: vi.fn(),
    onTagDraftChange: vi.fn(),
    previewUrl: null,
    tagDraft: '',
    tagDrafts: [],
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

it('disables duplicate promotion and surfaces a recoverable failure', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onPromote = vi.fn().mockRejectedValue(new Error('write failed'));

  await act(async () => root.render(<PreviewActions {...createProps(onPromote)} />));
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes('gallery.preview.saveToLibrary')
  );
  expect(button).toBeDefined();
  await act(async () => button?.click());

  expect(onPromote).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'gallery.preview.saveToLibraryError'
  );
  await act(async () => root.unmount());
});

it('returns to the idle state after a successful promotion', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onPromote = vi.fn().mockResolvedValue(undefined);

  await act(async () => root.render(<PreviewActions {...createProps(onPromote)} />));
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes('gallery.preview.saveToLibrary')
  );
  await act(async () => button?.click());

  expect(onPromote).toHaveBeenCalledOnce();
  expect(button?.hasAttribute('disabled')).toBe(false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  await act(async () => root.unmount());
});

it('keeps promotion unavailable for library items and without a promotion owner', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const props = createProps(vi.fn().mockResolvedValue(undefined));

  await act(async () =>
    root.render(
      <PreviewActions
        {...props}
        item={createMediaItem({
          lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
        })}
      />
    )
  );
  expect(container.textContent).not.toContain('gallery.preview.saveToLibrary');

  await act(async () => root.render(<PreviewActions {...createProps()} />));
  expect(container.textContent).not.toContain('gallery.preview.saveToLibrary');
  await act(async () => root.unmount());
});

it('disables promotion while the storage mutation is pending', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let resolvePromotion: (() => void) | undefined;
  const onPromote = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolvePromotion = resolve;
      })
  );

  await act(async () => root.render(<PreviewActions {...createProps(onPromote)} />));
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes('gallery.preview.saveToLibrary')
  );
  act(() => button?.click());
  expect(button?.hasAttribute('disabled')).toBe(true);

  await act(async () => resolvePromotion?.());
  expect(button?.hasAttribute('disabled')).toBe(false);
  await act(async () => root.unmount());
});
