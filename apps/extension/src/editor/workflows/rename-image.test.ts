// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../document/page-session/document.test-support';
import { createEditorSessionAutosaveService } from '../document/session-autosave';
import { useEditorStore } from '../state/useEditorStore';
import { renameEditorImage } from './rename-image';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import {
  resetEditorSnapshotHistory,
  pushEditorSnapshotHistory,
  undoEditorSnapshot,
  redoEditorSnapshot,
} from '../controller/history';

const mocks = vi.hoisted(() => ({ commit: vi.fn() }));
vi.mock('../../composition/persistence/image-aggregates', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/image-aggregates')>()),
  commitImageWorkspace: mocks.commit,
}));
let autosave: ReturnType<typeof createEditorSessionAutosaveService>;
const document = createEditorDocumentFixture();
const history = new SnapshotHistory<string>('caption');
const controller = {
  canvas: null,
  history,
  exportDocument: () => ({ ...document, displayName: useEditorStore.getState().pageTitle }),
  commitHistory: () => {
    pushEditorSnapshotHistory({ history, muted: false, exportDocument: controller.exportDocument });
  },
  get autosaveService() {
    return autosave;
  },
};
beforeEach(() => {
  mocks.commit
    .mockReset()
    .mockResolvedValue({ revision: 2, documentAssetsByRuntimeUrl: new Map() });
  autosave = createEditorSessionAutosaveService();
  autosave.activate({
    aggregateId: 'image-1',
    durableRevision: 1,
    sourceTitle: 'Old',
    sourceUrl: null,
    renderPresentation: null,
  });
  useEditorStore.getState().setPageTitle('Old');
  resetEditorSnapshotHistory(history, controller.exportDocument());
});
afterEach(() => {
  autosave.dispose();
  useEditorStore.getState().setSessionId(null);
});

it('persists a trimmed caption with unchanged source and then publishes the title', async () => {
  await renameEditorImage(controller, 'image-1', '  New.png  ');
  expect(mocks.commit).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceTitle: 'New.png',
      document: { ...document, displayName: 'New.png' },
      expectedRevision: 1,
    })
  );
  expect(useEditorStore.getState().pageTitle).toBe('New.png');
  expect(useEditorStore.getState().saveState).toBe('saved');
  await autosave.saveNow(controller.exportDocument);
  expect(mocks.commit).toHaveBeenLastCalledWith(
    expect.objectContaining({ sourceTitle: 'New.png', expectedRevision: 2 })
  );
});

it('preserves the old caption snapshot after a failed write', async () => {
  mocks.commit.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(renameEditorImage(controller, 'image-1', 'Failed')).rejects.toThrow(
    'Storage unavailable'
  );
  expect(useEditorStore.getState().pageTitle).toBe('Old');
  expect(useEditorStore.getState().saveState).toBe('error');
  await autosave.saveNow(controller.exportDocument);
  expect(mocks.commit).toHaveBeenLastCalledWith(expect.objectContaining({ sourceTitle: 'Old' }));
});

it.each(['', '   ', 'Old'])('does not persist a blank or unchanged name: %j', async (name) => {
  await renameEditorImage(controller, 'image-1', name);
  expect(mocks.commit).not.toHaveBeenCalled();
  expect(undoEditorSnapshot(history)).toBeNull();
});

it('ignores a draft addressed to a replaced document', async () => {
  await renameEditorImage(controller, 'another', 'Stale');
  expect(mocks.commit).not.toHaveBeenCalled();
  expect(undoEditorSnapshot(history)).toBeNull();
});

it('does not publish an old completion after an A to B to A document switch', async () => {
  let resolve: (() => void) | undefined;
  mocks.commit.mockImplementationOnce(() =>
    new Promise<void>((done) => {
      resolve = done;
    }).then(() => ({ revision: 2, documentAssetsByRuntimeUrl: new Map() }))
  );
  const result = renameEditorImage(controller, 'image-1', 'Stale');
  await Promise.resolve();
  await Promise.resolve();
  useEditorStore.getState().setSessionId('image-2');
  useEditorStore.getState().setSessionId('image-1');
  useEditorStore.getState().setPageTitle('Reopened');
  resolve?.();
  await result;
  expect(useEditorStore.getState().pageTitle).toBe('Reopened');
});

it('records exactly one caption step and preserves its order with image edits', async () => {
  await renameEditorImage(controller, 'image-1', 'New');
  expect(undoEditorSnapshot(history)?.displayName).toBe('Old');
  expect(undoEditorSnapshot(history)).toBeNull();
  expect(redoEditorSnapshot(history)?.displayName).toBe('New');
  const edited = { ...controller.exportDocument(), canvasWidth: document.canvasWidth + 20 };
  pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => edited });
  expect(undoEditorSnapshot(history)?.displayName).toBe('New');
  expect(undoEditorSnapshot(history)?.displayName).toBe('Old');
  expect(redoEditorSnapshot(history)?.displayName).toBe('New');
  expect(redoEditorSnapshot(history)?.canvasWidth).toBe(edited.canvasWidth);
});

it('adds no history entry when a caption write fails', async () => {
  mocks.commit.mockRejectedValueOnce(new Error('write failed'));
  await expect(renameEditorImage(controller, 'image-1', 'Failure')).rejects.toThrow();
  expect(undoEditorSnapshot(history)).toBeNull();
  expect(useEditorStore.getState().pageTitle).toBe('Old');
});
