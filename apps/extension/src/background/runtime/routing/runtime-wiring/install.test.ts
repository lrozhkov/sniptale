import { beforeEach, expect, it, vi } from 'vitest';

const { setLocalePreference, initializeLocalePreference, presentWelcomeOnce } = vi.hoisted(() => ({
  presentWelcomeOnce: vi.fn().mockResolvedValue(true),
  setLocalePreference: vi.fn().mockResolvedValue(undefined),
  initializeLocalePreference: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../storage/onboarding', () => ({ presentWelcomeOnce }));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  setLocalePreference,
  initializeLocalePreference,
}));

import {
  flushMicrotasks,
  initializeBackgroundRuntimeWiringMocks,
  parseInstalledDetails,
  rebuildBackgroundContextMenus,
} from '../../../../../../../tooling/test/support/background-runtime-wiring.test-support';
import { registerInstallListener } from './install';

const logger = {
  log: vi.fn(),
  warn: vi.fn(),
};

function createDeferredLocaleWrite() {
  let resolve: (() => void) | null = null;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve: () => resolve?.(),
  };
}

beforeEach(() => {
  presentWelcomeOnce.mockReset().mockResolvedValue(true);
  setLocalePreference.mockResolvedValue(undefined);
  initializeLocalePreference.mockResolvedValue(undefined);
});

it('ignores install events whose details do not parse', () => {
  registerInstallListener(logger);

  initializeBackgroundRuntimeWiringMocks.installedListenerRef.current?.({ reason: 'ignored' });

  expect(logger.log).not.toHaveBeenCalled();
  expect(setLocalePreference).not.toHaveBeenCalled();
  expect(rebuildBackgroundContextMenus).not.toHaveBeenCalled();
});

it('waits for conditional locale initialization before rebuilding first-install menus', async () => {
  const localeWrite = createDeferredLocaleWrite();
  initializeLocalePreference.mockReturnValueOnce(localeWrite.promise);
  parseInstalledDetails.mockReturnValue({ reason: 'install' });
  registerInstallListener(logger);

  initializeBackgroundRuntimeWiringMocks.installedListenerRef.current?.({ reason: 'install' });

  expect(logger.log).toHaveBeenCalledWith('Extension installed or updated', 'install');
  expect(logger.log).toHaveBeenCalledWith('First installation');
  expect(initializeLocalePreference).toHaveBeenCalledWith();
  expect(rebuildBackgroundContextMenus).not.toHaveBeenCalled();

  localeWrite.resolve();
  await flushMicrotasks();

  expect(rebuildBackgroundContextMenus).toHaveBeenCalledTimes(1);
});

it.each(['update', 'chrome_update', 'shared_module_update'] as const)(
  'preserves the locale preference for %s events',
  (reason) => {
    parseInstalledDetails.mockReturnValue({ reason });
    registerInstallListener(logger);

    initializeBackgroundRuntimeWiringMocks.installedListenerRef.current?.({ reason });

    expect(setLocalePreference).not.toHaveBeenCalled();
    expect(presentWelcomeOnce).not.toHaveBeenCalled();
    expect(rebuildBackgroundContextMenus).toHaveBeenCalledTimes(1);
  }
);

it('surfaces a first-install locale initialization failure', async () => {
  initializeLocalePreference.mockRejectedValueOnce(new Error('locale write failed'));
  parseInstalledDetails.mockReturnValue({ reason: 'install' });
  registerInstallListener(logger);

  initializeBackgroundRuntimeWiringMocks.installedListenerRef.current?.({ reason: 'install' });
  await flushMicrotasks();

  expect(logger.warn).toHaveBeenCalledWith(
    'Failed to initialize first-install locale',
    expect.objectContaining({ message: 'locale write failed' })
  );
  expect(rebuildBackgroundContextMenus).toHaveBeenCalledTimes(1);
});

