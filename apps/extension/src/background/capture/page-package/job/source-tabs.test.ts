import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  record: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({ browserTabs: mocks }));
vi.mock('./temporary-tabs-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./temporary-tabs-storage')>()),
  clearTemporaryPagePackageTabs: mocks.clear,
  recordTemporaryPagePackageTab: mocks.record,
  readTemporaryPagePackageTabs: mocks.read,
}));

import {
  cleanupTemporaryPagePackageTabs,
  closeTemporaryPagePackageTabs,
  materializePagePackageCaptureSources,
  reconcileTemporaryPagePackageTabs,
} from './source-tabs';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clear.mockResolvedValue(undefined);
  mocks.record.mockResolvedValue(undefined);
  mocks.read.mockResolvedValue(null);
});

it('passes existing tab sources through without browser mutations', async () => {
  await expect(
    materializePagePackageCaptureSources('job-1', [{ kind: 'tab', tabId: 7, title: 'Existing' }])
  ).resolves.toEqual({
    orderedTabs: [{ tabId: 7, title: 'Existing' }],
    temporaryTabIds: [],
  });
  expect(mocks.create).not.toHaveBeenCalled();
});

it('materializes URL sources as inactive temporary tabs in order', async () => {
  mocks.create.mockResolvedValueOnce({ id: 11 }).mockResolvedValueOnce({ id: 12 });
  await expect(
    materializePagePackageCaptureSources('job-1', [
      { kind: 'url', url: 'https://one.example/' },
      { kind: 'url', url: 'https://two.example/' },
    ])
  ).resolves.toEqual({
    orderedTabs: [
      { tabId: 11, title: 'https://one.example/' },
      { tabId: 12, title: 'https://two.example/' },
    ],
    temporaryTabIds: [11, 12],
  });
  expect(mocks.create).toHaveBeenNthCalledWith(1, { active: false, url: 'https://one.example/' });
  expect(mocks.record).toHaveBeenNthCalledWith(1, 'job-1', 11);
  expect(mocks.record).toHaveBeenNthCalledWith(2, 'job-1', 12);
});

it('closes already-created tabs when later materialization fails', async () => {
  mocks.create.mockResolvedValueOnce({ id: 11 }).mockRejectedValueOnce(new Error('create failed'));
  mocks.get.mockResolvedValue({ id: 11 });
  await expect(
    materializePagePackageCaptureSources('job-1', [
      { kind: 'url', url: 'https://one.example/' },
      { kind: 'url', url: 'https://two.example/' },
    ])
  ).rejects.toThrow('create failed');
  expect(mocks.remove).toHaveBeenCalledWith([11]);
  expect(mocks.clear).toHaveBeenCalledWith('job-1');
});

it('rejects a created tab without an identity and performs bounded cleanup', async () => {
  mocks.create.mockResolvedValue({});
  await expect(
    materializePagePackageCaptureSources('job-1', [{ kind: 'url', url: 'https://one.example/' }])
  ).rejects.toThrow('did not create');
  expect(mocks.remove).not.toHaveBeenCalled();
});

it('rejects mixed source modes', async () => {
  await expect(
    materializePagePackageCaptureSources('job-1', [
      { kind: 'tab', tabId: 7, title: 'Existing' },
      { kind: 'url', url: 'https://one.example/' },
    ])
  ).rejects.toThrow('cannot be mixed');
});

it('ignores tabs already closed by the user during cleanup', async () => {
  mocks.get.mockResolvedValueOnce({ id: 11 }).mockRejectedValueOnce(new Error('missing'));
  await closeTemporaryPagePackageTabs([11, 12]);
  expect(mocks.remove).toHaveBeenCalledWith([11]);
});

it('does not invoke remove when every temporary tab is already gone', async () => {
  mocks.get.mockRejectedValue(new Error('missing'));
  await closeTemporaryPagePackageTabs([11, 12]);
  expect(mocks.remove).not.toHaveBeenCalled();
});

it('clears durable ownership only after the exact tabs have closed', async () => {
  mocks.get.mockResolvedValue({ id: 11 });
  await cleanupTemporaryPagePackageTabs('job-1', [11]);
  expect(mocks.remove).toHaveBeenCalledWith([11]);
  expect(mocks.clear).toHaveBeenCalledWith('job-1');
});

it('closes a created tab when durable acquisition cannot be recorded', async () => {
  mocks.create.mockResolvedValue({ id: 11 });
  mocks.record.mockRejectedValueOnce(new Error('storage failed'));
  mocks.get.mockResolvedValue({ id: 11 });
  await expect(
    materializePagePackageCaptureSources('job-1', [{ kind: 'url', url: 'https://one.example/' }])
  ).rejects.toThrow('storage failed');
  expect(mocks.remove).toHaveBeenCalledWith([11]);
});

it('surfaces partial materialization and cleanup failures together', async () => {
  mocks.create.mockResolvedValueOnce({ id: 11 }).mockRejectedValueOnce(new Error('create failed'));
  mocks.get.mockResolvedValue({ id: 11 });
  mocks.remove.mockRejectedValueOnce(new Error('remove failed'));
  await expect(
    materializePagePackageCaptureSources('job-1', [
      { kind: 'url', url: 'https://one.example/' },
      { kind: 'url', url: 'https://two.example/' },
    ])
  ).rejects.toThrow('temporary-tab cleanup failed');
  expect(mocks.clear).not.toHaveBeenCalled();
});

it('retries exact retained temporary-tab ownership in the same session', async () => {
  mocks.read.mockResolvedValue({ jobId: 'job-1', tabIds: [11] });
  mocks.get.mockResolvedValue({ id: 11 });
  await reconcileTemporaryPagePackageTabs();
  expect(mocks.remove).toHaveBeenCalledWith([11]);
  expect(mocks.clear).toHaveBeenCalledWith('job-1');
});
