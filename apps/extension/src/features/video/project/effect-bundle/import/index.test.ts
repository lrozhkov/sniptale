import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { importAnimationArtifactBytes } from '../lottie-profile';
import { importAnimationArtifact } from './index';
import {
  createAnimationImportWorkerResponse,
  parseAnimationImportWorkerRequest,
} from './worker/protocol';
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import type { EffectImportWorkerLike } from './index';

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

describe('disposable animation import worker boundary', () => {
  it('imports a self-contained raw document through one disposable worker', async () => {
    const worker = new ImportWorkerFake(async (message) => {
      const request = parseAnimationImportWorkerRequest(message);
      expect(request).not.toBeNull();
      const result = await importAnimationArtifactBytes(request!.bytes);
      return createAnimationImportWorkerResponse(request!.requestId, result);
    });

    const result = await importAnimationArtifact(readRawFixture(), {
      workerFactory: () => worker,
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'lottie-json',
        ok: true,
      })
    );
    expect(worker.postCount).toBe(1);
    expect(worker.terminateCount).toBe(1);
  });

  it('terminates and returns a stable failure on timeout', async () => {
    vi.useFakeTimers();
    const worker = new ImportWorkerFake(() => new Promise(() => undefined));
    const resultPromise = importAnimationArtifact(readRawFixture(), {
      timeoutMs: 10,
      workerFactory: () => worker,
    });

    await vi.waitFor(() => expect(worker.postCount).toBe(1));
    await vi.advanceTimersByTimeAsync(10);

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({ ok: false, primaryCode: 'BUNDLE_IMPORT_TIMEOUT' })
    );
    expect(worker.terminateCount).toBe(1);
    vi.useRealTimers();
  });
});

describe('disposable animation import rejection', () => {
  it('rejects malformed or mismatched worker responses without exposing their content', async () => {
    const worker = new ImportWorkerFake(async () => ({
      requestId: 'attacker-controlled',
      result: { ok: true },
      token: 'sniptale:effect-bundle:import-v1',
      type: 'sniptale:effect-bundle:import-response',
    }));

    await expect(
      importAnimationArtifact(readRawFixture(), { workerFactory: () => worker })
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
      importAnimationArtifact(readRawFixture(), { signal: controller.signal, workerFactory })
    ).resolves.toEqual(
      expect.objectContaining({ ok: false, primaryCode: 'BUNDLE_IMPORT_CANCELLED' })
    );
    expect(workerFactory).not.toHaveBeenCalled();
  });

  it('fails raw animations that depend on unresolved path assets', async () => {
    const result = await importAnimationArtifactBytes(
      new TextEncoder().encode(
        JSON.stringify({
          v: '5.12.2',
          fr: 30,
          ip: 0,
          op: 60,
          w: 320,
          h: 180,
          ddd: 0,
          assets: [{ id: 'image', w: 1, h: 1, p: 'missing.png', u: '' }],
          layers: [],
        })
      )
    );
    expect(result).toMatchObject({ ok: false, primaryCode: 'BUNDLE_ASSET_CLOSURE' });
  });
});

