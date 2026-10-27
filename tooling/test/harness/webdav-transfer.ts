import { createWebdavWorkspaceHarness } from './webdav-workspace';
import { createWebdavConnectionHarness } from './webdav-connection';
import { createWebdavPortableHarness } from './webdav-portable';
import { sha256 } from '@noble/hashes/sha2.js';
import { createWebdavRemoteStore } from '../../../apps/extension/src/workflows/sync-transfer/webdav';
import {
  SyncRemoteError,
  type SyncRemoteStore,
} from '../../../apps/extension/src/workflows/sync-transfer/remote-store';

// Observe JavaScript dispatches without changing native browser request behavior.
let nativePutCalls = 0;
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, options) => {
  if (options?.method === 'PUT') nativePutCalls += 1;
  return nativeFetch(input, options);
};

let store: SyncRemoteStore | undefined;
let source: File | undefined;
let upload: AbortController | undefined;
const hex = (value: Uint8Array) =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

function connected(): SyncRemoteStore {
  if (!store) throw new Error('Provider fixture is not connected.');
  return store;
}

function result(error: unknown) {
  return error instanceof SyncRemoteError
    ? { code: error.code, status: error.status }
    : { code: 'fixture', status: null };
}

async function connect(input: { rootUrl: string; username: string; password: string }) {
  if (!(await chrome.permissions.contains({ origins: [`${new URL(input.rootUrl).origin}/*`] }))) {
    throw new Error('Provider fixture origin permission is missing.');
  }
  store = await createWebdavRemoteStore(
    {
      rootUrl: input.rootUrl,
      authentication: { kind: 'basic', username: input.username, password: input.password },
      request: (signal, issue) => issue(signal),
    },
    new AbortController().signal
  );
}

async function prepareSource(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 64 * 1024 * 1024)
    throw new Error('Invalid fixture size.');
  const directory = await navigator.storage.getDirectory();
  const handle = await directory.getFileHandle('dav-fixture-source.bin', { create: true });
  const writer = await handle.createWritable();
  const digest = sha256.create();
  const chunk = new Uint8Array(64 * 1024);
  for (let index = 0; index < chunk.length; index += 1) chunk[index] = index % 251;
  try {
    for (let offset = 0; offset < size; offset += chunk.length) {
      const part = chunk.subarray(0, Math.min(chunk.length, size - offset));
      await writer.write(part);
      digest.update(part);
    }
    await writer.close();
  } catch (error) {
    await writer.abort();
    throw error;
  }
  source = await handle.getFile();
  return { size: source.size, sha256: hex(digest.digest()) };
}

async function uploadSource(key: string) {
  if (!source) throw new Error('Provider fixture source is missing.');
  const controller = new AbortController();
  upload = controller;
  try {
    await connected().write(key, source, controller.signal);
    return { code: 'success', status: null };
  } catch (error) {
    return result(error);
  } finally {
    if (upload === controller) upload = undefined;
  }
}

async function uploadImage(key: string) {
  const bytes = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
    ),
    (character) => character.charCodeAt(0)
  );
  const body = new File([bytes], 'capture.png', { type: 'image/png' });
  await connected().write(key, body, new AbortController().signal);
  return { size: body.size, sha256: hex(sha256(bytes)) };
}

async function readProof(key: string, expectedSize: number) {
  const stream = await connected().read(key, new AbortController().signal);
  const directory = await navigator.storage.getDirectory();
  const handle = await directory.getFileHandle(`dav-received-${crypto.randomUUID()}`, {
    create: true,
  });
  const writer = await handle.createWritable();
  const digest = sha256.create();
  let bytes = 0;
  let maxChunk = 0;
  try {
    await stream.pipeTo(
      new WritableStream<Uint8Array>({
        async write(chunk) {
          bytes += chunk.byteLength;
          if (bytes > expectedSize) throw new Error('Provider fixture exceeded its expected size.');
          maxChunk = Math.max(maxChunk, chunk.byteLength);
          digest.update(chunk);
          await writer.write(new Blob([new Uint8Array(chunk)]));
        },
      })
    );
    if (bytes !== expectedSize) throw new Error('Provider fixture size differs.');
    await writer.close();
    const file = await handle.getFile();
    return { bytes, maxChunk, size: file.size, sha256: hex(digest.digest()) };
  } catch (error) {
    await writer.abort();
    throw error;
  }
}

const webdavTransferHarness = {
  connect,
  workspace: createWebdavWorkspaceHarness(),
  connection: createWebdavConnectionHarness((remote) => {
    store = remote;
  }),
  portable: createWebdavPortableHarness(connected),
  nativePutCalls: () => nativePutCalls,
  prepareSource,
  uploadSource,
  uploadImage,
  readProof,
  list: (prefix: string) => connected().list(prefix, { signal: new AbortController().signal }),
  async listResult(prefix: string) {
    try {
      await connected().list(prefix, { signal: new AbortController().signal });
      return { code: 'success', status: null };
    } catch (error) {
      return result(error);
    }
  },
  abortUpload: () => upload?.abort(),
};
declare global {
  interface Window {
    webdavTransferHarness: typeof webdavTransferHarness;
  }
}
window.webdavTransferHarness = webdavTransferHarness;
