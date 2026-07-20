import { createLogger } from '@sniptale/platform/observability/logger';
import { initializeBackgroundContextMenus } from '../../context-menu/service';
import {
  createWebSnapshotViewerPorts,
  registerWebSnapshotViewerPorts,
} from '../../../capture/lifecycle';
import { initializePageAccessLifecycle } from '../../page-access/lifecycle';
import { nativeIngestionPrivacyErasureCleanupAdapter } from '../../native-app/privacy-erasure';
import { getNativeAppRuntimeService } from '../../native-app/service-singleton';
import { configureNativeIngestionPrivacyErasureCleanupPort } from '../../../application/privacy-erasure/composition';
import { configureDownloadPort } from '../../../routing-contracts/download-port';
import { executeDownloadBlob } from '../../../capture/download/download-router';
import { registerDebuggerListeners } from './debugger';
import { registerInstallListener } from './install';
import { registerNavigationListeners } from './navigation';
import { runStartupMaintenance } from './startup';
import type { BackgroundModeState } from './shared';
import { registerTabLifecycleListeners } from './tab-lifecycle';

const logger = createLogger({ namespace: 'BackgroundRuntimeWiring' });

export function initializeBackgroundRuntime(state: BackgroundModeState): void {
  logger.log('Background service worker loaded');

  configureDownloadPort({ executeDownloadBlob });
  runStartupMaintenance(state, logger);
  registerInstallListener(logger);
  registerTabLifecycleListeners(state, logger);
  registerDebuggerListeners(logger);
  registerNavigationListeners(state);
  initializePageAccessLifecycle(logger);
  configureNativeIngestionPrivacyErasureCleanupPort(nativeIngestionPrivacyErasureCleanupAdapter);
  getNativeAppRuntimeService().connect();
  registerWebSnapshotViewerPorts(state.webSnapshotViewerPorts ?? createWebSnapshotViewerPorts());
  initializeBackgroundContextMenus({
    captureGuardState: state.captureGuardState,
    screenshotModeState: state.screenshotModeState,
    viewportOwnerState: state.viewportOwnerState,
    viewportState: state.viewportState,
  });
}
