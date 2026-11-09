import { SyncRemoteError } from '../workflows/sync-transfer/remote-store';
import { readSecretProtectionControl } from '../composition/persistence/secret-protection/transition.store';
import type { SyncCredentialLease } from '../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { createPublishedOutgoingRetirement } from '../workflows/sync-transfer/outgoing-retirement';
import { createAutomaticCatalogSync } from '../workflows/sync-transfer/automatic';
import { createMediaHubEventPublisher } from '../features/media-hub/events';
import { createSyncProductExecution } from './sync-connection/product-execution';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { publishSyncProductSettled } from '../platform/runtime-messaging/sync-product-client';
import { createRuntimeMessagingTransport } from '../platform/runtime-messaging';
import { createSyncConnectionExecutor } from './sync-connection/executor';
import {
  createSyncQueueExecution,
  createSyncWorkspaceExecution,
} from './sync-connection/execution';
import { registerOffscreenSyncMessageListener } from './sync-connection/runtime';
import { bootstrapOffscreenDocument } from './runtime/bootstrap';
import { registerOffscreenRuntimeMessageListener } from './runtime';
import { getCurrentLocale, translate } from '../platform/i18n';
import { registerOffscreenVoiceInputMessageListener } from './voice-input/runtime';
import '@sniptale/ui/styles';
import '../features/highlighter/frame-annotation/callout/font.css';

function applyOffscreenDocumentMetadata(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const locale = getCurrentLocale();
  const statusText = document.getElementById('statusText');

  document.documentElement.lang = locale;
  document.title = translate('background.runtime.offscreenDocumentTitle', locale);

  if (statusText) {
    statusText.textContent = translate('popup.labels.statusReady', locale);
  }
}

applyOffscreenDocumentMetadata();
registerOffscreenRuntimeMessageListener();
registerOffscreenVoiceInputMessageListener();
const offscreenUrl = new URL(globalThis.location.href);
const offscreenStartupId = offscreenUrl.searchParams.get('offscreenStartupId');
if (offscreenStartupId && offscreenUrl.searchParams.get('privacyErasure') !== '1') {
  const messaging = createRuntimeMessagingTransport();
  const libraryEvents = createMediaHubEventPublisher();
  const automatic = createAutomaticCatalogSync();
  const retirement = createPublishedOutgoingRetirement();
  globalThis.addEventListener('pagehide', () => libraryEvents.dispose(), { once: true });
  function credentialAccess(credentialLease: SyncCredentialLease | undefined) {
    return {
      async resolveAuthentication() {
        if (!credentialLease) throw new Error('Sync credential query refused');
        const response = await messaging.sendRuntimeMessage({
          type: MessageType.SYNC_CONNECTION_CREDENTIAL,
          requestId: crypto.randomUUID(),
          credentialLease,
        });
        if (response.success === false && response.error === 'secrets-locked')
          throw new SyncRemoteError('secrets-locked');
        if (
          response.success !== true ||
          response.credentialLease.leaseId !== credentialLease.leaseId ||
          response.credentialLease.workerEpoch !== credentialLease.workerEpoch ||
          response.credentialLease.protectionEpoch !== credentialLease.protectionEpoch ||
          response.credentialLease.offscreenStartupId !== credentialLease.offscreenStartupId ||
          response.credentialLease.executorId !== credentialLease.executorId ||
          response.credentialLease.credentialId !== credentialLease.credentialId ||
          response.credentialLease.authorization.incarnation !==
            credentialLease.authorization.incarnation ||
          response.credentialLease.authorization.revision !== credentialLease.authorization.revision
        )
          throw new Error('Sync credential query refused');
        return response.authentication;
      },
      async checkProtection() {
        if (!credentialLease) return false;
        const control = await readSecretProtectionControl();
        return control.phase === 'stable' && control.epoch === credentialLease.protectionEpoch;
      },
    };
  }
  const executor = createSyncConnectionExecutor({
    onSettled: publishSyncProductSettled,
    executorId: crypto.randomUUID(),
    offscreenStartupId,
    createWorkspaceExecution: (input) => {
      const selectionIncarnation = input.source.identity.incarnation;
      const sourceKind = input.source.kind;
      return createSyncWorkspaceExecution(input, async (origin) => {
        const response = await messaging.sendRuntimeMessage({
          type: MessageType.SYNC_WORKSPACE_ORIGIN_PERMISSION,
          requestId: crypto.randomUUID(),
          sourceKind,
          selectionIncarnation,
          origin,
        });
        return response.success === true && response.allowed === true;
      });
    },
    createProductExecution: (input) =>
      createSyncProductExecution(
        input,
        async (origin) => {
          const response = await messaging.sendRuntimeMessage({
            type: MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION,
            requestId: crypto.randomUUID(),
            authorization: input.authorization,
            ...(input.credentialLease ? { credentialLease: input.credentialLease } : {}),
            ...(input.work.kind === 'thumbnail-read' ? { advisory: true as const } : {}),
            origin,
          });
          if (response.success === true && response.reason === 'secrets-locked')
            throw new SyncRemoteError('secrets-locked');
          return response.success === true && response.allowed === true;
        },
        () => libraryEvents.publishLibraryChanged('sync', []),
        (operationId) => publishSyncProductSettled(operationId, 'queue'),
        automatic,
        retirement,
        credentialAccess(input.credentialLease)
      ),
    createExecution: (input) =>
      createSyncQueueExecution(
        input,
        async (origin) => {
          const response = await messaging.sendRuntimeMessage({
            type: MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION,
            requestId: crypto.randomUUID(),
            authorization: input.authorization,
            ...(input.credentialLease ? { credentialLease: input.credentialLease } : {}),
            origin,
          });
          if (response.success === true && response.reason === 'secrets-locked')
            throw new SyncRemoteError('secrets-locked');
          return response.success === true && response.allowed === true;
        },
        credentialAccess(input.credentialLease)
      ),
  });
  registerOffscreenSyncMessageListener(executor);
}
bootstrapOffscreenDocument();
