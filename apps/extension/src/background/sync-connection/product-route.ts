import {
  readSyncCheckpointInterval,
  requestSyncCheckpointFlush,
  requestSyncCheckpointExit,
  updateSyncCheckpointInterval,
} from '../../composition/persistence/sync-capture/checkpoint-commands';
import { SecretProtectionLockedError } from '../../composition/persistence/secret-protection/model';
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
  SyncPopupRuntimeStatus,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import { loadSyncWorkspaceSelection } from '../../composition/persistence/remote-connection/workspace-selection';
import {
  classifySettingsPageSenderUrl,
  isGallerySenderUrl,
  isImageEditorSenderUrl,
  isScenarioEditorSenderUrl,
  isCanonicalPopupSenderUrl,
} from '../../platform/navigation/extension-pages/sender-url';
import { isOwnedExtensionPagePath } from '../../platform/navigation/extension-pages/sender-url';
import type { createSyncConnectionCoordinator } from './coordinator';

type Coordinator = ReturnType<typeof createSyncConnectionCoordinator>;
let productCoordinator: Coordinator | null = null;
let enrollmentWakeup: (() => void) | undefined;
let runtimeStatusReader: (() => Promise<SyncPopupRuntimeStatus>) | undefined;
/** Runtime wiring retains the existing sync lifecycle owner, never a second executor. */
export function configureSyncProductRoute(
  coordinator: Coordinator,
  onEnrolled?: () => void,
  readRuntimeStatus?: () => Promise<SyncPopupRuntimeStatus>
): void {
  productCoordinator = coordinator;
  enrollmentWakeup = onEnrolled;
  runtimeStatusReader = readRuntimeStatus;
}
function wakeSyncQueue(): void {
  try {
    enrollmentWakeup?.();
  } catch {
    // The durable command survives a missed wakeup; the normal alarm can resume it.
  }
}
/** Exact product documents receive only their finite verb set. */
export function isSyncProductSenderAllowed(
  command: SyncProductCommand,
  sender: chrome.runtime.MessageSender
): boolean {
  if (sender.frameId !== undefined && sender.frameId !== 0) return false;
  if (sender.documentLifecycle !== undefined && sender.documentLifecycle !== 'active') return false;
  if (isCanonicalPopupSenderUrl(sender.url)) {
    return (
      sender.id === globalThis.chrome?.runtime?.id &&
      !!sender.id &&
      !sender.tab &&
      (command.kind === 'runtime-status' || command.kind === 'checkpoint-flush')
    );
  }
  if (command.kind === 'runtime-status') return false;
  const settings = classifySettingsPageSenderUrl(sender.url) === 'ordinary-settings-page';
  const gallery = isGallerySenderUrl(sender.url);
  const editor =
    isImageEditorSenderUrl(sender.url) ||
    isScenarioEditorSenderUrl(sender.url) ||
    isOwnedExtensionPagePath(sender.url, 'apps/extension/src/video-editor/index.html');
  if (command.kind === 'checkpoint-exit') {
    if (sender.frameId !== 0) return false;
    const kind = command.receipt.rootKind;
    if (isImageEditorSenderUrl(sender.url)) return kind === 'media';
    if (isScenarioEditorSenderUrl(sender.url)) return kind === 'scenario-project';
    if (isOwnedExtensionPagePath(sender.url, 'apps/extension/src/video-editor/index.html'))
      return kind === 'video-project';
    return gallery && (kind === 'video-review' || kind === 'media');
  }
  if (command.kind === 'checkpoint-wake')
    return sender.frameId === 0 && (settings || gallery || editor);
  if (
    command.kind === 'connection-resume' ||
    command.kind === 'connection-authentication' ||
    command.kind === 'connection-local-only' ||
    command.kind === 'checkpoint-interval' ||
    command.kind === 'checkpoint-policy' ||
    command.kind === 'checkpoint-flush'
  )
    return settings;
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
  if (command.kind === 'scenario-export-prepare' || command.kind === 'library-backup-prepare')
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
    command.kind === 'workspace-discover' ||
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
  if (command.kind === 'runtime-status') {
    if (!runtimeStatusReader || sync !== productCoordinator)
      throw new Error('Sync runtime status unavailable');
    const read = runtimeStatusReader;
    const status = await read();
    if (sync !== productCoordinator || read !== runtimeStatusReader)
      throw new Error('Sync runtime status replaced');
    return { kind: 'runtime-status', status };
  }
  if (command.kind === 'checkpoint-exit') {
    const connection = await loadSyncConnection();
    if (!connection) return { kind: 'checkpoint-exit', outcome: 'unconfigured' };
    const result = await requestSyncCheckpointExit(
      connection.binding,
      connection.identity,
      command.receipt
    );
    if (
      sync === productCoordinator &&
      (result.outcome === 'requested' || result.outcome === 'already-due')
    )
      wakeSyncQueue();
    return { kind: 'checkpoint-exit', outcome: result.outcome };
  }
  if (command.kind === 'checkpoint-wake') {
    if (sync === productCoordinator) wakeSyncQueue();
    return { kind: 'checkpoint-woken' };
  }
  if (
    command.kind === 'checkpoint-policy' ||
    command.kind === 'checkpoint-interval' ||
    command.kind === 'checkpoint-flush'
  ) {
    const connection = await loadSyncConnection();
    if (!connection) throw new Error('Sync product command refused');
    const scope = connection.binding;
    if (command.kind === 'checkpoint-policy')
      return { kind: 'checkpoint-policy', intervalMs: await readSyncCheckpointInterval(scope) };
    if (command.kind === 'checkpoint-interval') {
      const { intervalMs } = await updateSyncCheckpointInterval(scope, command.intervalMs);
      if (sync === productCoordinator) wakeSyncQueue();
      return { kind: 'checkpoint-policy', intervalMs };
    }
    const result = await requestSyncCheckpointFlush(scope, connection.identity);
    if (sync === productCoordinator) wakeSyncQueue();
    return { kind: 'checkpoint-flushed', ...result };
  }
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
  if (command.kind === 'connection-resume') {
    await sync.resumeConnection(command.expected);
    if (sync === productCoordinator) wakeSyncQueue();
    return execute({ kind: 'status' }, requestId, sync, sender);
  }
  if (command.kind === 'connection-authentication') {
    await sync.updateAuthentication(command.expected, command.authentication);
    return execute({ kind: 'status' }, requestId, sync, sender);
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
              expected: connection.identity,
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
  if (command.kind === 'workspace-create' || command.kind === 'workspace-discover') {
    const source = await sync.planWorkspace(
      command.kind === 'workspace-create'
        ? { kind: 'allocation', parentUrl: command.parentUrl, accountId: command.accountId }
        : {
            kind: 'join',
            rootUrl: command.rootUrl,
            accountId: command.accountId,
            previous: command.previous,
          }
    );
    await sync.startWorkspace({
      source,
      authentication: command.authentication,
      requestId,
      ...(command.kind === 'workspace-discover' ? { operation: 'discover' as const } : {}),
    });
    return { kind: 'accepted', requestId };
  }
  if (command.kind === 'workspace-join') {
    const source = await sync.selectWorkspace({
      source: command.source,
      prefix: command.prefix,
      expected: command.expected,
    });
    await sync.startWorkspace({ source, authentication: command.authentication, requestId });
    return { kind: 'accepted', requestId };
  }
  if (command.kind === 'workspace-retry') {
    await sync.startWorkspace({
      source: command.source,
      authentication: command.authentication,
      requestId,
      ...(command.operation ? { operation: command.operation } : {}),
    });
    return { kind: 'accepted', requestId };
  }
  if (command.kind === 'workspace-abandon') return sync.abandonWorkspace(command.source);
  if (command.kind === 'workspace-enroll') {
    await sync.enrollWorkspace({
      source: command.source,
      authentication: command.authentication,
      storagePolicy: command.storagePolicy,
    });
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
    (error) =>
      sendResponse({
        success: false,
        error:
          error instanceof SecretProtectionLockedError
            ? 'secrets-locked'
            : 'Sync product command refused',
      })
  );
  return true;
}
