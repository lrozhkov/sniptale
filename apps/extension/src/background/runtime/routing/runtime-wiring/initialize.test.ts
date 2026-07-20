import { expect, it, vi } from 'vitest';

const {
  configureDownloadPort,
  configureNativeIngestionPrivacyErasureCleanupPort,
  executeDownloadBlob,
  nativeIngestionCleanupAdapter,
  registerInstallListener,
} = vi.hoisted(() => ({
  configureDownloadPort: vi.fn(),
  configureNativeIngestionPrivacyErasureCleanupPort: vi.fn(),
  executeDownloadBlob: vi.fn(),
  nativeIngestionCleanupAdapter: {},
  registerInstallListener: vi.fn(),
}));

vi.mock('../../../application/privacy-erasure/composition', () => ({
  configureNativeIngestionPrivacyErasureCleanupPort,
  eraseLocalExtensionDataFromBackground: vi.fn(),
}));
vi.mock('../../native-app/privacy-erasure', () => ({
  nativeIngestionPrivacyErasureCleanupAdapter: nativeIngestionCleanupAdapter,
}));
vi.mock('../../../routing-contracts/download-port', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../routing-contracts/download-port')>()),
  configureDownloadPort,
}));
vi.mock('../../../capture/download/download-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture/download/download-router')>()),
  executeDownloadBlob,
}));
vi.mock('./install', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./install')>()),
  registerInstallListener,
}));

import {
  createModeState,
  debuggerDetachListenerRef,
  debuggerEventListenerRef,
  initializeBackgroundContextMenus,
  nativeAppConnect,
  navigationListenerRef,
  registerWebSnapshotViewerPorts,
  removedListenerRef,
  updatedListenerRef,
} from '../../../../../../../tooling/test/support/background-runtime-wiring.test-support';
import { initializeBackgroundRuntime } from './initialize';

it('registers all background listeners through the runtime-wiring owner', () => {
  const state = createModeState();

  initializeBackgroundRuntime(state);

  expect(removedListenerRef.current).toEqual(expect.any(Function));
  expect(updatedListenerRef.current).toEqual(expect.any(Function));
  expect(debuggerEventListenerRef.current).toEqual(expect.any(Function));
  expect(debuggerDetachListenerRef.current).toEqual(expect.any(Function));
  expect(navigationListenerRef.current).toEqual(expect.any(Function));
  expect(configureNativeIngestionPrivacyErasureCleanupPort).toHaveBeenCalledWith(
    nativeIngestionCleanupAdapter
  );
  expect(configureNativeIngestionPrivacyErasureCleanupPort).toHaveBeenCalledBefore(
    nativeAppConnect
  );
  expect(configureDownloadPort).toHaveBeenCalledWith({ executeDownloadBlob });
  expect(configureDownloadPort).toHaveBeenCalledBefore(registerInstallListener);
  expect(registerInstallListener).toHaveBeenCalledBefore(initializeBackgroundContextMenus);
  expect(nativeAppConnect).toHaveBeenCalledTimes(1);
  expect(registerWebSnapshotViewerPorts).toHaveBeenCalledWith(state.webSnapshotViewerPorts);
  expect(initializeBackgroundContextMenus).toHaveBeenCalledWith({
    captureGuardState: state.captureGuardState,
    screenshotModeState: state.screenshotModeState,
    viewportOwnerState: state.viewportOwnerState,
    viewportState: state.viewportState,
  });
});

it('creates a disposable viewer port registry when runtime state omits it', () => {
  const state = createModeState();
  delete (state as Partial<typeof state>).webSnapshotViewerPorts;

  initializeBackgroundRuntime(state);

  expect(registerWebSnapshotViewerPorts).toHaveBeenCalledWith(expect.any(Map));
});