it('surfaces a first-install context-menu rebuild failure', async () => {
  rebuildBackgroundContextMenus.mockRejectedValueOnce(new Error('menu rebuild failed'));
  parseInstalledDetails.mockReturnValue({ reason: 'install' });
  registerInstallListener(logger);

  initializeBackgroundRuntimeWiringMocks.installedListenerRef.current?.({ reason: 'install' });
  await flushMicrotasks();

  expect(logger.warn).toHaveBeenCalledWith(
    'Failed to rebuild context menus after install/update',
    expect.objectContaining({ message: 'menu rebuild failed' })
  );
});

it('does not replace a locale selected before the first-install callback', async () => {
  let storedLocale = 'ru';
  setLocalePreference.mockImplementationOnce(async (locale: string) => {
    storedLocale = locale;
  });
  parseInstalledDetails.mockReturnValue({ reason: 'install' });
  registerInstallListener(logger);

  initializeBackgroundRuntimeWiringMocks.installedListenerRef.current?.({ reason: 'install' });
  await flushMicrotasks();

  expect(storedLocale).toBe('ru');
  expect(setLocalePreference).not.toHaveBeenCalled();
  expect(initializeLocalePreference).toHaveBeenCalledOnce();
});

it('opens welcome before locale initialization and preserves menus on failure', async () => {
  const localeWrite = createDeferredLocaleWrite();
  initializeLocalePreference.mockReturnValueOnce(localeWrite.promise);
  presentWelcomeOnce.mockRejectedValueOnce(new Error('storage-unavailable'));
  parseInstalledDetails.mockReturnValue({ reason: 'install' });
  registerInstallListener(logger);
  initializeBackgroundRuntimeWiringMocks.installedListenerRef.current?.({ reason: 'install' });
  expect(presentWelcomeOnce).toHaveBeenCalledOnce();
  localeWrite.resolve();
  await flushMicrotasks();
  expect(presentWelcomeOnce).toHaveBeenCalledOnce();
  expect(logger.warn).toHaveBeenCalledWith('Failed to open first-install welcome');
  expect(rebuildBackgroundContextMenus).toHaveBeenCalledOnce();
});

it('admits welcome before delayed locale initialization so erasure cannot be followed by a late marker', async () => {
  const { presentWelcomeOnce: present } = await vi.importActual<
    typeof import('../../../storage/onboarding')
  >('../../../storage/onboarding');
  const { installPersistenceLockManagerForTests, runWithPersistentDataErasureBarrier } =
    await import('../../../../composition/persistence/infrastructure/mutation-barrier');
  vi.stubGlobal('navigator', {});
  installPersistenceLockManagerForTests(null);
  try {
    const localeWrite = createDeferredLocaleWrite();
    initializeLocalePreference.mockReturnValueOnce(localeWrite.promise);
    let shown = false;
    const open = vi.fn(async () => undefined);
    let presentation: Promise<boolean> | undefined;
    presentWelcomeOnce.mockImplementationOnce(() => {
      presentation = present({
        read: async () => shown,
        mark: async () => {
          shown = true;
        },
        clear: async () => {
          shown = false;
        },
        open,
      });
      return presentation;
    });
    parseInstalledDetails.mockReturnValue({ reason: 'install' });
    registerInstallListener(logger);
    vi.stubGlobal('chrome', undefined);
    initializeBackgroundRuntimeWiringMocks.installedListenerRef.current?.({ reason: 'install' });
    expect(presentWelcomeOnce).toHaveBeenCalledOnce();
    await presentation;
    expect(shown).toBe(true);
    await runWithPersistentDataErasureBarrier(async () => {
      shown = false;
    });
    localeWrite.resolve();
    await flushMicrotasks();
    expect(shown).toBe(false);
    expect(open).toHaveBeenCalledOnce();
    expect(presentWelcomeOnce).toHaveBeenCalledOnce();
    expect(rebuildBackgroundContextMenus).toHaveBeenCalledOnce();
  } finally {
    installPersistenceLockManagerForTests(null);
    vi.unstubAllGlobals();
  }
});
