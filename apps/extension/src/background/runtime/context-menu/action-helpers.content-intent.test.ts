import { beforeEach, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';

const mocks = vi.hoisted(() => ({
  loadPopupExportPreferences: vi.fn(),
  requestPermission: vi.fn(),
  sendTabMessage: vi.fn(),
  startPagePackageJob: vi.fn(),
  tabsGet: vi.fn(),
  translate: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: mocks.translate,
}));

vi.mock('../../../composition/persistence/popup-export-preferences', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/popup-export-preferences')
  >()),
  loadPopupExportPreferences: mocks.loadPopupExportPreferences,
}));

vi.mock('../../capture/page-package/job', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture/page-package/job')>()),
  startPagePackageJob: mocks.startPagePackageJob,
}));

vi.mock('@sniptale/platform/browser/permissions', () => ({
  browserPermissions: { request: mocks.requestPermission },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: mocks.tabsGet },
}));

import { startContextMenuExport } from './action-helpers';
import { contextMenuPopupExportPreferencesFixture } from './test-fixtures';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadPopupExportPreferences.mockResolvedValue({
    ...contextMenuPopupExportPreferencesFixture,
    includeFullPageScreenshot: true,
  });
  mocks.requestPermission.mockResolvedValue(false);
  mocks.sendTabMessage.mockResolvedValue({ success: true });
  mocks.startPagePackageJob.mockResolvedValue({ phase: 'running' });
  mocks.tabsGet.mockResolvedValue({ id: 15, title: 'Example tab' });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: mocks.sendTabMessage });
});

it('starts a screenshot-free job with one warning when all-sites access is denied', async () => {
  await startContextMenuExport(15);

  expect(mocks.requestPermission).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
  expect(mocks.startPagePackageJob).toHaveBeenCalledWith({
    contentPort: expect.objectContaining({
      cancelPagePackage: expect.any(Function),
      requestPagePackage: expect.any(Function),
    }),
    includeWebCopy: false,
    intent: 'export',
    jobId: expect.any(String),
    orderedTabs: [{ tabId: 15, title: 'Example tab' }],
    options: expect.objectContaining({ includeFullPageScreenshot: false }),
    warnings: ['popup.export.screenshotPermissionDeniedWarning'],
  });
});