describe('disposable animation artifact preflight', () => {
  it('rejects empty, unknown, and oversized artifacts before worker creation', async () => {
    const workerFactory = vi.fn();

    await expect(importAnimationArtifact(new ArrayBuffer(0), { workerFactory })).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_LIMIT_EXCEEDED' })
    );
    await expect(
      importAnimationArtifact(new Blob([Uint8Array.from([0x5b, 0x5d])]), { workerFactory })
    ).resolves.toEqual(expect.objectContaining({ primaryCode: 'BUNDLE_ARCHIVE_INVALID' }));
    const oversizedRaw = new Uint8Array(10 * 1024 * 1024 + 1);
    oversizedRaw[0] = 0x7b;
    await expect(importAnimationArtifact(oversizedRaw, { workerFactory })).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_LIMIT_EXCEEDED' })
    );
    expect(workerFactory).not.toHaveBeenCalled();
  });

  it.each(['error', 'messageerror'] as const)('fails closed on worker %s', async (eventKind) => {
    const worker = new ImportWorkerFake(() => new Promise(() => undefined));
    const fixture = readRawFixture();
    const input = new ArrayBuffer(fixture.byteLength);
    new Uint8Array(input).set(fixture);
    const resultPromise = importAnimationArtifact(input, {
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

describe('disposable animation worker failures', () => {
  it('rejects unexpected response ports, dispatch errors, and cancellation after dispatch', async () => {
    const portWorker = new ImportWorkerFake(() => new Promise(() => undefined));
    const portResult = importAnimationArtifact(readRawFixture(), {
      workerFactory: () => portWorker,
    });
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
      importAnimationArtifact(readRawFixture(), { workerFactory: () => throwingWorker })
    ).resolves.toEqual(expect.objectContaining({ primaryCode: 'BUNDLE_IMPORT_WORKER_FAILURE' }));

    const controller = new AbortController();
    const abortWorker = new ImportWorkerFake(() => new Promise(() => undefined));
    const abortResult = importAnimationArtifact(readRawFixture(), {
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
    await expect(importAnimationArtifact(readRawFixture())).resolves.toEqual(
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

function readLegacyFixture(): Uint8Array {
  return new Uint8Array(
    readFileSync(new URL('../fixtures/retained/title.sniptale-effect.json', import.meta.url))
  );
}

describe('disposable animation worker boundary', () => {
  const input = () =>
    new TextEncoder().encode(
      JSON.stringify({
        v: '5.12.2',
        fr: 30,
        ip: 0,
        op: 60,
        w: 320,
        h: 180,
        nm: 'Animation worker',
        ddd: 0,
        assets: [],
        layers: [],
      })
    );
  const workerFor = (
    modify: (value: ReturnType<typeof createAnimationImportWorkerResponse>) => unknown = (value) =>
      value
  ) =>
    new ImportWorkerFake(async (value) => {
      const request = parseAnimationImportWorkerRequest(value);
      if (!request) throw new Error('Invalid test request');
      return modify(
        createAnimationImportWorkerResponse(
          request.requestId,
          await importAnimationArtifactBytes(request.bytes)
        )
      );
    });
  it('imports through the bundled worker protocol and reconstructs only admitted sources in the parent', async () => {
    const worker = workerFor();
    const result = await importAnimationArtifact(input(), { workerFactory: () => worker });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]!.template.label.en).toBe('Animation worker');
    }
    expect(worker.terminateCount).toBe(1);
  });
  it('refuses a response for another file, another request, or damaged document bytes', async () => {
    for (const mutate of [
      (value: ReturnType<typeof createAnimationImportWorkerResponse>) => ({
        ...value,
        requestId: 'other',
      }),
      (value: ReturnType<typeof createAnimationImportWorkerResponse>) => ({
        ...value,
        result: { ...value.result, archiveSha256: '0'.repeat(64) },
      }),
      (value: ReturnType<typeof createAnimationImportWorkerResponse>) => ({
        ...value,
        result: value.result.ok
          ? {
              ...value.result,
              documents: value.result.documents.map((document) => ({ ...document, source: '{}' })),
            }
          : value.result,
      }),
    ]) {
      const worker = workerFor(mutate);
      await expect(
        importAnimationArtifact(input(), { workerFactory: () => worker })
      ).resolves.toMatchObject({ ok: false, primaryCode: 'BUNDLE_IMPORT_WORKER_FAILURE' });
      expect(worker.terminateCount).toBe(1);
    }
  });
  it('keeps old EffectV1 bytes unsupported instead of converting their document', async () => {
    const worker = workerFor();
    await expect(
      importAnimationArtifact(readLegacyFixture(), { workerFactory: () => worker })
    ).resolves.toMatchObject({ ok: false, primaryCode: 'BUNDLE_ENGINE_UNSUPPORTED' });
  });
  it('does not create a worker when cancellation occurs during asynchronous input reading', async () => {
    const controller = new AbortController();
    const blob = new Blob([input()]);
    vi.spyOn(blob, 'arrayBuffer').mockImplementation(async () => {
      controller.abort();
      return input().buffer;
    });
    const factory = vi.fn(() => workerFor());
    await expect(
      importAnimationArtifact(blob, { signal: controller.signal, workerFactory: factory })
    ).resolves.toMatchObject({ ok: false, primaryCode: 'BUNDLE_IMPORT_CANCELLED' });
    expect(factory).not.toHaveBeenCalled();
  });
  it('terminates an unresponsive animation worker and permits an independent retry', async () => {
    vi.useFakeTimers();
    try {
      const worker = new ImportWorkerFake(() => new Promise(() => undefined));
      const pending = importAnimationArtifact(input(), {
        timeoutMs: 5,
        workerFactory: () => worker,
      });
      await vi.waitFor(() => expect(worker.postCount).toBe(1));
      await vi.advanceTimersByTimeAsync(5);
      await expect(pending).resolves.toMatchObject({
        ok: false,
        primaryCode: 'BUNDLE_IMPORT_TIMEOUT',
      });
      expect(worker.terminateCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
    await expect(
      importAnimationArtifact(input(), { workerFactory: () => workerFor() })
    ).resolves.toMatchObject({ ok: true });
  });
});

function readRawFixture(): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      v: '5.12.2',
      fr: 30,
      ip: 0,
      op: 60,
      w: 320,
      h: 180,
      ddd: 0,
      assets: [],
      layers: [],
    })
  );
}

describe('portable animation pack worker admission', () => {
  const metadata = { packId: 'test.pack', label: { en: 'Portable pack' } };
  const source = JSON.stringify({
    format: 'sniptale-animation',
    version: 1,
    id: 'packed',
    label: { en: 'Packed' },
    controls: [],
    bindings: [],
    resources: [],
    animation: JSON.parse(new TextDecoder().decode(readRawFixture())),
  });
  async function pack() {
    const path = 'animations/packed.sniptale-animation.json';
    const bytes = new TextEncoder().encode(source);
    const zip = new JSZip();
    zip.file(path, bytes);
    zip.file(
      'manifest.json',
      JSON.stringify({
        format: 'sniptale-animation-pack',
        version: 1,
        metadata,
        documents: [
          {
            id: 'packed',
            path,
            byteLength: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        ],
      })
    );
    return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  }
  it('accepts a checked portable ZIP through the disposable worker', async () => {
    const worker = new ImportWorkerFake(async (message) => {
      const request = parseAnimationImportWorkerRequest(message);
      if (!request) throw new Error('Invalid test request');
      const parsed = await importAnimationArtifactBytes(request.bytes);
      expect(parsed).toMatchObject({ ok: true, kind: 'sniptale-animation', package: metadata });
      return createAnimationImportWorkerResponse(request.requestId, parsed);
    });
    await expect(
      importAnimationArtifact(await pack(), { workerFactory: () => worker })
    ).resolves.toMatchObject({ ok: true, kind: 'sniptale-animation', package: metadata });
    expect(worker.terminateCount).toBe(1);
  });
  it.each(['raw-with-package', 'zip-without-package'] as const)(
    'rejects contradictory %s worker results',
    async (variant) => {
      const worker = new ImportWorkerFake(async (message) => {
        const request = parseAnimationImportWorkerRequest(message);
        if (!request) throw new Error('Invalid test request');
        const parsed = await importAnimationArtifactBytes(request.bytes);
        if (!parsed.ok) throw new Error('Invalid test input');
        const { package: _metadata, ...withoutPackage } = parsed;
        return createAnimationImportWorkerResponse(
          request.requestId,
          variant === 'raw-with-package' ? { ...withoutPackage, package: metadata } : withoutPackage
        );
      });
      const bytes =
        variant === 'raw-with-package' ? new TextEncoder().encode(source) : await pack();
      await expect(
        importAnimationArtifact(bytes, { workerFactory: () => worker })
      ).resolves.toMatchObject({ ok: false, primaryCode: 'BUNDLE_IMPORT_WORKER_FAILURE' });
      expect(worker.terminateCount).toBe(1);
    }
  );
});
