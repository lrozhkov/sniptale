// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createController } from './test-support';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import { createBusyActionRunner } from './shared';
import {
  createConfirmWebSnapshotImportAction,
  createInspectWebSnapshotImportAction,
} from './web-snapshot-import';

const mocks = vi.hoisted(() => ({
  importPackage: vi.fn(),
  inspect: vi.fn(),
  openViewer: vi.fn(),
}));

vi.mock('../../../workflows/page-package/import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/page-package/import')>()),
  importWebSnapshotPackage: mocks.importPackage,
  inspectWebSnapshotImport: mocks.inspect,
}));
vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openWebSnapshotViewerPage: mocks.openViewer,
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const inspection = {
  archiveBytes: 100,
  capturedAt: '2026-08-28T00:00:00.000Z',
  manifest: createPagePackageManifestFixture(),
  resourceCount: 2,
  sourceTitle: 'Snapshot',
  sourceUrl: 'https://example.test/',
  warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

it('inspects through the dedicated picker state and imports independently of capture settings', async () => {
  const { controller, getState } = createController();
  const file = new File(['zip'], 'snapshot.sniptale-page-package.zip');
  mocks.inspect.mockResolvedValue(inspection);
  mocks.importPackage.mockResolvedValue({ assetId: 'imported-id' });
  const withBusy = createBusyActionRunner(controller);

  await createInspectWebSnapshotImportAction(controller, withBusy)(file);
  expect(getState().storage.pendingWebSnapshotImport).toEqual({ file, inspection });
  expect(controller.refs.webSnapshotImportInputRef.current?.value).toBe('');

  await createConfirmWebSnapshotImportAction(controller, withBusy)();
  expect(mocks.importPackage).toHaveBeenCalledWith(file);
  expect(controller.actions.storage.refresh).toHaveBeenCalledOnce();
  expect(mocks.openViewer).toHaveBeenCalledWith('imported-id');
  expect(getState().storage.pendingWebSnapshotImport).toBeNull();
});

it('keeps the pending preview and shows a localized safe-limit rejection', async () => {
  const { controller, getState } = createController({
    pendingWebSnapshotImport: {
      file: new File(['zip'], 'snapshot.sniptale-page-package.zip'),
      inspection,
    },
  });
  mocks.importPackage.mockRejectedValue(new Error('archive exceeds its resource profile'));

  await createConfirmWebSnapshotImportAction(controller, createBusyActionRunner(controller))();

  expect(getState().storage.pendingWebSnapshotImport).not.toBeNull();
  expect(getState().storage.banner).toBe('gallery.importModal.webSnapshotLimits');
  expect(mocks.openViewer).not.toHaveBeenCalled();
});

it('ignores an empty picker and localizes unsupported archive inspection', async () => {
  const { controller, getState } = createController();
  const action = createInspectWebSnapshotImportAction(
    controller,
    createBusyActionRunner(controller)
  );
  await action(null);
  expect(mocks.inspect).not.toHaveBeenCalled();

  mocks.inspect.mockRejectedValue(new Error('Only a standard Web Snapshot can be imported'));
  await action(new File(['zip'], 'snapshot.sniptale-page-package.zip'));
  expect(getState().storage.pendingWebSnapshotImport).toBeNull();
  expect(getState().storage.banner).toBe('gallery.importModal.webSnapshotUnsupported');
});

it('does nothing when confirmation has no pending inspected file', async () => {
  const { controller } = createController();
  await createConfirmWebSnapshotImportAction(controller, createBusyActionRunner(controller))();
  expect(mocks.importPackage).not.toHaveBeenCalled();
});

it('keeps a committed import successful when the Library refresh fails', async () => {
  const file = new File(['zip'], 'snapshot.sniptale-page-package.zip');
  const { controller, getState } = createController({
    pendingWebSnapshotImport: { file, inspection },
  });
  mocks.importPackage.mockResolvedValue({ assetId: 'committed-id' });
  vi.mocked(controller.actions.storage.refresh).mockRejectedValue(new Error('refresh failed'));

  await createConfirmWebSnapshotImportAction(controller, createBusyActionRunner(controller))();

  expect(getState().storage.pendingWebSnapshotImport).toBeNull();
  expect(mocks.openViewer).toHaveBeenCalledWith('committed-id');
  expect(getState().storage.banner).toBe('gallery.importModal.webSnapshotImportedRefreshFailed');
});

it('reports Viewer failure as post-import recovery instead of invalid archive', async () => {
  const file = new File(['zip'], 'snapshot.sniptale-page-package.zip');
  const { controller, getState } = createController({
    pendingWebSnapshotImport: { file, inspection },
  });
  mocks.importPackage.mockResolvedValue({ assetId: 'committed-id' });
  mocks.openViewer.mockRejectedValue(new Error('navigation failed'));

  await createConfirmWebSnapshotImportAction(controller, createBusyActionRunner(controller))();

  expect(getState().storage.pendingWebSnapshotImport).toBeNull();
  expect(controller.actions.storage.refresh).toHaveBeenCalledOnce();
  expect(getState().storage.banner).toBe('gallery.importModal.webSnapshotImportedOpenFailed');
  expect(getState().storage.banner).not.toBe('gallery.importModal.webSnapshotInvalid');
});
