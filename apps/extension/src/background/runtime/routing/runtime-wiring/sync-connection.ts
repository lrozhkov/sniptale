import { configureSyncProductRoute } from '../../../sync-connection/product-route';
import {
  createSyncWorkspaceAllocation,
  loadSyncWorkspaceAllocation,
} from '../../../../composition/persistence/remote-connection/workspace-allocation';
import { createSyncWorkspaceJoin } from '../../../../composition/persistence/remote-connection/workspace-join';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { loadSyncWorkspaceSelection } from '../../../../composition/persistence/remote-connection/workspace-selection';
import { revokeSyncWorkspaceJoin } from '../../../../composition/persistence/remote-connection/workspace-join';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { browserPermissions } from '@sniptale/platform/browser/permissions';
import { createSyncConnectionCoordinator } from '../../../sync-connection/coordinator';
import { createSyncOffscreenGateway } from '../../../sync-connection/offscreen-gateway';
import { createSyncQueueRetryWakeup } from '../../../sync-connection/retry-wakeup';
import { subscribeToChromeEvent } from '@sniptale/platform/browser/callback';
import {
  loadSyncQueueScheduleProgress,
  initializeSyncQueueSchedulePage,
  discoverDueSyncQueueOperations,
  deferDueSyncQueueOperation,
} from '../../../../composition/persistence/sync-capture/queue-schedule';
import { reconcileSyncQueueCaptures } from '../../../../composition/persistence/sync-capture/queue-reconciliation';
import { recoverInterruptedSyncQueueOperation } from '../../../../workflows/sync-transfer/queue';
import {
  loadSyncConnection,
  enrollSyncWorkspaceConnection,
  commandSyncConnection,
} from '../../../../composition/persistence/remote-connection/store';
import { revokeSyncWorkspaceAllocation } from '../../../../composition/persistence/remote-connection/workspace-allocation';
import {
  ensureOffscreenDocument,
  waitForOffscreenReady,
} from '../../../offscreen-document/service';
import { createOffscreenDocumentContextFilter } from '../../../offscreen-document/create-options';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  configureSyncPrivacyErasurePort,
  eraseLocalExtensionDataFromBackground,
} from '../../../application/privacy-erasure/composition';
import { registerSecurityE2EControl } from '../../../../platform/security-e2e-control';
import type { BackgroundModeState } from './shared';

const logger = createLogger({ namespace: 'BackgroundSyncWiring' });
type Coordinator = ReturnType<typeof createSyncConnectionCoordinator>;

function subscribeToPermissionRemoval(sync: Coordinator): void {
  browserPermissions.subscribeToRemoved(() => {
    void (async () => {
      let origin: string | null;
      try {
        const connection = await loadSyncConnection();
        const workspace = connection ? null : await loadSyncWorkspaceSelection();
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
}

function registerSyncQualification(sync: Coordinator, state: BackgroundModeState): void {
  if (typeof __SNIPTALE_SECURITY_E2E__ !== 'undefined' && __SNIPTALE_SECURITY_E2E__) {
    configureSyncProductRoute(sync);
    const retryWakeup = createSyncQueueRetryWakeup({
      loadConnection: loadSyncConnection,
      reconcileCaptures: reconcileSyncQueueCaptures,
      loadProgress: loadSyncQueueScheduleProgress,
      initializePage: initializeSyncQueueSchedulePage,
      discoverDue: discoverDueSyncQueueOperations,
      deferDue: deferDueSyncQueueOperation,
      recoverInterrupted: recoverInterruptedSyncQueueOperation,
      coordinator: sync,
      getAlarm: (name) => chrome.alarms.get(name),
      createAlarm: (name, options) => chrome.alarms.create(name, options),
      subscribeAlarm: (listener) => subscribeToChromeEvent(chrome.alarms?.onAlarm, listener),
      subscribeStartup: (listener) => subscribeToChromeEvent(chrome.runtime?.onStartup, listener),
    });
    void retryWakeup.run();
    registerSecurityE2EControl({
      ...sync,
      start: async (input) => {
        const receipt = await sync.start(input);
        void retryWakeup.run();
        return receipt;
      },
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
}

/** Compose one sync admission, privacy and executor lifetime for this service worker. */
export function initializeSyncConnectionRuntime(state: BackgroundModeState): void {
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
    createWorkspaceSelection: async (input) => {
      if (input.kind === 'allocation') {
        const prior = await loadSyncWorkspaceAllocation();
        const allocation = await createSyncWorkspaceAllocation(
          { parentUrl: input.parentUrl, accountId: input.accountId },
          prior?.phase === 'abandoned' ? prior.identity : null
        );
        return { kind: 'allocation', identity: allocation.identity };
      }
      const join = await createSyncWorkspaceJoin({
        rootUrl: input.rootUrl,
        accountId: input.accountId,
        expected: null,
      });
      return { kind: 'join', identity: join.identity };
    },
    loadConnection: loadSyncConnection,
    loadWorkspace: loadSyncWorkspaceSelection,
    revokeWorkspace: async (source) => {
      if (source.kind === 'allocation')
        await revokeSyncWorkspaceAllocation(source.identity.incarnation);
      else await revokeSyncWorkspaceJoin(source.identity.incarnation);
    },
    enrollConnection: enrollSyncWorkspaceConnection,
    hasOriginPermission: (origin) => browserPermissions.contains({ origins: [origin + '/*'] }),
    revokeConnection: async (identity) => {
      await commandSyncConnection(identity, 'pause');
    },
    createChallenge: () => crypto.randomUUID(),
  });
  configureSyncPrivacyErasurePort({ reserveErasureExclusion: () => sync.reserveErasure() });
  subscribeToPermissionRemoval(sync);
  void sync.inspect().catch(() => logger.warn('Sync executor adoption refused'));
  registerSyncQualification(sync, state);
}
