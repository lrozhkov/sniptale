// policyStateId: vector-catalog-requests - caller-bound, deadline-limited metadata requests.
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { browserPermissions } from '@sniptale/platform/browser/permissions';
import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  readEditorVectorSettings,
  type EditorVectorSettings,
} from '../../composition/persistence/vector-elements';
import {
  classifySettingsPageSenderUrl,
  isGallerySenderUrl,
  isImageEditorSenderUrl,
  isScenarioEditorSenderUrl,
} from '../../platform/navigation/extension-pages/sender-url';
import {
  EditorVectorCatalogError,
  isCatalogCommand,
  sameCatalogSource,
  type CatalogCommand,
  type CatalogRequest,
  type CatalogResponse,
} from '../../features/editor/vector-catalog';
import {
  executeVectorCatalogRequest,
  VECTOR_CATALOG_DEADLINE_MS,
} from '../../workflows/vector-catalog/transport';

/** Canonical editor hosts and ordinary Settings only, bound to native document provenance. */
export function getVectorCatalogCallerKey(sender: chrome.runtime.MessageSender): string | null {
  if (
    sender.id !== new URL(runtimeInfo.getURL('')).host ||
    !sender.documentId ||
    !Number.isSafeInteger(sender.frameId) ||
    sender.frameId === undefined ||
    sender.frameId < 0 ||
    !(
      isImageEditorSenderUrl(sender.url) ||
      isGallerySenderUrl(sender.url) ||
      isScenarioEditorSenderUrl(sender.url) ||
      classifySettingsPageSenderUrl(sender.url) === 'ordinary-settings-page'
    )
  )
    return null;
  return JSON.stringify([sender.documentId, sender.frameId, sender.tab?.id ?? null, sender.url]);
}

function requireSource(settings: EditorVectorSettings, request: CatalogRequest): void {
  if (!settings.networkEnabled) throw new EditorVectorCatalogError('network-disabled');
  if (!settings.disclosureAccepted) throw new EditorVectorCatalogError('disclosure-required');
  if (
    !sameCatalogSource(request.source, {
      sourceId: settings.baseUrl,
      incarnation: settings.incarnation,
      generation: settings.sourceGeneration,
    })
  )
    throw new EditorVectorCatalogError('source-changed');
}

/** Resolve persisted admission for every egress; cancellation cannot address another caller's work. */
export function createEditorVectorCatalogRoute(dependencies: {
  readSettings(): Promise<EditorVectorSettings>;
  contains(origins: { origins: string[] }): Promise<boolean>;
  fetch?: typeof globalThis.fetch;
}) {
  const requests = new Map<string, { caller: string; controller: AbortController }>();
  async function execute(command: CatalogCommand, caller: string): Promise<CatalogResponse> {
    const key = JSON.stringify([caller, command.requestId]);
    if (command.operation === 'cancel') {
      requests.get(key)?.controller.abort();
      return { success: true, operation: 'cancel' };
    }
    if (
      requests.has(key) ||
      requests.size >= 16 ||
      [...requests.values()].filter((entry) => entry.caller === caller).length >= 4
    )
      return { success: false, error: 'busy' };
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, VECTOR_CATALOG_DEADLINE_MS);
    requests.set(key, { caller, controller });
    try {
      requireSource(await dependencies.readSettings(), command);
      const response = await executeVectorCatalogRequest(command, {
        ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
        signal: controller.signal,
        async beforeSend() {
          requireSource(await dependencies.readSettings(), command);
          const origin = new URL(command.source.sourceId).origin;
          if (!(await dependencies.contains({ origins: [`${origin}/*`] })))
            throw new EditorVectorCatalogError('permission-required');
          requireSource(await dependencies.readSettings(), command);
        },
      });
      requireSource(await dependencies.readSettings(), command);
      if (controller.signal.aborted) throw new EditorVectorCatalogError('canceled');
      return response;
    } catch (error) {
      if (timedOut) return { success: false, error: 'timeout' };
      return error instanceof EditorVectorCatalogError
        ? {
            success: false,
            error: error.code,
            ...(error.retryAfterSeconds === undefined
              ? {}
              : { retryAfterSeconds: error.retryAfterSeconds }),
          }
        : { success: false, error: 'network-failed' };
    } finally {
      clearTimeout(timer);
      requests.delete(key);
    }
  }
  return { execute };
}

export function createNativeEditorVectorCatalogRoute() {
  return createEditorVectorCatalogRoute({
    readSettings: readEditorVectorSettings,
    contains: (origins) => browserPermissions.contains(origins),
  });
}

/** Repeat sender and shape checks after action-kernel admission at the network owner boundary. */
export function routeEditorVectorCatalogMessage(
  route: ReturnType<typeof createEditorVectorCatalogRoute>,
  input: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender
): boolean {
  if (!isRecord(input) || input['type'] !== MessageType.EDITOR_VECTOR_CATALOG_COMMAND) return false;
  const caller = getVectorCatalogCallerKey(sender);
  if (!caller) {
    sendResponse({ success: false, error: 'unauthorized' });
    return true;
  }
  if (!isCatalogCommand(input)) {
    sendResponse({ success: false, error: 'invalid-request' });
    return true;
  }
  void route
    .execute(input, caller)
    .then(sendResponse, () => sendResponse({ success: false, error: 'network-failed' }));
  return true;
}
