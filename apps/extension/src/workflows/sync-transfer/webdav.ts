import { createObject, getBasicAuthHeaders, makeCollection, propfind } from 'tsdav';

import { SyncRemoteError } from './remote-store';
import type { SyncRemotePage, SyncRemoteStore } from './remote-store';

/** Credentials are supplied by an authorized lifecycle owner and remain in this client only. */
interface WebdavRemoteStoreOptions {
  rootUrl: string;
  authentication: WebdavAuthentication | (() => Promise<WebdavAuthentication>);
  request: (
    signal: AbortSignal,
    issue: (signal: AbortSignal) => Promise<Response>
  ) => Promise<Response>;
}

type WebdavAuthentication =
  | { kind: 'basic'; username: string; password: string }
  | { kind: 'bearer'; accessToken: string };

const METADATA_LIMIT = 8 * 1024 * 1024;

function statusOf(error: unknown): number | null {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error['status'] === 'number' &&
    Number.isInteger(error['status'])
    ? error['status']
    : null;
}

function failure(error: unknown, signal?: AbortSignal): SyncRemoteError {
  if (signal?.aborted) return new SyncRemoteError('cancelled');
  if (error instanceof SyncRemoteError) return error;
  const status = statusOf(error);
  if (status === 401) return new SyncRemoteError('authentication', status);
  if (status === 403) return new SyncRemoteError('access-denied', status);
  if (status === 404) return new SyncRemoteError('missing', status);
  if (status === 412) return new SyncRemoteError('collision', status);
  if (status === 507) return new SyncRemoteError('storage-full', status);
  if (status === 423 || status === 429 || (status !== null && status >= 500)) {
    return new SyncRemoteError('temporary', status);
  }
  return new SyncRemoteError('transport', status);
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function nativeResponse(value: unknown): Response {
  if (!(value instanceof Response)) throw new SyncRemoteError('invalid-response');
  return value;
}

function segments(key: string, allowEmpty = false): string[] {
  if (allowEmpty && key === '') return [];
  const parts = key.split('/');
  if (
    parts.some((part) => {
      if (!part || part === '.' || part === '..' || /[\\?#:]/u.test(part)) return true;
      // Literal percent signs are names. Escaped routing delimiters remain inadmissible.
      if (/%(?:25)*(?:2e|2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/iu.test(part)) return true;
      for (const character of part) {
        const code = character.charCodeAt(0);
        if (code < 32 || code === 127) return true;
      }
      return false;
    })
  ) {
    throw new SyncRemoteError('invalid-key');
  }
  return parts;
}

function rootURL(input: string): URL {
  try {
    const url = new URL(input);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      input.includes('?') ||
      input.includes('#') ||
      input.includes('\\')
    ) {
      throw new SyncRemoteError('invalid-configuration');
    }
    const decoded = url.pathname
      .split('/')
      .filter(Boolean)
      .map((part) => {
        const value = decodeURIComponent(part);
        if (value.includes('/')) throw new SyncRemoteError('invalid-configuration');
        return value;
      });
    segments(decoded.join('/'), true);
    // Reject normalization of dot segments in the original URL as well.
    const rawPath = input.replace(/^https:\/\/[^/]+/iu, '').replace(/\/$/u, '');
    if (
      rawPath &&
      rawPath
        .split('/')
        .slice(1)
        .some((part) => {
          const value = decodeURIComponent(part);
          return !value || value === '.' || value === '..';
        })
    )
      throw new SyncRemoteError('invalid-configuration');
    url.pathname = `${url.pathname.replace(/\/$/u, '')}/`;
    return url;
  } catch {
    throw new SyncRemoteError('invalid-configuration');
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listedKey(href: unknown, root: URL): string {
  if (typeof href !== 'string' || href.includes('\\') || href.includes('?') || href.includes('#')) {
    throw new SyncRemoteError('invalid-response');
  }
  const rawPath = href.replace(/^https:\/\/[^/]+/iu, '');
  if (!rawPath.startsWith('/')) throw new SyncRemoteError('invalid-response');
  let parts: string[];
  try {
    parts = rawPath
      .replace(/\/$/u, '')
      .split('/')
      .slice(1)
      .map((part) => {
        const decoded = decodeURIComponent(part);
        if (decoded.includes('/')) throw new SyncRemoteError('invalid-response');
        return decoded;
      });
  } catch {
    throw new SyncRemoteError('invalid-response');
  }
  try {
    segments(parts.join('/'), root.pathname === '/');
  } catch {
    throw new SyncRemoteError('invalid-response');
  }
  const url = new URL(href, root);
  if (
    url.origin !== root.origin ||
    url.username ||
    url.password ||
    !url.pathname.startsWith(root.pathname)
  ) {
    // The root itself may be returned without its trailing slash.
    if (url['href'] !== root['href'].replace(/\/$/u, ''))
      throw new SyncRemoteError('invalid-response');
  }
  const rootParts = root.pathname
    .replace(/\/$/u, '')
    .split('/')
    .slice(1)
    .map((part) => decodeURIComponent(part));
  if (root.pathname === '/') rootParts.length = 0;
  if (rootParts.some((part, index) => parts[index] !== part))
    throw new SyncRemoteError('invalid-response');
  return parts.slice(rootParts.length).join('/');
}

function property(item: Record<string, unknown>, name: string): unknown {
  const stats = item['propStats'];
  if (!Array.isArray(stats)) throw new SyncRemoteError('invalid-response');
  let result: unknown;
  let found = false;
  for (const stat of stats) {
    if (!record(stat) || !record(stat['props']) || !record(stat['namespaces'])) {
      throw new SyncRemoteError('invalid-response');
    }
    if (!Object.hasOwn(stat['props'], name)) continue;
    if (stat['ok'] !== true) continue;
    if (stat['status'] !== 200 || stat['namespaces'][name] !== 'DAV:' || found) {
      throw new SyncRemoteError('invalid-response');
    }
    result = stat['props'][name];
    found = true;
  }
  if (!found) throw new SyncRemoteError('invalid-response');
  return result;
}

function directory(item: Record<string, unknown>): boolean {
  const resourceType = property(item, 'resourcetype');
  if (!record(resourceType)) throw new SyncRemoteError('invalid-response');
  return Object.hasOwn(resourceType, 'collection');
}

function fileSize(item: Record<string, unknown>): number {
  const size = property(item, 'getcontentlength');
  if (typeof size !== 'string' || !/^\d+$/.test(size) || !Number.isSafeInteger(Number(size))) {
    throw new SyncRemoteError('invalid-response');
  }
  return Number(size);
}

function entries(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new SyncRemoteError('invalid-response');
  return value.map((item) => {
    if (!record(item) || item['ok'] !== true || typeof item['status'] !== 'number') {
      throw failure(item);
    }
    return item;
  });
}

function clientFetch(root: URL, options: WebdavRemoteStoreOptions): typeof fetch {
  const authentication = options.authentication;
  const request = options.request;
  return async (input, options) => {
    if (typeof input !== 'string' || !(options?.signal instanceof AbortSignal)) {
      throw new SyncRemoteError('invalid-response');
    }
    const url = new URL(input);
    if (
      url.origin !== root.origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(root.pathname)
    )
      throw new SyncRemoteError('invalid-key');
    // Admit the exact encoded path before dispatch; URL normalization must not hide traversal.
    listedKey(input, root);
    options.signal.throwIfAborted();
    const resolved = typeof authentication === 'function' ? await authentication() : authentication;
    options.signal.throwIfAborted();
    const authenticationHeaders =
      resolved.kind === 'basic'
        ? getBasicAuthHeaders({ username: resolved.username, password: resolved.password })
        : { authorization: `Bearer ${resolved.accessToken}` };
    const authorization = new Headers(authenticationHeaders).get('authorization');
    if (!authorization) throw new SyncRemoteError('invalid-configuration');
    const requestHeaders = new Headers(options.headers);
    requestHeaders.set('Authorization', authorization);
    const response = nativeResponse(
      await request(options.signal, (admittedSignal) =>
        globalThis.fetch(input, {
          ...options,
          signal: admittedSignal,
          headers: requestHeaders,
          credentials: 'omit',
          redirect: 'error',
        })
      )
    );
    if (!response.ok) {
      await discard(response);
      if (response.status >= 300 && response.status < 400)
        throw new SyncRemoteError('invalid-response');
      throw failure({ status: response.status });
    }
    if (options.method === 'PUT' || options.method === 'MKCOL') {
      await discard(response);
      // davRequest reads text for MKCOL, even when it has no response payload.
      return new Response(null, { status: response.status, headers: response.headers });
    }
    if (options.method !== 'PROPFIND') return response;
    const length = response.headers.get('content-length');
    if (length !== null && /^\d+$/.test(length) && Number(length) > METADATA_LIMIT) {
      await discard(response);
      throw new SyncRemoteError('metadata-limit');
    }
    let bytes = 0;
    const limited = response.body?.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > METADATA_LIMIT) throw new SyncRemoteError('metadata-limit');
          controller.enqueue(chunk);
        },
      })
    );
    return new Response(limited, { status: response.status, headers: response.headers });
  };
}

function checkedStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const finish = () => signal.removeEventListener('abort', abort);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        signal.throwIfAborted();
        const next = await reader.read();
        signal.throwIfAborted();
        if (next.done) {
          finish();
          controller.close();
        } else controller.enqueue(next.value);
      } catch (error) {
        finish();
        controller.error(failure(error, signal));
      }
    },
    async cancel() {
      finish();
      await reader.cancel().catch(() => undefined);
    },
  });
}

/** Probe an existing HTTPS directory. The caller owns host authorization and request cancellation. */
export async function createWebdavRemoteStore(
  options: WebdavRemoteStoreOptions,
  signal: AbortSignal
): Promise<SyncRemoteStore> {
  try {
    signal.throwIfAborted();
    const root = rootURL(options.rootUrl);
    const guardedFetch = clientFetch(root, options);
    const objectUrl = (key: string, allowEmpty = false) => {
      const parts = segments(key, allowEmpty);
      return `${root.href}${parts.map((part) => encodeURIComponent(part)).join('/')}`;
    };
    const probe = async (key: string, requestSignal: AbortSignal) => {
      const result: unknown = await propfind({
        url: objectUrl(key, true),
        depth: '0',
        props: { 'd:resourcetype': {} },

        fetchOptions: { signal: requestSignal },
        fetch: guardedFetch,
      });
      requestSignal.throwIfAborted();
      const values = entries(result);
      if (values.length !== 1 || !values[0]) throw new SyncRemoteError('invalid-response');
      const item = values[0];
      if (listedKey(item['href'], root) !== key) throw new SyncRemoteError('invalid-response');
      if (!directory(item)) throw new SyncRemoteError('collision');
    };
    await probe('', signal);
    return {
      async list(prefix, { signal: requestSignal, cursor }) {
        try {
          requestSignal.throwIfAborted();
          if (cursor !== undefined) throw new SyncRemoteError('unsupported-cursor');
          if (prefix === '/') throw new SyncRemoteError('invalid-key');
          const normalized = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
          const url = objectUrl(normalized, true);
          const result: unknown = await propfind({
            url,
            depth: '1',
            props: { 'd:resourcetype': {}, 'd:getcontentlength': {} },

            fetchOptions: { signal: requestSignal },
            fetch: guardedFetch,
          });
          requestSignal.throwIfAborted();
          const page: SyncRemotePage = { objects: [], prefixes: [], nextCursor: null };
          const seen = new Set<string>();
          for (const item of entries(result)) {
            const key = listedKey(item['href'], root);
            if (seen.has(key)) throw new SyncRemoteError('invalid-response');
            seen.add(key);
            const isDirectory = directory(item);
            if (key === normalized) {
              if (!isDirectory) throw new SyncRemoteError('invalid-response');
              continue;
            }
            const base = normalized ? `${normalized}/` : '';
            if (!key.startsWith(base) || key.slice(base.length).includes('/') || key === '') {
              throw new SyncRemoteError('invalid-response');
            }
            if (isDirectory) page.prefixes.push(`${key}/`);
            else page.objects.push({ key, size: fileSize(item) });
          }
          return page;
        } catch (error) {
          throw failure(error, requestSignal);
        }
      },
      async stat(key, requestSignal) {
        try {
          requestSignal.throwIfAborted();
          const result: unknown = await propfind({
            url: objectUrl(key),
            depth: '0',
            props: { 'd:resourcetype': {}, 'd:getcontentlength': {} },
            fetchOptions: { signal: requestSignal },
            fetch: guardedFetch,
          });
          requestSignal.throwIfAborted();
          const values = entries(result);
          if (values.length !== 1 || !values[0]) throw new SyncRemoteError('invalid-response');
          const item = values[0];
          if (listedKey(item['href'], root) !== key) throw new SyncRemoteError('invalid-response');
          const resourceType = property(item, 'resourcetype');
          if (!record(resourceType) || Object.keys(resourceType).length !== 0) {
            throw new SyncRemoteError('invalid-response');
          }
          return { size: fileSize(item) };
        } catch (error) {
          throw failure(error, requestSignal);
        }
      },
      async read(key, requestSignal) {
        try {
          requestSignal.throwIfAborted();
          // tsdav davRequest consumes text. Native GET preserves the caller's binary stream.
          const response = await guardedFetch(objectUrl(key), {
            method: 'GET',

            signal: requestSignal,
          });
          if (!response.body) throw new SyncRemoteError('invalid-response');
          return checkedStream(response.body, requestSignal);
        } catch (error) {
          throw failure(error, requestSignal);
        }
      },
      async write(key, body, requestSignal) {
        try {
          requestSignal.throwIfAborted();
          const url = objectUrl(key);
          const parts = segments(key);
          for (let index = 1; index < parts.length; index += 1) {
            const parent = parts.slice(0, index).join('/');
            try {
              await probe(parent, requestSignal);
            } catch (error) {
              if (statusOf(error) !== 404) throw error;
              requestSignal.throwIfAborted();
              try {
                await makeCollection({
                  url: `${objectUrl(parent)}/`,

                  fetchOptions: { signal: requestSignal },
                  fetch: guardedFetch,
                });
              } catch (createError) {
                if (statusOf(createError) !== 405) throw createError;
                await probe(parent, requestSignal);
              }
            }
          }
          requestSignal.throwIfAborted();
          await createObject({
            url,
            data: body,
            headers: { 'content-type': 'application/octet-stream' },
            fetchOptions: { signal: requestSignal },
            fetch: guardedFetch,
          });
          requestSignal.throwIfAborted();
        } catch (error) {
          throw failure(error, requestSignal);
        }
      },
    };
  } catch (error) {
    throw failure(error, signal);
  }
}

/**
 * Allocate one new planned workspace root through one exclusive MKCOL.
 * The caller must persist its plan before this call and own request admission and drain.
 * Only a positive 201 acknowledges allocation. An error grants no ownership or retry authority.
 */
export async function allocateWebdavWorkspaceRoot(
  options: WebdavRemoteStoreOptions,
  signal: AbortSignal
): Promise<void> {
  try {
    signal.throwIfAborted();
    const root = rootURL(options.rootUrl);
    if (
      !/\/Sniptale-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/$/u.test(
        root.pathname
      )
    )
      throw new SyncRemoteError('invalid-configuration');
    const guardedFetch = clientFetch(root, options);
    await makeCollection({
      url: root.href,
      fetchOptions: { signal },
      fetch: async (input, init) => {
        const response = await guardedFetch(input, init);
        if (response.status !== 201) throw new SyncRemoteError('invalid-response');
        return response;
      },
    });
    signal.throwIfAborted();
  } catch (error) {
    if (statusOf(error) === 405 && !signal.aborted) throw new SyncRemoteError('collision', 405);
    throw failure(error, signal);
  }
}
