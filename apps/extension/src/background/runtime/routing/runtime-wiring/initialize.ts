import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { browserPermissions } from '@sniptale/platform/browser/permissions';
import { createSyncConnectionCoordinator } from '../../../sync-connection/coordinator';
import { createSyncOffscreenGateway } from '../../../sync-connection/offscreen-gateway';
import {
  loadSyncConnection,
  commandSyncConnection,
} from '../../../../composition/persistence/remote-connection/store';
import {
  loadSyncWorkspaceAllocation,
  revokeSyncWorkspaceAllocation,
} from '../../../../composition/persistence/remote-connection/workspace-allocation';
import {
  ensureOffscreenDocument,
  waitForOffscreenReady,
} from '../../../offscreen-document/service';
import { createOffscreenDocumentContextFilter } from '../../../offscreen-document/create-options';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
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
  configureSyncPrivacyErasurePort,
  eraseLocalExtensionDataFromBackground,
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
  const syncGateway = createSyncOffscreenGateway({
    ensureDocument: () => ensureOffscreenDocument('Transfer user-selected sync files'),
    waitForReady: () => waitForOffscreenReady(),
    getDocumentUrls: async () => {
      const contexts = await browserRuntime.getContexts(createOffscreenDocumentContextFilter());
      return contexts.map((context) => {
        if (typeof context.documentUrl !== 'string')
          throw new Error('Sync document identity unavailable');
        return context.documentUrl;
      });
    },
    send: (message) => getBackgroundRuntimeMessaging().sendRuntimeMessage(message),
    createRequestId: () => crypto.randomUUID(),
  });
  const sync = createSyncConnectionCoordinator({
    ...syncGateway,
    loadConnection: loadSyncConnection,
    loadWorkspace: loadSyncWorkspaceAllocation,
    revokeWorkspace: async (incarnation) => {
      await revokeSyncWorkspaceAllocation(incarnation);
    },
    revokeConnection: async (identity) => {
      await commandSyncConnection(identity, 'pause');
    },
    createChallenge: () => crypto.randomUUID(),
  });
  configureSyncPrivacyErasurePort({ reserveErasureExclusion: () => sync.reserveErasure() });
  browserPermissions.subscribeToRemoved(() => {
    void (async () => {
      let origin: string | null;
      try {
        const connection = await loadSyncConnection();
        const workspace = connection ? null : await loadSyncWorkspaceAllocation();
        const rootUrl = connection?.binding.rootUrl ?? workspace?.rootUrl;
        origin = rootUrl ? new URL(rootUrl).origin : null;
        if (origin && (await browserPermissions.contains({ origins: [origin + '/*'] }))) return;
      } catch {
        // Unreadable authority cannot establish that a surviving executor is still admitted.
        const reservation = sync.reserveErasure();
        try {
          await reservation.quiesce();
        } finally {
          reservation.release();
        }
        throw new Error('Sync permission authority unavailable');
      }
      await sync.permissionsRemoved((candidate) => origin === null || candidate === origin);
    })().catch(() => logger.warn('Sync permission revocation failed'));
  });
  void sync.inspect().catch(() => logger.warn('Sync executor adoption refused'));

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
    registerSecurityE2EControl({
      ...sync,
      erase: async () =>
        (
          await eraseLocalExtensionDataFromBackground(
            {
              type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
              includeAiProviderSecrets: true,
              preservePreferences: false,
            },
            state
          )
        ).success,
    });
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
