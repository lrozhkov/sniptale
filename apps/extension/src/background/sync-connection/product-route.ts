import { SyncLocalOnlyError } from '../../composition/persistence/remote-connection/local-only';
import { readNativeCacheStatus } from '../../workflows/sync-transfer/native-cache-policy';
import {
  readNativeCacheRootStatus,
  setNativeCacheBudget,
  setNativeCacheRootPinned,
} from '../../workflows/sync-transfer/native-cache';
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
  isImageEditorSenderUrl,
  isScenarioEditorSenderUrl,
} from '../../platform/navigation/extension-pages/sender-url';
import { isOwnedExtensionPagePath } from '../../platform/navigation/extension-pages/sender-url';
import type { createSyncConnectionCoordinator } from './coordinator';

type Coordinator = ReturnType<typeof createSyncConnectionCoordinator>;
let productCoordinator: Coordinator | null = null;
let enrollmentWakeup: (() => void) | undefined;
/** Runtime wiring retains the existing sync lifecycle owner, never a second executor. */
export function configureSyncProductRoute(coordinator: Coordinator, onEnrolled?: () => void): void {
  productCoordinator = coordinator;
  enrollmentWakeup = onEnrolled;
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
  const editor =
    isImageEditorSenderUrl(sender.url) ||
    isScenarioEditorSenderUrl(sender.url) ||
    isOwnedExtensionPagePath(sender.url, 'apps/extension/src/video-editor/index.html');
  if (command.kind === 'connection-local-only') return settings;
  if (command.kind === 'replica-prepare')
    return gallery || (settings && command.preserveNative === true);
  if (command.kind === 'cache-status') return settings || gallery;
  if (command.kind === 'cache-budget' || command.kind === 'cache-trim') return settings;
  if (
    command.kind === 'cache-root-status' ||
    command.kind === 'cache-pin' ||
    command.kind === 'native-release'
  )
    return gallery;
  if (command.kind === 'backup-prepare') return settings || gallery || editor;
  if (command.kind === 'native-prepare') return gallery || editor;
  if (editor) return command.kind === 'inspect' || command.kind === 'cancel';
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
  if (command.kind === 'connection-local-only') {
    try {
      const history = await sync.localOnly(command.expected);
      return { kind: 'local-only', history };
    } catch (error) {
      if (error instanceof SyncLocalOnlyError)
        return { kind: 'local-only-refused', code: error.code };
      throw error;
    }
  }
  if (command.kind === 'cache-status')
    return { kind: 'cache-status', status: await readNativeCacheStatus() };
  if (command.kind === 'cache-budget') {
    const settings = await setNativeCacheBudget(command.budgetBytes, command.revision);
    return { kind: 'cache-budget', budgetBytes: settings.budgetBytes, revision: settings.revision };
  }
  if (command.kind === 'cache-root-status')
    return { kind: 'cache-root', status: await readNativeCacheRootStatus(command.root) };
  if (command.kind === 'cache-pin') {
    await setNativeCacheRootPinned(command.root, command.pinned);
    const status = await readNativeCacheRootStatus(command.root);
    if (!command.pinned || status.ready) return { kind: 'cache-root', status };
    const response = await sync.productCommand(
      requestId,
      { kind: 'native-prepare', root: command.root },
      'gallery'
    );
    if (!response.success) throw new Error('Sync product command refused');
    return response.result;
  }
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
        products: connection
          ? (snapshot?.products ?? []).filter(
              (job) => job.kind !== 'thumbnail-read' && job.kind !== 'automatic-sync'
            )
          : [],
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
    if (sync === productCoordinator) {
      try {
        enrollmentWakeup?.();
      } catch {
        /* The committed connection survives a missed wakeup. */
      }
    }
    return { kind: 'enrolled' };
  }
  const response = await sync.productCommand(
    command.kind === 'inspect' || command.kind === 'cancel' ? command.requestId : requestId,
    command,
    classifySettingsPageSenderUrl(sender.url) === 'ordinary-settings-page' ? 'settings' : 'gallery'
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
