import { registerPageRecoveryPorts } from '../../../page-recovery/ports';
import { createAudioJobService } from '../../../ai/audio/service';
import { registerAudioJobPorts } from '../../../ai/audio/port';
import { createContentTextJobService } from '../../../ai/llm/content-text-job';
import { registerContentTextPorts } from '../../../ai/llm/content-text-port';
import { createReviewTextJobService } from '../../../ai/llm/review-text-job';
import { registerReviewTextPorts } from '../../../ai/llm/review-text-port';
import { createLogger } from '@sniptale/platform/observability/logger';
import { initializeBackgroundContextMenus } from '../../context-menu/service';
import {
  createWebSnapshotViewerPorts,
  registerWebSnapshotViewerPorts,
} from '../../../capture/lifecycle';
import { initializePageAccessLifecycle } from '../../../page-access/lifecycle';
import { nativeIngestionPrivacyErasureCleanupAdapter } from '../../native-app/privacy-erasure';
import { getNativeAppRuntimeService } from '../../native-app/service-singleton';
import { initializeNativeAppPermissionLifecycle } from '../../native-app/permission-lifecycle';
import {
  configureNativeIngestionPrivacyErasureCleanupPort,
  configureAudioJobPrivacyErasurePort,
  configureScreenshotPrivacyErasureCleanupPort,
} from '../../../application/privacy-erasure/composition';
import { configureDownloadPort } from '../../../routing-contracts/download-port';
import { executeDownloadBlob } from '../../../capture/download/download-router';
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
import { registerExtensionCommandListener } from '../../commands';
import { registerSecurityE2EControl } from '../../../../platform/security-e2e-control';
import { subscribeToLocaleChanges } from '../../../../platform/i18n';

const logger = createLogger({ namespace: 'BackgroundRuntimeWiring' });

export function initializeBackgroundRuntime(state: BackgroundModeState): void {
  logger.log('Background service worker loaded');

  // The service worker has no localStorage paint hint, so keep its translation state hydrated.
  subscribeToLocaleChanges(() => undefined);
  const audioJobs = createAudioJobService();
  const textJobs = createReviewTextJobService();
  const contentTextJobs = createContentTextJobService();
  configureAudioJobPrivacyErasurePort(audioJobs, textJobs, contentTextJobs);
  registerAudioJobPorts(audioJobs);
  registerReviewTextPorts(textJobs);
  registerContentTextPorts(contentTextJobs);
  configureDownloadPort({ executeDownloadBlob });
  runStartupMaintenance(state, logger);
  registerInstallListener(logger);
  registerTabLifecycleListeners(state, logger);
  registerNavigationListeners(state);
  registerWindowBoundsListener();
  registerVoiceInputPorts();
  registerVoiceInputTelemetryPorts();
  registerAggregateEditorPresencePorts();
  registerPageRecoveryPorts();
  registerExtensionCommandListener(state);
  if (typeof __SNIPTALE_SECURITY_E2E__ !== 'undefined' && __SNIPTALE_SECURITY_E2E__) {
    registerSecurityE2EControl();
  }
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
  initializeNativeAppPermissionLifecycle(getNativeAppRuntimeService());
  registerWebSnapshotViewerPorts(state.webSnapshotViewerPorts ?? createWebSnapshotViewerPorts());
  initializeBackgroundContextMenus({
    captureGuardState: state.captureGuardState,
    screenshotModeState: state.screenshotModeState,
    viewportOwnerState: state.viewportOwnerState,
    viewportState: state.viewportState,
  });
}
