import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getQuickActionsMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  trackPopupPerfAsyncMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/quick-actions')>()),
  getQuickActions: mocks.getQuickActionsMock,
}));

vi.mock('../../../platform/i18n', () => ({
  AppLocale: undefined,
  DEFAULT_LOCALE: 'en',
  FALLBACK_LOCALE: 'en',
  SUPPORTED_LOCALES: ['en'],
  Translate: undefined,
  TranslationDictionary: undefined,
  TranslationKey: undefined,
  compareStrings: vi.fn(),
  createTranslator: vi.fn(),
  formatDateTime: vi.fn(),
  formatNumber: vi.fn(),
  getCurrentLocale: vi.fn(),
  getDictionary: vi.fn(),
  getStoredLocalePreference: vi.fn(),
  setLocalePreference: vi.fn(),
  subscribeToLocaleChanges: vi.fn(),
  translate: (key: string) => key,
  useAppLocale: vi.fn(),
  usePageLocaleMetadata: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  Logger: undefined,
  createLogger: () => ({
    error: mocks.loggerErrorMock,
  }),
  isTraceEnabled: vi.fn(),
}));

vi.mock('../../diagnostics/performance', () => ({
  finishPopupPerfSpanOnNextFrame: vi.fn(),
  startPopupPerfSpan: vi.fn(),
  trackPopupPerfAsync: mocks.trackPopupPerfAsyncMock,
}));

import { createPopupHomeBootstrapPromises, loadPopupHomeBootstrapData } from './home';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trackPopupPerfAsyncMock.mockImplementation(
    async (_label: string, task: () => Promise<unknown>) => task()
  );
  mocks.getQuickActionsMock.mockResolvedValue([{ id: 'action-1', status: true }]);
});

describe('popup home bootstrap owner', () => {
  it('loads quick-actions data through the home workflow owner', async () => {
    const result = await loadPopupHomeBootstrapData(createPopupHomeBootstrapPromises());

    expect(result).toEqual({
      actions: [{ id: 'action-1', status: true }],
      homeError: null,
    });
    expect(mocks.trackPopupPerfAsyncMock).toHaveBeenCalledWith(
      'popup.bootstrap.quick-actions',
      mocks.getQuickActionsMock
    );
  });

  it('returns advisory fallbacks when quick-actions sources fail', async () => {
    mocks.getQuickActionsMock.mockRejectedValueOnce(new Error('actions failed'));

    const result = await loadPopupHomeBootstrapData(createPopupHomeBootstrapPromises());

    expect(result).toEqual({
      actions: [],
      homeError: 'popup.home.quickActionsLoadError',
    });
    expect(mocks.loggerErrorMock).toHaveBeenCalledWith(
      'Failed to bootstrap quick actions',
      expect.any(Error)
    );
  });
});
