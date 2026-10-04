// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createController, createMediaItem, createScenarioItem } from './test-support';
import { useGalleryAppActions } from './useGalleryAppActions';

const { updateMediaLibraryEntrySafelyMock } = vi.hoisted(() => ({
  updateMediaLibraryEntrySafelyMock: vi.fn(),
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  updateMediaLibraryEntrySafely: updateMediaLibraryEntrySafelyMock,
}));

const mountedRoots: ReturnType<typeof createRoot>[] = [];

function renderActions(controller: Parameters<typeof useGalleryAppActions>[0]) {
  const root = createRoot(document.createElement('div'));
  mountedRoots.push(root);
  const result: { current?: ReturnType<typeof useGalleryAppActions> } = {};
  function Harness() {
    result.current = useGalleryAppActions(controller);
    return null;
  }
  act(() => root.render(createElement(Harness)));
  if (!result.current) throw new Error('Gallery actions did not render');
  return result.current;
}

beforeEach(() => {
  updateMediaLibraryEntrySafelyMock.mockReset();
});

afterEach(() => {
  for (const root of mountedRoots.splice(0)) act(() => root.unmount());
});

it('closes a preview after a pending navigation save without reopening the target', async () => {
  const source = createMediaItem({ filename: 'first.png', id: 'asset-1' });
  const target = createMediaItem({ filename: 'second.png', id: 'asset-2' });
  const { controller, getState } = createController({
    filenameDraft: 'renamed.png',
    previewItem: source,
  });
  let resolveSave!: () => void;
  updateMediaLibraryEntrySafelyMock
    .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveSave = resolve)))
    .mockResolvedValue(undefined);
  const actions = renderActions(controller);

  const navigation = actions.preview.navigate(target);
  const close = actions.preview.close();
  resolveSave();
  await Promise.all([navigation, close]);

  expect(getState().preview.session.item).toBeNull();
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
});

it('restores the original filename before closing after a pending navigation save', async () => {
  const source = createMediaItem({ filename: 'first.png', id: 'asset-1' });
  const target = createMediaItem({ filename: 'second.png', id: 'asset-2' });
  const { controller, getState } = createController({
    filenameDraft: 'temporary.png',
    previewItem: source,
  });
  let resolveSave!: () => void;
  updateMediaLibraryEntrySafelyMock.mockImplementationOnce(
    () => new Promise<void>((resolve) => (resolveSave = resolve))
  );
  const actions = renderActions(controller);

  const navigation = actions.preview.navigate(target);
  controller.actions.preview.setFilenameDraft('first.png');
  const close = actions.preview.close();
  resolveSave();
  await Promise.all([navigation, close]);

  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenNthCalledWith(2, 'asset-1', {
    filename: 'first.png',
  });
  expect(getState().preview.session.item).toBeNull();
});

it('keeps a draft edited while preview close is saving', async () => {
  const source = createMediaItem({ filename: 'first.png', id: 'asset-1' });
  const { controller, getState } = createController({
    filenameDraft: 'renamed.png',
    previewItem: source,
  });
  let resolveSave!: () => void;
  updateMediaLibraryEntrySafelyMock.mockImplementationOnce(
    () => new Promise<void>((resolve) => (resolveSave = resolve))
  );
  const actions = renderActions(controller);

  const close = actions.preview.close();
  controller.actions.preview.setFilenameDraft('newer.png');
  resolveSave();
  await close;

  expect(getState().preview.session.item).toEqual(source);
  expect(getState().preview.draft.filename).toBe('newer.png');
  expect(controller.actions.storage.refresh).not.toHaveBeenCalled();
});

it.each(['media', 'scenario'])(
  'keeps the source draft after a failed save navigating to %s',
  async (kind) => {
    const source = createMediaItem({ filename: 'first.png', id: 'asset-1' });
    const target =
      kind === 'scenario'
        ? createScenarioItem()
        : createMediaItem({ filename: 'second.png', id: 'asset-2' });
    const { controller, getState } = createController({
      filenameDraft: 'renamed.png',
      previewItem: source,
    });
    updateMediaLibraryEntrySafelyMock.mockRejectedValueOnce(new Error('write failed'));
    const actions = renderActions(controller);

    await actions.preview.navigate(target);

    expect(getState().preview.session.item).toEqual(source);
    expect(getState().preview.draft.filename).toBe('renamed.png');
    expect(getState().storage.banner).toBeTruthy();
  }
);

it('saves a media draft before opening a scenario through the existing navigator', async () => {
  const source = createMediaItem({ id: 'asset-source', filename: 'before.png' });
  const target = createScenarioItem({ filename: 'Scenario destination' });
  const { controller, getState } = createController({
    filenameDraft: 'after.png',
    previewItem: source,
  });
  updateMediaLibraryEntrySafelyMock.mockResolvedValue(undefined);
  const actions = renderActions(controller);
  await actions.preview.navigate(target);
  expect(updateMediaLibraryEntrySafelyMock).toHaveBeenCalledWith('asset-source', {
    filename: 'after.png',
  });
  expect(getState().preview.session.item).toEqual(target);
  expect(getState().preview.session.url).toBeNull();
});
