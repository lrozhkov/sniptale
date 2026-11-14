import { browserPermissions } from '@sniptale/platform/browser/permissions';
import { createRuntimeMessagingTransport } from '../../platform/runtime-messaging';
import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  readEditorVectorSettings,
  type EditorVectorSettings,
} from '../../composition/persistence/vector-elements';
import {
  EditorVectorCatalogError,
  isCatalogCommand,
  sameCatalogSource,
  type CatalogResult,
  type CatalogResponse,
  type CatalogParameters,
  type CatalogRequest,
  type EditorVectorSourceToken,
} from '../../features/editor/vector-catalog';
import { executeVectorCatalogRequest } from './transport';

interface EditorVectorCatalogClient {
  collections(signal?: AbortSignal): Promise<CatalogResult<'collections'>>;
  search(
    params: { query: string; prefix?: string; start?: number; limit?: number },
    signal?: AbortSignal
  ): Promise<CatalogResult<'search'>>;
  collection(prefix: string, signal?: AbortSignal): Promise<CatalogResult<'collection'>>;
  assets(
    prefix: string,
    names: readonly string[],
    signal?: AbortSignal
  ): Promise<CatalogResult<'assets'>>;
  check(signal?: AbortSignal): Promise<CatalogResult<'check'>>;
}
interface CatalogExecutionDependencies {
  readSettings(): Promise<EditorVectorSettings>;
  messaging: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>;
  native: boolean;
  fetch?: typeof globalThis.fetch;
}
function settingsSource(settings: EditorVectorSettings): EditorVectorSourceToken {
  return {
    sourceId: settings.baseUrl,
    incarnation: settings.incarnation,
    generation: settings.sourceGeneration,
  };
}
function requireNetwork(settings: EditorVectorSettings) {
  if (!settings.networkEnabled) throw new EditorVectorCatalogError('network-disabled');
  if (!settings.disclosureAccepted) throw new EditorVectorCatalogError('disclosure-required');
}
function createRequest(
  params: CatalogParameters,
  settings: EditorVectorSettings,
  signal: AbortSignal | undefined
): CatalogRequest {
  const request = { ...params, requestId: crypto.randomUUID(), source: settingsSource(settings) };
  if (!isCatalogCommand(request)) throw new EditorVectorCatalogError('invalid-request');
  if (signal?.aborted) throw new EditorVectorCatalogError('canceled');
  requireNetwork(settings);
  return request;
}
async function dispatchRequest(
  request: CatalogRequest,
  signal: AbortSignal | undefined,
  dependencies: CatalogExecutionDependencies
): Promise<CatalogResponse> {
  if (dependencies.native)
    return dependencies.messaging.sendRuntimeMessage({
      ...request,
      type: MessageType.EDITOR_VECTOR_CATALOG_COMMAND,
    });
  return executeVectorCatalogRequest(request, {
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
    ...(signal ? { signal } : {}),
    async beforeSend() {
      const current = await dependencies.readSettings();
      requireNetwork(current);
      if (!sameCatalogSource(request.source, settingsSource(current)))
        throw new EditorVectorCatalogError('source-changed');
    },
  });
}
function requireCurrentResponse(
  response: Exclude<CatalogResponse, { success: false }>,
  source: EditorVectorSourceToken,
  current: EditorVectorSettings
) {
  if (
    response.operation === 'cancel' ||
    !sameCatalogSource(source, response.source) ||
    !sameCatalogSource(source, settingsSource(current)) ||
    !current.networkEnabled ||
    !current.disclosureAccepted
  )
    throw new EditorVectorCatalogError('source-changed');
}
/** One request identity owns cancellation through dispatch and final source admission. */
async function executeCatalogRequest(
  params: CatalogParameters,
  signal: AbortSignal | undefined,
  dependencies: CatalogExecutionDependencies
): Promise<CatalogResponse> {
  const request = createRequest(params, await dependencies.readSettings(), signal);
  const cancel = () => {
    if (dependencies.native)
      void dependencies.messaging
        .sendRuntimeMessage({
          type: MessageType.EDITOR_VECTOR_CATALOG_COMMAND,
          operation: 'cancel',
          requestId: request.requestId,
        })
        .catch(() => undefined);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await dispatchRequest(request, signal, dependencies);
    if (signal?.aborted) throw new EditorVectorCatalogError('canceled');
    if (response.success === false)
      throw new EditorVectorCatalogError(response.error, response.retryAfterSeconds);
    requireCurrentResponse(response, request.source, await dependencies.readSettings());
    return response;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
/** Create the same catalog interface for native IPC and direct CORS-bound plain development. */
export function createEditorVectorCatalogClient(
  dependencies: {
    readSettings?: () => Promise<EditorVectorSettings>;
    messaging?: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>;
    native?: boolean;
    fetch?: typeof globalThis.fetch;
  } = {}
): EditorVectorCatalogClient {
  const execution: CatalogExecutionDependencies = {
    readSettings: dependencies.readSettings ?? readEditorVectorSettings,
    messaging: dependencies.messaging ?? createRuntimeMessagingTransport(),
    native:
      dependencies.native ??
      (typeof location !== 'undefined' && location.protocol === 'chrome-extension:'),
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
  };
  const execute = (params: CatalogParameters, signal?: AbortSignal) =>
    executeCatalogRequest(params, signal, execution);
  return {
    async collections(signal) {
      const result = await execute({ operation: 'collections' }, signal);
      if (!result.success || result.operation !== 'collections')
        throw new EditorVectorCatalogError('response-invalid');
      return result;
    },
    async search(params, signal) {
      const result = await execute({ operation: 'search', ...params }, signal);
      if (!result.success || result.operation !== 'search')
        throw new EditorVectorCatalogError('response-invalid');
      return result;
    },
    async collection(prefix, signal) {
      const result = await execute({ operation: 'collection', prefix }, signal);
      if (!result.success || result.operation !== 'collection')
        throw new EditorVectorCatalogError('response-invalid');
      return result;
    },
    async assets(prefix, names, signal) {
      const result = await execute({ operation: 'assets', prefix, names }, signal);
      if (!result.success || result.operation !== 'assets')
        throw new EditorVectorCatalogError('response-invalid');
      return result;
    },
    async check(signal) {
      const result = await execute({ operation: 'check' }, signal);
      if (!result.success || result.operation !== 'check')
        throw new EditorVectorCatalogError('response-invalid');
      return result;
    },
  };
}

/** Invoke native host admission directly inside the caller's trusted click stack. */
export function requestEditorVectorCatalogPermission(baseUrl: string): Promise<boolean> {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      return Promise.resolve(false);
    if (typeof location !== 'undefined' && location.protocol === 'chrome-extension:')
      return browserPermissions.request({ origins: [`${url.origin}/*`] });
    return Promise.resolve(
      typeof location !== 'undefined' &&
        ['http:', 'https:'].includes(location.protocol) &&
        ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    );
  } catch {
    return Promise.resolve(false);
  }
}
