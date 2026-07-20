import ImportWorker from './worker/index?worker&inline';

import { createEffectBundleFailure } from '../diagnostics';
import {
  classifyEffectArtifactBytes,
  createUnrecognizedArtifactFailure,
  type ImportEffectArtifactResult,
} from './artifact';
import {
  createEffectImportWorkerRequest,
  parseEffectImportWorkerResponse,
} from './worker/protocol';
import { EFFECT_BUNDLE_LIMITS } from '../limits';

export type EffectImportWorkerLike = Pick<
  Worker,
  'onerror' | 'onmessage' | 'onmessageerror' | 'postMessage' | 'terminate'
>;

interface ImportEffectArtifactOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  workerFactory?: () => EffectImportWorkerLike;
}

export async function importEffectArtifact(
  input: ArrayBuffer | Blob | Uint8Array,
  options: ImportEffectArtifactOptions = {}
): Promise<ImportEffectArtifactResult> {
  if (options.signal?.aborted) {
    return createEffectBundleFailure('BUNDLE_IMPORT_CANCELLED', '$worker');
  }
  const bytes = await readBoundedInput(input);
  if (!bytes) return createEffectBundleFailure('BUNDLE_LIMIT_EXCEEDED', '$artifact');
  const kind = classifyEffectArtifactBytes(bytes);
  if (!kind) return createUnrecognizedArtifactFailure();
  if (kind === 'raw-json' && bytes.byteLength > EFFECT_BUNDLE_LIMITS.maxJsonBytes) {
    return createEffectBundleFailure('BUNDLE_LIMIT_EXCEEDED', '$document');
  }

  const requestId = crypto.randomUUID();
  const request = createEffectImportWorkerRequest(requestId, kind, bytes);
  const worker = (options.workerFactory ?? createBrowserImportWorker)();
  const timeoutMs = Math.min(
    EFFECT_BUNDLE_LIMITS.importTimeoutMs,
    Math.max(1, options.timeoutMs ?? EFFECT_BUNDLE_LIMITS.importTimeoutMs)
  );

  return dispatchImportRequest(worker, request, requestId, bytes, timeoutMs, options.signal);
}

function dispatchImportRequest(
  worker: EffectImportWorkerLike,
  request: unknown,
  requestId: string,
  bytes: Uint8Array,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<ImportEffectArtifactResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ImportEffectArtifactResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      resolve(result);
    };
    const failWorker = (): void => {
      finish(createEffectBundleFailure('BUNDLE_IMPORT_WORKER_FAILURE', '$worker'));
    };
    const abort = (): void => {
      finish(createEffectBundleFailure('BUNDLE_IMPORT_CANCELLED', '$worker'));
    };
    const timeout = setTimeout(() => {
      finish(createEffectBundleFailure('BUNDLE_IMPORT_TIMEOUT', '$worker'));
    }, timeoutMs);

    worker.onerror = failWorker;
    worker.onmessageerror = failWorker;
    worker.onmessage = (event) => {
      if (event.ports.length !== 0) {
        failWorker();
        return;
      }
      const result = parseEffectImportWorkerResponse(event.data, requestId);
      if (result) finish(result);
      else failWorker();
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      worker.postMessage(request, [bytes.buffer]);
    } catch {
      failWorker();
    }
  });
}

function createBrowserImportWorker(): EffectImportWorkerLike {
  return new ImportWorker();
}

async function readBoundedInput(
  input: ArrayBuffer | Blob | Uint8Array
): Promise<Uint8Array | null> {
  const byteLength = input instanceof Blob ? input.size : input.byteLength;
  if (byteLength === 0 || byteLength > EFFECT_BUNDLE_LIMITS.maxArchiveBytes) return null;
  if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer());
  if (input instanceof Uint8Array) return input.slice();
  return new Uint8Array(input.slice(0));
}
