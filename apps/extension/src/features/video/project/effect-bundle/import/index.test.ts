import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectArtifactInCurrentThread } from './artifact';
import { importEffectArtifact, type EffectImportWorkerLike } from './index';
import { importEffectBundleZip } from './zip';
import {
  createEffectImportWorkerResponse,
  parseEffectImportWorkerRequest,
} from './worker/protocol';

vi.mock('./worker/index?worker&inline', () => ({
  default: class UnusedImportWorker {
    onerror: (() => void) | null = null;
    onmessage = null;
    onmessageerror = null;

    postMessage(): void {
      this.onerror?.();
    }

    terminate(): void {}
  },
}));

describe('disposable EffectV1 import worker boundary', () => {
  it('imports a self-contained raw document through one disposable worker', async () => {
    const worker = new ImportWorkerFake(async (message) => {
      const request = parseEffectImportWorkerRequest(message);
      expect(request).not.toBeNull();
      const result = await importEffectArtifactInCurrentThread(request!.kind, request!.bytes);
      return createEffectImportWorkerResponse(request!.requestId, result);
    });

    const result = await importEffectArtifact(readRawFixture(), {
      workerFactory: () => worker,
    });

    expect(result).toEqual(
      expect.objectContaining({
        artifact: expect.objectContaining({ kind: 'raw-json' }),
        ok: true,
      })
    );
    expect(worker.postCount).toBe(1);
    expect(worker.terminateCount).toBe(1);
  });

  it('terminates and returns a stable failure on timeout', async () => {
    vi.useFakeTimers();
    const worker = new ImportWorkerFake(() => new Promise(() => undefined));
    const resultPromise = importEffectArtifact(readRawFixture(), {
      timeoutMs: 10,
      workerFactory: () => worker,
    });

    await vi.advanceTimersByTimeAsync(10);

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({ ok: false, primaryCode: 'BUNDLE_IMPORT_TIMEOUT' })
    );
    expect(worker.terminateCount).toBe(1);
    vi.useRealTimers();
  });
});

describe('disposable EffectV1 import rejection', () => {
  it('rejects malformed or mismatched worker responses without exposing their content', async () => {
    const worker = new ImportWorkerFake(async () => ({
      requestId: 'attacker-controlled',
      result: { ok: true },
      token: 'sniptale:effect-bundle:import-v1',
      type: 'sniptale:effect-bundle:import-response',
    }));

    await expect(
      importEffectArtifact(readRawFixture(), { workerFactory: () => worker })
    ).resolves.toEqual(
      expect.objectContaining({ ok: false, primaryCode: 'BUNDLE_IMPORT_WORKER_FAILURE' })
    );
    expect(worker.terminateCount).toBe(1);
  });

  it('does not create a worker for a pre-cancelled import', async () => {
    const controller = new AbortController();
    controller.abort();
    const workerFactory = vi.fn();

    await expect(
      importEffectArtifact(readRawFixture(), { signal: controller.signal, workerFactory })
    ).resolves.toEqual(
      expect.objectContaining({ ok: false, primaryCode: 'BUNDLE_IMPORT_CANCELLED' })
    );
    expect(workerFactory).not.toHaveBeenCalled();
  });

  it('fails raw documents that depend on unresolved path assets', async () => {
    const corpusCase = EFFECT_BUNDLE_CORPUS.find(({ artifact }) =>
      artifact.endsWith('/asset-bearing-conformance.sniptale-bundle.zip')
    )!;
    const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(corpusCase));
    expect(imported.ok).toBe(true);
    const bytes = new TextEncoder().encode(imported.ok ? imported.bundle.documents[0]!.source : '');

    const result = await importEffectArtifactInCurrentThread('raw-json', bytes);

    expect(result).toEqual(
      expect.objectContaining({ ok: false, primaryCode: 'BUNDLE_ASSET_CLOSURE' })
    );
  });
});

