import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEffectBundleFailure } from '../../diagnostics';
import { importAnimationArtifactBytes } from '../../lottie-profile';
import { parseImportFailure } from './diagnostics';
import {
  createAnimationImportWorkerRequest,
  createAnimationImportWorkerResponse,
  parseAnimationImportWorkerRequest,
  parseAnimationImportWorkerResponse,
} from './protocol';
import { parseAnimationImportResult } from './result';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
function input() {
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
describe('animation import worker diagnostic boundary', () => {
  it('accepts only exact bounded failures', () => {
    const failure = createEffectBundleFailure('BUNDLE_DOCUMENT_INVALID', '$document', 'safe');
    const withEffectDiagnostics = {
      ...failure,
      effectDiagnostics: [{ code: 'EFFECT_SCHEMA_INVALID', path: '$', severity: 'warning' }],
    };

    expect(parseImportFailure({ ...failure })).toEqual(failure);
    expect(parseImportFailure(withEffectDiagnostics)).toEqual(withEffectDiagnostics);
    expect(parseImportFailure({ ...failure, extra: true })).toBeNull();
    expect(parseImportFailure({ ...failure, diagnostics: [] })).toBeNull();
    expect(
      parseImportFailure({
        ...failure,
        diagnostics: [{ code: 'UNKNOWN', path: '$', severity: 'error' }],
      })
    ).toBeNull();
    expect(
      parseImportFailure({
        ...failure,
        effectDiagnostics: [{ code: '', path: '$', severity: 'info' }],
      })
    ).toBeNull();
    expect(createEffectBundleFailure('BUNDLE_ENTRY_PATH_UNSAFE', '../secret.svg')).toMatchObject({
      diagnostics: [{ path: '$archive.entry' }],
    });
    expect(
      parseImportFailure({
        ...failure,
        diagnostics: [
          { code: 'BUNDLE_ENTRY_PATH_UNSAFE', path: '../secret.svg', severity: 'error' },
        ],
      })
    ).toBeNull();
  });
});

describe('animation import worker protocol', () => {
  it('accepts exact bounded requests and refuses the retired protocol', () => {
    const request = createAnimationImportWorkerRequest('request-1', input());
    expect(parseAnimationImportWorkerRequest(request)).toEqual({
      requestId: request.requestId,
      bytes: request.bytes,
    });
    for (const invalid of [
      { ...request, requestId: 'invalid id' },
      { ...request, bytes: new Uint8Array() },
      { ...request, extra: true },
      { ...request, token: 'sniptale:effect-bundle:import-v1' },
      { ...request, type: 'sniptale:effect-bundle:import-request', kind: 'raw-json' },
    ])
      expect(parseAnimationImportWorkerRequest(invalid)).toBeNull();
  });
  it('revalidates source bytes and exact result authority in the parent', async () => {
    const result = await importAnimationArtifactBytes(input());
    if (!result.ok) throw Error('Invalid fixture');
    const response = createAnimationImportWorkerResponse('request-1', result);
    await expect(
      parseAnimationImportWorkerResponse(response, 'request-1', result.archiveSha256)
    ).resolves.toEqual(result);
    await expect(
      parseAnimationImportWorkerResponse(response, 'request-2', result.archiveSha256)
    ).resolves.toBeNull();
    await expect(
      parseAnimationImportWorkerResponse(
        { ...response, token: 'wrong' },
        'request-1',
        result.archiveSha256
      )
    ).resolves.toBeNull();
    for (const invalid of [
      { ...response.result, extra: true },
      { ...response.result, archiveSha256: '0'.repeat(64) },
      { ...response.result, documents: [{ source: '{}', sha256: '0'.repeat(64) }] },
      { ...response.result, documents: [...result.documents, ...result.documents] },
      { ...response.result, kind: 'unknown' },
    ])
      await expect(parseAnimationImportResult(invalid, result.archiveSha256)).resolves.toBeNull();
  });
});
describe('animation import worker single-use lifecycle', () => {
  it('posts one parsed response, closes, and rejects a second capability use', async () => {
    const scope = createWorkerScopeStub();
    vi.stubGlobal('self', scope);
    await import('./index');
    const request = createAnimationImportWorkerRequest('request-1', input());

    scope.onmessage?.(new MessageEvent('message', { data: request, ports: [] }));
    scope.onmessage?.(new MessageEvent('message', { data: request, ports: [] }));

    await vi.waitFor(() => expect(scope.postMessage).toHaveBeenCalledOnce());
    expect(scope.close).toHaveBeenCalledTimes(2);
  });

  it('closes without executing malformed or port-bearing requests', async () => {
    const scope = createWorkerScopeStub();
    vi.stubGlobal('self', scope);
    await import('./index');

    scope.onmessage?.(new MessageEvent('message', { data: {}, ports: [] }));

    expect(scope.postMessage).not.toHaveBeenCalled();
    expect(scope.close).toHaveBeenCalledOnce();
  });

  it('closes transferred ports without executing their packet', async () => {
    const scope = createWorkerScopeStub();
    vi.stubGlobal('self', scope);
    await import('./index');
    const channel = new MessageChannel(),
      close = vi.spyOn(channel.port1, 'close');
    scope.onmessage?.(
      new MessageEvent('message', {
        data: createAnimationImportWorkerRequest('request-1', input()),
        ports: [channel.port1],
      })
    );
    expect(close).toHaveBeenCalledOnce();
    expect(scope.postMessage).not.toHaveBeenCalled();
    expect(scope.close).toHaveBeenCalledOnce();
    channel.port2.close();
  });
  it('closes without executing messages carrying a window origin', async () => {
    const scope = createWorkerScopeStub();
    vi.stubGlobal('self', scope);
    await import('./index');

    scope.onmessage?.(
      new MessageEvent('message', {
        data: createAnimationImportWorkerRequest('request-1', input()),
        origin: 'https://attacker.invalid',
      })
    );

    expect(scope.postMessage).not.toHaveBeenCalled();
    expect(scope.close).toHaveBeenCalledOnce();
  });
});

interface WorkerScopeStub {
  close: ReturnType<typeof vi.fn>;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
}

function createWorkerScopeStub(): WorkerScopeStub {
  return { close: vi.fn(), onmessage: null, postMessage: vi.fn() };
}
