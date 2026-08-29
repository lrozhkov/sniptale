import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  available: vi.fn(() => true),
  state: {} as Record<string, unknown>,
}));

vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: vi.fn(async () => ({ ...mocks.state })),
      isAvailable: mocks.available,
      remove: vi.fn(async (key: string) => {
        delete mocks.state[key];
      }),
      set: vi.fn(async (values: Record<string, unknown>) => Object.assign(mocks.state, values)),
    },
  },
}));

import {
  PAGE_PACKAGE_TEMPORARY_TABS_STORAGE_KEY,
  clearTemporaryPagePackageTabs,
  readTemporaryPagePackageTabs,
  recordTemporaryPagePackageTab,
} from './temporary-tabs-storage';

beforeEach(() => {
  mocks.state = {};
  mocks.available.mockReturnValue(true);
});

it('journals exact acquired tab identities incrementally and clears only the owning job', async () => {
  await recordTemporaryPagePackageTab('job-1', 11);
  await recordTemporaryPagePackageTab('job-1', 12);
  await recordTemporaryPagePackageTab('job-1', 12);
  await expect(readTemporaryPagePackageTabs()).resolves.toEqual({
    jobId: 'job-1',
    schemaVersion: 1,
    tabIds: [11, 12],
  });
  await clearTemporaryPagePackageTabs('other-job');
  expect(mocks.state[PAGE_PACKAGE_TEMPORARY_TABS_STORAGE_KEY]).toBeDefined();
  await clearTemporaryPagePackageTabs('job-1');
  await expect(readTemporaryPagePackageTabs()).resolves.toBeNull();
});

it('rejects another owner and fails closed when session storage is unavailable', async () => {
  await recordTemporaryPagePackageTab('job-1', 11);
  await expect(recordTemporaryPagePackageTab('job-2', 12)).rejects.toThrow('still owns');
  mocks.available.mockReturnValue(false);
  await expect(recordTemporaryPagePackageTab('job-1', 12)).rejects.toThrow('unavailable');
});

it('fails closed for malformed or duplicate identities from storage', async () => {
  mocks.state[PAGE_PACKAGE_TEMPORARY_TABS_STORAGE_KEY] = {
    jobId: 'job-1',
    schemaVersion: 1,
    tabIds: [11, 11],
  };
  await expect(readTemporaryPagePackageTabs()).rejects.toThrow('ownership is invalid');
});
