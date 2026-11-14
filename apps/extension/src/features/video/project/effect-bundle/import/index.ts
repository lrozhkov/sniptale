import type { AnimationArtifactImportResult } from '../lottie-profile';
import type { EffectBundleFailure } from '../diagnostics';
import {
  createAnimationImportWorkerRequest,
  parseAnimationImportWorkerResponse,
} from './worker/protocol';
import ImportWorker from './worker/index?worker&inline';

import { createEffectBundleFailure } from '../diagnostics';
import { EFFECT_BUNDLE_LIMITS } from '../limits';

export type EffectImportWorkerLike = Pick<
  Worker,
  'onerror' | 'onmessage' | 'onmessageerror' | 'postMessage' | 'terminate'
>;

interface ImportAnimationArtifactOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  workerFactory?: () => EffectImportWorkerLike;
}

function dispatchImportRequest<TResult>(
  worker: EffectImportWorkerLike,
  request: unknown,
  requestId: string,
  bytes: Uint8Array,
  timeoutMs: number,
  parseResult: (value: unknown, requestId: string) => TResult | null | Promise<TResult | null>,
  signal?: AbortSignal
): Promise<TResult | EffectBundleFailure> {
  return new Promise((resolve) => {
    let settled = false;
    let processing = false;
    const finish = (result: TResult | EffectBundleFailure): void => {
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
        for (const port of event.ports) port.close();
        failWorker();
        return;
      }
      if (settled) return;
      if (processing) {
        failWorker();
        return;
      }
      processing = true;
      void Promise.resolve()
        .then(() => parseResult(event.data, requestId))
        .then((result) => {
          if (result) finish(result);
          else failWorker();
        })
        .catch(failWorker);
    };
    if (signal?.aborted) {
      abort();
      return;
    }
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
): Promise<Uint8Array<ArrayBuffer> | null> {
  const byteLength = input instanceof Blob ? input.size : input.byteLength;
  if (byteLength === 0 || byteLength > EFFECT_BUNDLE_LIMITS.maxArchiveBytes) return null;
  if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer());
  if (input instanceof Uint8Array) return input.slice();
  return new Uint8Array(input.slice(0));
}

/** One bounded disposable worker per file; the receiving parent verifies its resource closure. */
export async function importAnimationArtifact(
  input: ArrayBuffer | Blob | Uint8Array,
  options: ImportAnimationArtifactOptions = {}
): Promise<AnimationArtifactImportResult> {
  if (options.signal?.aborted)
    return createEffectBundleFailure('BUNDLE_IMPORT_CANCELLED', '$worker');
  const bytes = await readBoundedInput(input);
  if (!bytes) return createEffectBundleFailure('BUNDLE_LIMIT_EXCEEDED', '$artifact');
  const kind = classifyEffectArtifactBytes(bytes);
  if (!kind) return createEffectBundleFailure('BUNDLE_ARCHIVE_INVALID', '$artifact');
  if (kind === 'raw-json' && bytes.byteLength > EFFECT_BUNDLE_LIMITS.maxJsonBytes)
    return createEffectBundleFailure('BUNDLE_LIMIT_EXCEEDED', '$document');
  const expectedHash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
  if (options.signal?.aborted)
    return createEffectBundleFailure('BUNDLE_IMPORT_CANCELLED', '$worker');
  const requestId = crypto.randomUUID();
  const worker = (options.workerFactory ?? createBrowserImportWorker)();
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.min(EFFECT_BUNDLE_LIMITS.importTimeoutMs, Math.max(1, options.timeoutMs!))
    : EFFECT_BUNDLE_LIMITS.importTimeoutMs;
  return dispatchImportRequest(
    worker,
    createAnimationImportWorkerRequest(requestId, bytes),
    requestId,
    bytes,
    timeoutMs,
    async (value, id) => {
      const result = await parseAnimationImportWorkerResponse(value, id, expectedHash);
      if (!result?.ok) return result;
      const archived =
        result.kind === 'dotlottie' ||
        (result.kind === 'sniptale-animation' && result.package !== undefined);
      return archived === (kind === 'bundle-zip') ? result : null;
    },
    options.signal
  );
}

function classifyEffectArtifactBytes(bytes: Uint8Array): 'bundle-zip' | 'raw-json' | null {
  if (bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const marker = (bytes[2]! << 8) | bytes[3]!;
    if (marker === 0x0304 || marker === 0x0506 || marker === 0x0708) return 'bundle-zip';
  }
  const first = bytes.find(
    (byte) => byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d
  );
  return first === 0x7b ? 'raw-json' : null;
}
