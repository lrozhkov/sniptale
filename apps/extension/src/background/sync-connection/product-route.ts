import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { parseSyncProductRequest } from '../../contracts/messaging/contracts/runtime/sync-product';
import type {
  SyncProductCommand,
  SyncProductResult,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import { loadSyncWorkspaceSelection } from '../../composition/persistence/remote-connection/workspace-selection';
import {
  classifySettingsPageSenderUrl,
  isGallerySenderUrl,
} from '../runtime/routing/authorization/sender-classification';
import type { createSyncConnectionCoordinator } from './coordinator';

type Coordinator = ReturnType<typeof createSyncConnectionCoordinator>;
let productCoordinator: Coordinator | null = null;
/** Runtime wiring retains the existing sync lifecycle owner, never a second executor. */
export function configureSyncProductRoute(coordinator: Coordinator): void {
  productCoordinator = coordinator;
}
/** Exact product documents receive only their finite verb set. */
export function isSyncProductSenderAllowed(
  command: SyncProductCommand,
  sender: chrome.runtime.MessageSender
): boolean {
  if (sender.frameId !== undefined && sender.frameId !== 0) return false;
  if (sender.documentLifecycle !== undefined && sender.documentLifecycle !== 'active') return false;
  const settings = classifySettingsPageSenderUrl(sender.url) === 'ordinary-settings-page';
  const gallery = isGallerySenderUrl(sender.url);
  if (
    command.kind === 'status' ||
    command.kind === 'inspect' ||
    command.kind === 'cancel' ||
    command.kind === 'catalog-refresh'
  )
    return settings || gallery;
  if (
    command.kind === 'workspace-create' ||
    command.kind === 'workspace-join' ||
    command.kind === 'workspace-retry' ||
    command.kind === 'workspace-enroll' ||
    command.kind === 'workspace-abandon'
  )
    return settings;
  return gallery;
}
async function execute(
  command: SyncProductCommand,
  requestId: string,
  sync: Coordinator,
  sender: chrome.runtime.MessageSender
): Promise<SyncProductResult> {
  if (command.kind === 'status') {
    const [connection, workspace, snapshot] = await Promise.all([
      loadSyncConnection(),
      loadSyncWorkspaceSelection(),
      sync.inspect(),
    ]);
    return {
      kind: 'status',
      status: {
        connection: connection
          ? {
              phase: connection.phase,
              rootUrl: connection.binding.rootUrl,
              accountId: connection.binding.accountId,
            }
          : null,
        workspace: workspace
          ? {
              source: workspace.source,
              phase: workspace.phase,
              rootUrl: workspace.rootUrl,
              accountId: workspace.accountId,
            }
          : null,
        workspaceJob: snapshot?.workspace ?? null,
      },
    };
  }
  if (command.kind === 'workspace-create' || command.kind === 'workspace-join') {
    const source = await sync.planWorkspace(
      command.kind === 'workspace-create'
        ? { kind: 'allocation', parentUrl: command.parentUrl, accountId: command.accountId }
        : { kind: 'join', rootUrl: command.rootUrl, accountId: command.accountId }
    );
    await sync.startWorkspace({ source, authentication: command.authentication, requestId });
    return { kind: 'accepted', requestId };
  }
  if (command.kind === 'workspace-retry') {
    await sync.startWorkspace({
      source: command.source,
      authentication: command.authentication,
      requestId,
    });
    return { kind: 'accepted', requestId };
  }
  if (command.kind === 'workspace-abandon') return sync.abandonWorkspace(command.source);
  if (command.kind === 'workspace-enroll') {
    await sync.enrollWorkspace({ source: command.source, authentication: command.authentication });
    return { kind: 'enrolled' };
  }
  const response = await sync.productCommand(
    command.kind === 'inspect' || command.kind === 'cancel' ? command.requestId : requestId,
    command,
    isGallerySenderUrl(sender.url) ? 'gallery' : 'settings'
  );
  if (!response.success) throw new Error('Sync product command refused');
  return response.result;
}
/** The kernel authorizes first; the owner repeats exact parsing and verb admission before effects. */
export function routeSyncProductCommand(
  input: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender,
  coordinator: Coordinator | null = productCoordinator
): boolean {
  const request = parseSyncProductRequest(input);
  if (!request) return false;
  if (request.type !== MessageType.SYNC_PRODUCT_COMMAND) return false;
  if (!coordinator || !isSyncProductSenderAllowed(request.command, sender)) {
    sendResponse({ success: false, error: 'Sync product command refused' });
    return true;
  }
  void execute(request.command, request.requestId, coordinator, sender).then(
    (result) => sendResponse({ success: true, result }),
    () => sendResponse({ success: false, error: 'Sync product command refused' })
  );
  return true;
}
