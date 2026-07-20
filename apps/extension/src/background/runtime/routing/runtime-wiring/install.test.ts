import { beforeEach, expect, it, vi } from 'vitest';

const { setLocalePreference } = vi.hoisted(() => ({
  setLocalePreference: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  setLocalePreference,
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
  setLocalePreference.mockResolvedValue(undefined);
});

it('ignores install events whose details do not parse', () => {
  registerInstallListener(logger);

  initializeBackgroundRuntimeWiringMocks.installedListenerRef.current?.({ reason: 'ignored' });

  expect(logger.log).not.toHaveBeenCalled();
  expect(setLocalePreference).not.toHaveBeenCalled();
  expect(rebuildBackgroundContextMenus).not.toHaveBeenCalled();
});

it('waits for English persistence before rebuilding first-install menus', async () => {
  const localeWrite = createDeferredLocaleWrite();
  setLocalePreference.mockReturnValueOnce(localeWrite.promise);
  parseInstalledDetails.mockReturnValue({ reason: 'install' });
  registerInstallListener(logger);

  initializeBackgroundRuntimeWiringMocks.installedListenerRef.current?.({ reason: 'install' });

  expect(logger.log).toHaveBeenCalledWith('Extension installed or updated', 'install');
  expect(logger.log).toHaveBeenCalledWith('First installation');
  expect(setLocalePreference).toHaveBeenCalledWith('en');
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
    expect(rebuildBackgroundContextMenus).toHaveBeenCalledTimes(1);
  }
);

it('surfaces a first-install locale initialization failure', async () => {
  setLocalePreference.mockRejectedValueOnce(new Error('locale write failed'));
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
