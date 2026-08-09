import { createLogger } from '@sniptale/platform/observability/logger';
import { initializeBackgroundContextMenus } from '../../context-menu/service';
import {
  createWebSnapshotViewerPorts,
  registerWebSnapshotViewerPorts,
} from '../../../capture/lifecycle';
import { initializePageAccessLifecycle } from '../../page-access/lifecycle';
import { nativeIngestionPrivacyErasureCleanupAdapter } from '../../native-app/privacy-erasure';
import { getNativeAppRuntimeService } from '../../native-app/service-singleton';
import {
  configureNativeIngestionPrivacyErasureCleanupPort,
  configureScreenshotPrivacyErasureCleanupPort,
} from '../../../application/privacy-erasure/composition';
import { configureDownloadPort } from '../../../routing-contracts/download-port';
import { executeDownloadBlob } from '../../../capture/download/download-router';
import { registerDebuggerListeners } from './debugger';
import { registerInstallListener } from './install';
import { registerNavigationListeners } from './navigation';
import { runStartupMaintenance } from './startup';
import type { BackgroundModeState } from './shared';
import { registerTabLifecycleListeners } from './tab-lifecycle';
import { disableScreenshotMode } from '../../tab-mode-router-screenshot';
import { registerWindowBoundsListener } from './window-bounds';
import { registerVoiceInputPorts } from '../../../voice-input/coordinator';
import { registerVoiceInputTelemetryPorts } from '../../../voice-input/telemetry-port';
import { registerAggregateEditorPresencePorts } from '../../../application/aggregate-promotion/ports';

const logger = createLogger({ namespace: 'BackgroundRuntimeWiring' });

export function initializeBackgroundRuntime(state: BackgroundModeState): void {
  logger.log('Background service worker loaded');

  configureDownloadPort({ executeDownloadBlob });
  runStartupMaintenance(state, logger);
  registerInstallListener(logger);
  registerTabLifecycleListeners(state, logger);
  registerDebuggerListeners(logger, state);
  registerNavigationListeners(state);
  registerWindowBoundsListener();
  registerVoiceInputPorts();
  registerVoiceInputTelemetryPorts();
  registerAggregateEditorPresencePorts();
  initializePageAccessLifecycle(logger);
  configureScreenshotPrivacyErasureCleanupPort({
    disableScreenshotMode: (tabId, runtimeState) =>
      disableScreenshotMode(
        tabId,
        runtimeState.screenshotModeState,
        runtimeState.viewportState,
        runtimeState.viewportOwnerState,
        runtimeState.webSnapshotViewerPorts
      ),
  });
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
