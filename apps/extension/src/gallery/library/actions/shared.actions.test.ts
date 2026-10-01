// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { StaleTrashItemError } from '../../../composition/persistence/library-lifecycle/trash';
import {
  PrimaryMediaAssetDeleteError,
  StaleMediaAssetDeletePreviewError,
} from '../../../composition/persistence/media-library/deletion-errors';
import { withMediaHubWriteGuard } from '../../../features/media-hub/storage-errors';
import { translate } from '../../../platform/i18n';
import { createController } from './test-support/index';
import { createBusyActionRunner, createGalleryUserFacingActionError } from './shared';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@sniptale/platform/observability/logger', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ warn }),
}));
beforeEach(() => warn.mockClear());

it.each([
  [
    'material state',
    () => new StaleTrashItemError(),
    'gallery.app.deleteStateChanged',
    'item-state-changed',
  ],
  [
    'project references',
    () => new StaleMediaAssetDeletePreviewError(),
    'gallery.app.deleteReferencesChanged',
    'references-changed',
  ],
  [
    'required source',
    () => new PrimaryMediaAssetDeleteError(),
    'gallery.app.deleteRequiredSource',
    'primary-source-required',
  ],
] as const)(
  'explains a changed %s instead of hiding the reason behind a generic failure',
  async (_kind, createError, messageKey, code) => {
    const { controller } = createController();
    const release = vi.fn();
    controller.actions.surface.beginBlockingOperation = vi.fn(() => release);
    await createBusyActionRunner(controller)(
      async () => {
        throw createError();
      },
      { stage: 'permanent-delete', materialType: 'media' }
    );
    expect(controller.state.storage.banner).toBe(translate(messageKey));
    expect(release).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledExactlyOnceWith('gallery-action-failed', {
      code,
      stage: 'permanent-delete',
      materialType: 'media',
    });
  }
);

it.each([
  ['QuotaExceededError', 'storage-quota', 'gallery.storageErrors.quotaErrorBody'],
  ['InvalidStateError', 'storage-database', 'gallery.storageErrors.databaseErrorBody'],
  ['AbortError', 'storage-disk', 'gallery.storageErrors.diskErrorBody'],
] as const)(
  'preserves the owned storage explanation for %s without logging source data',
  async (name, code, messageKey) => {
    const { controller } = createController();
    await createBusyActionRunner(controller)(() =>
      withMediaHubWriteGuard('delete', async () => {
        throw new DOMException('private filename and source URL', name);
      })
    );
    expect(controller.state.storage.banner).toContain(translate(messageKey));
    expect(warn).toHaveBeenCalledExactlyOnceWith('gallery-action-failed', {
      code,
      stage: 'gallery-action',
      materialType: 'unspecified',
    });
  }
);

it('uses a fixed diagnostic for unknown errors and trusts only owned user-facing messages', async () => {
  const { controller } = createController();
  const run = createBusyActionRunner(controller);
  await run(async () => {
    throw new Error('private URL filename ID');
  });
  expect(controller.state.storage.banner).toBe(translate('gallery.app.actionFailed'));
  expect(warn).toHaveBeenLastCalledWith('gallery-action-failed', {
    code: 'unexpected',
    stage: 'gallery-action',
    materialType: 'unspecified',
  });
  await run(async () => {
    throw createGalleryUserFacingActionError('owned explanation');
  });
  expect(controller.state.storage.banner).toBe('owned explanation');
  expect(JSON.stringify(warn.mock.calls)).not.toContain('private');
  expect(JSON.stringify(warn.mock.calls)).not.toContain('owned explanation');
});

it('releases the operation silently on user cancellation and success', async () => {
  const { controller } = createController();
  const release = vi.fn();
  controller.actions.surface.beginBlockingOperation = vi.fn(() => release);
  const run = createBusyActionRunner(controller);
  await run(async () => {
    throw new DOMException('cancel', 'AbortError');
  });
  await run(async () => undefined);
  expect(warn).not.toHaveBeenCalled();
  expect(controller.state.storage.banner).toBeNull();
  expect(release).toHaveBeenCalledTimes(2);
});
