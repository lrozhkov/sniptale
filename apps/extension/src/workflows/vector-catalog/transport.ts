import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  EditorVectorCatalogError,
  isCatalogData,
  type CatalogRequest,
  type CatalogSuccess,
} from '../../features/editor/vector-catalog';

const MAX_BYTES = 2 * 1024 * 1024;
export const VECTOR_CATALOG_DEADLINE_MS = 10_000;

function endpoint(baseUrl: string, path: string): URL {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new EditorVectorCatalogError('invalid-request');
  }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash)
    throw new EditorVectorCatalogError('invalid-request');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(path, base);
}
function retryAfter(value: string | null, now: number): number | undefined {
  if (!value || value.length > 128) return undefined;
  const seconds = /^\d+$/u.test(value)
    ? Number(value)
    : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isFinite(seconds) ? Math.min(86400, Math.max(0, seconds)) : undefined;
}
async function readJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new EditorVectorCatalogError('response-too-large');
  }
  if (!response.body) throw new EditorVectorCatalogError('response-invalid');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_BYTES) {
        await reader.cancel();
        throw new EditorVectorCatalogError('response-too-large');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value;
  } catch {
    throw new EditorVectorCatalogError('response-invalid');
  }
}

/** Anonymous metadata egress for one chosen source; every subrequest repeats current admission. */
export async function executeVectorCatalogRequest(
  request: CatalogRequest,
  dependencies: {
    beforeSend(): Promise<void>;
    fetch?: typeof globalThis.fetch;
    signal?: AbortSignal;
    now?: () => number;
  }
): Promise<CatalogSuccess> {
  const timeout = AbortSignal.timeout(VECTOR_CATALOG_DEADLINE_MS);
  const signal = dependencies.signal ? AbortSignal.any([timeout, dependencies.signal]) : timeout;
  const fetch = dependencies.fetch ?? globalThis.fetch;
  async function read(path: string, parameters: Record<string, string> = {}): Promise<unknown> {
    const url = endpoint(request.source.sourceId, path);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    await dependencies.beforeSend();
    if (signal.aborted)
      throw new EditorVectorCatalogError(timeout.aborted ? 'timeout' : 'canceled');
    const response = await fetch(url.href, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      throw new EditorVectorCatalogError('forbidden');
    }
    if (path === 'search' && [404, 405, 501].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      throw new EditorVectorCatalogError('unsupported-search');
    }
    if (response.status === 429) {
      const seconds = retryAfter(
        response.headers.get('retry-after'),
        (dependencies.now ?? Date.now)()
      );
      await response.body?.cancel().catch(() => undefined);
      throw new EditorVectorCatalogError('rate-limited', seconds);
    }
    if (
      !response.ok ||
      response.redirected ||
      (response.url && new URL(response.url).href !== url.href)
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new EditorVectorCatalogError('http-error');
    }
    return readJson(response);
  }
  try {
    const source = request.source;
    switch (request.operation) {
      case 'collections': {
        const data = await read('collections');
        if (!isCatalogData('collections', data))
          throw new EditorVectorCatalogError('response-invalid');
        return { success: true, operation: 'collections', source, data };
      }
      case 'search': {
        const value = await read('search', {
          query: request.query,
          limit: String(request.limit ?? 64),
          start: String(request.start ?? 0),
          ...(request.prefix ? { prefix: request.prefix } : {}),
        });
        if (!isRecord(value)) throw new EditorVectorCatalogError('response-invalid');
        const data = {
          ...value,
          start: value['start'] ?? request.start ?? 0,
          limit: value['limit'] ?? request.limit ?? 64,
        };
        if (!isCatalogData('search', data)) throw new EditorVectorCatalogError('response-invalid');
        return { success: true, operation: 'search', source, data };
      }
      case 'collection': {
        const data = await read('collection', { prefix: request.prefix, info: 'true' });
        if (!isCatalogData('collection', data) || data['prefix'] !== request.prefix)
          throw new EditorVectorCatalogError('response-invalid');
        return { success: true, operation: 'collection', source, data };
      }
      case 'assets': {
        const data = await read(`${encodeURIComponent(request.prefix)}.json`, {
          icons: request.names.join(','),
        });
        if (!isCatalogData('assets', data) || data['prefix'] !== request.prefix)
          throw new EditorVectorCatalogError('response-invalid');
        return { success: true, operation: 'assets', source, data };
      }
      case 'check': {
        const collections = await read('collections');
        if (!isCatalogData('collections', collections))
          throw new EditorVectorCatalogError('response-invalid');
        let search = false;
        try {
          const result = await read('search', { query: 'heart', limit: '32' });
          search =
            isRecord(result) &&
            isCatalogData('search', {
              ...result,
              start: result['start'] ?? 0,
              limit: result['limit'] ?? 32,
            });
        } catch (error) {
          if (!(error instanceof EditorVectorCatalogError) || error.code !== 'unsupported-search')
            throw error;
        }
        return { success: true, operation: 'check', source, data: { collections: true, search } };
      }
    }
  } catch (error) {
    if (timeout.aborted) throw new EditorVectorCatalogError('timeout');
    if (dependencies.signal?.aborted) throw new EditorVectorCatalogError('canceled');
    if (error instanceof EditorVectorCatalogError) throw error;
    throw new EditorVectorCatalogError('network-failed');
  }
}