describe('disposable EffectV1 artifact preflight', () => {
  it('rejects empty, unknown, and oversized artifacts before worker creation', async () => {
    const workerFactory = vi.fn();

    await expect(importEffectArtifact(new ArrayBuffer(0), { workerFactory })).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_LIMIT_EXCEEDED' })
    );
    await expect(
      importEffectArtifact(new Blob([Uint8Array.from([0x5b, 0x5d])]), { workerFactory })
    ).resolves.toEqual(expect.objectContaining({ primaryCode: 'BUNDLE_ARCHIVE_INVALID' }));
    const oversizedRaw = new Uint8Array(10 * 1024 * 1024 + 1);
    oversizedRaw[0] = 0x7b;
    await expect(importEffectArtifact(oversizedRaw, { workerFactory })).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_LIMIT_EXCEEDED' })
    );
    expect(workerFactory).not.toHaveBeenCalled();
  });

  it.each(['error', 'messageerror'] as const)('fails closed on worker %s', async (eventKind) => {
    const worker = new ImportWorkerFake(() => new Promise(() => undefined));
    const fixture = readRawFixture();
    const input = new ArrayBuffer(fixture.byteLength);
    new Uint8Array(input).set(fixture);
    const resultPromise = importEffectArtifact(input, {
      workerFactory: () => worker,
    });
    await vi.waitFor(() => expect(worker.postCount).toBe(1));

    if (eventKind === 'error' && worker.onerror) {
      Reflect.apply(worker.onerror, worker, [new Event('error')]);
    } else worker.onmessageerror?.(new MessageEvent('messageerror'));

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_IMPORT_WORKER_FAILURE' })
    );
  });
});

describe('disposable EffectV1 worker failures', () => {
  it('rejects unexpected response ports, dispatch errors, and cancellation after dispatch', async () => {
    const portWorker = new ImportWorkerFake(() => new Promise(() => undefined));
    const portResult = importEffectArtifact(readRawFixture(), { workerFactory: () => portWorker });
    await vi.waitFor(() => expect(portWorker.postCount).toBe(1));
    const channel = new MessageChannel();
    portWorker.onmessage?.(new MessageEvent('message', { data: {}, ports: [channel.port1] }));
    await expect(portResult).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_IMPORT_WORKER_FAILURE' })
    );
    channel.port1.close();
    channel.port2.close();

    const throwingWorker = new ImportWorkerFake(() => Promise.resolve({}));
    vi.spyOn(throwingWorker, 'postMessage').mockImplementationOnce(() => {
      throw new Error('clone failed');
    });
    await expect(
      importEffectArtifact(readRawFixture(), { workerFactory: () => throwingWorker })
    ).resolves.toEqual(expect.objectContaining({ primaryCode: 'BUNDLE_IMPORT_WORKER_FAILURE' }));

    const controller = new AbortController();
    const abortWorker = new ImportWorkerFake(() => new Promise(() => undefined));
    const abortResult = importEffectArtifact(readRawFixture(), {
      signal: controller.signal,
      workerFactory: () => abortWorker,
    });
    await vi.waitFor(() => expect(abortWorker.postCount).toBe(1));
    controller.abort();
    await expect(abortResult).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_IMPORT_CANCELLED' })
    );
  });

  it('constructs the bundled browser worker when no test factory is supplied', async () => {
    await expect(importEffectArtifact(readRawFixture())).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_IMPORT_WORKER_FAILURE' })
    );
  });
});

class ImportWorkerFake implements EffectImportWorkerLike {
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  postCount = 0;
  terminateCount = 0;

  constructor(private readonly handle: (message: unknown) => Promise<unknown>) {}

  postMessage(message: unknown): void {
    this.postCount += 1;
    void this.handle(message).then((data) => {
      this.onmessage?.(new MessageEvent('message', { data }));
    });
  }

  terminate(): void {
    this.terminateCount += 1;
  }
}

function readRawFixture(): Uint8Array {
  return new Uint8Array(
    readFileSync(
      new URL(
        '../../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/' +
          'neutral-standalone.sniptale-effect.json',
        import.meta.url
      )
    )
  );
}
