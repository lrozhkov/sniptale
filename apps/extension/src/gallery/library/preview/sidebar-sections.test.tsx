// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createMediaItem,
  createScenarioExportItem,
  createScenarioItem,
} from '../actions/test-support';
import {
  PreviewActions,
  PreviewMetadataCards,
  PreviewPromotionAction,
  PreviewTagEditor,
} from './sidebar-sections';
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

it('applies the exact tag selected from the filtered suggestion list', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onAddTag = vi.fn();

  await act(async () =>
    root.render(
      <PreviewTagEditor
        allTags={['alpha', 'beta']}
        item={createMediaItem()}
        onAddTag={onAddTag}
        onRemoveTag={vi.fn()}
        onTagDraftChange={vi.fn()}
        tagDraft="alp"
        tagDrafts={[]}
      />
    )
  );

  const input = container.querySelector('input');
  await act(async () => input?.focus());
  const alphaSuggestion = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('alpha')
  );
  await act(async () =>
    alphaSuggestion?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  );

  expect(onAddTag).toHaveBeenCalledWith('alpha');
  await act(async () => root.unmount());
});

it('renders media and project metadata through their canonical layouts', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () =>
    root.render(
      <PreviewMetadataCards item={createMediaItem({ duration: 2.5, height: 720, width: 1280 })} />
    )
  );
  expect(container.textContent).toContain('1280×720');
  expect(container.textContent).toContain('2.5 gallery.preview.durationSuffix');

  await act(async () => root.render(<PreviewMetadataCards item={createScenarioItem()} />));
  expect(container.textContent).toContain('gallery.app.createdLabel');
  expect(container.textContent).toContain('gallery.app.updatedLabel');
  await act(async () => root.unmount());
});

it('shows recording group role and opens the linked project as one action', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const props = createProps();
  const item = createMediaItem({
    kind: 'recording',
    recordingGroupView: {
      groupId: 'capture-1',
      memberCount: 3,
      order: 1,
      projectId: 'project-1',
      role: 'webcam',
      sourceLabel: 'HD Camera',
    },
  });

  await act(async () => root.render(<PreviewMetadataCards item={item} />));
  expect(container.textContent).toContain('gallery.preview.recordingRoleWebcam');
  expect(container.textContent).toContain('HD Camera');
  expect(container.textContent).toContain('gallery.preview.recordingGroup3');

  await act(async () => root.render(<PreviewActions {...props} item={item} />));
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes('gallery.preview.openRecordingGroup')
  );
  await act(async () => button?.click());
  expect(props.onEdit).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});

it('shows read-only tags without an input for non-editable exports', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onRemoveTag = vi.fn();

  await act(async () =>
    root.render(
      <PreviewTagEditor
        item={createScenarioExportItem({ tags: ['published'] })}
        onAddTag={vi.fn()}
        onRemoveTag={onRemoveTag}
        onTagDraftChange={vi.fn()}
        tagDraft=""
        tagDrafts={['published']}
      />
    )
  );

  const tagButton = container.querySelector('button');
  expect(tagButton?.hasAttribute('disabled')).toBe(true);
  expect(container.querySelector('input')).toBeNull();
  expect(container.textContent).toContain('published');
  await act(async () => root.unmount());
});

it('wires the complete screenshot action set', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const props = createProps();
  const onDownloadOriginal = vi.fn();
  const onResetChanges = vi.fn();
  const onRestoreOriginal = vi.fn();
  const onSaveCopy = vi.fn();

  await act(async () =>
    root.render(
      <PreviewActions
        {...props}
        hasChanges
        item={createMediaItem({ imageContentState: 'edited', workspaceRevision: 1 })}
        onDownloadOriginal={onDownloadOriginal}
        onResetChanges={onResetChanges}
        onRestoreOriginal={onRestoreOriginal}
        onSaveCopy={onSaveCopy}
      />
    )
  );

  await act(async () => {
    [...container.querySelectorAll('button')].forEach((button) => button.click());
  });
  expect(props.onCopy).toHaveBeenCalledOnce();
  expect(props.onDelete).toHaveBeenCalledOnce();
  expect(props.onDownload).toHaveBeenCalledOnce();
  expect(onDownloadOriginal).toHaveBeenCalledOnce();
  expect(onResetChanges).toHaveBeenCalledOnce();
  expect(onRestoreOriginal).toHaveBeenCalledOnce();
  expect(onSaveCopy).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});

it('groups preview actions by intent in a single-column hierarchy', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () =>
    root.render(
      <PreviewActions
        {...createProps()}
        hasChanges
        item={createMediaItem({ imageContentState: 'edited', workspaceRevision: 1 })}
        onDownloadOriginal={vi.fn()}
        onResetChanges={vi.fn()}
        onRestoreOriginal={vi.fn()}
        onSaveCopy={vi.fn()}
      />
    )
  );

  const text = container.textContent ?? '';
  expect(text.indexOf('gallery.preview.openInEditor')).toBeLessThan(
    text.indexOf('gallery.preview.fileActions')
  );
  expect(text.indexOf('gallery.preview.fileActions')).toBeLessThan(
    text.indexOf('gallery.preview.changeActions')
  );
  expect(text.indexOf('gallery.preview.changeActions')).toBeLessThan(
    text.indexOf('common.actions.delete')
  );
  expect(container.querySelector('.grid-cols-2')).toBeNull();
  expect(container.querySelectorAll('button svg[aria-hidden="true"]')).toHaveLength(8);
  await act(async () => root.unmount());
});

it('disables duplicate promotion and surfaces a recoverable failure', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onPromote = vi.fn().mockRejectedValue(new Error('write failed'));

  await act(async () => root.render(<PreviewPromotionAction {...createProps(onPromote)} />));
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

  await act(async () => root.render(<PreviewPromotionAction {...createProps(onPromote)} />));
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
      <PreviewPromotionAction
        {...props}
        item={createMediaItem({
          lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
        })}
      />
    )
  );
  expect(container.textContent).not.toContain('gallery.preview.saveToLibrary');

  await act(async () => root.render(<PreviewPromotionAction {...createProps()} />));
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

  await act(async () => root.render(<PreviewPromotionAction {...createProps(onPromote)} />));
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes('gallery.preview.saveToLibrary')
  );
  act(() => button?.click());
  expect(button?.hasAttribute('disabled')).toBe(true);

  await act(async () => resolvePromotion?.());
  expect(button?.hasAttribute('disabled')).toBe(false);
  await act(async () => root.unmount());
});
