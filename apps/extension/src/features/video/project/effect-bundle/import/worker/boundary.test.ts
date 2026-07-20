import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEffectBundleFailure } from '../../diagnostics';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectArtifactInCurrentThread } from '../artifact';
import { parseImportFailure } from './diagnostics';
import {
  collectEffectImportResultTransferables,
  createEffectImportWorkerRequest,
  createEffectImportWorkerResponse,
  parseEffectImportWorkerRequest,
  parseEffectImportWorkerResponse,
} from './protocol';
import { parseEffectImportResult } from './result';

const HASH = 'a'.repeat(64);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('EffectV1 import worker diagnostic boundary', () => {
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

describe('EffectV1 import worker protocol', () => {
  it('round-trips one exact request and rejects malformed authority fields', () => {
    const bytes = Uint8Array.from([0x7b, 0x7d]);
    const request = createEffectImportWorkerRequest('request-1', 'raw-json', bytes);

    expect(parseEffectImportWorkerRequest(request)).toEqual(request);
    expect(parseEffectImportWorkerRequest({ ...request, requestId: 'invalid id' })).toBeNull();
    expect(parseEffectImportWorkerRequest({ ...request, bytes: new Uint8Array() })).toBeNull();
    expect(parseEffectImportWorkerRequest({ ...request, kind: 'legacy' })).toBeNull();
    expect(parseEffectImportWorkerRequest({ ...request, extra: true })).toBeNull();
  });

  it('round-trips a successful result and rejects mismatched responses', async () => {
    const result = await importEffectArtifactInCurrentThread('raw-json', readRawFixture());
    expect(result.ok).toBe(true);
    const response = createEffectImportWorkerResponse('request-1', result);

    expect(parseEffectImportWorkerResponse(response, 'request-1')).toEqual(result);
    expect(parseEffectImportWorkerResponse(response, 'request-2')).toBeNull();
    expect(
      parseEffectImportWorkerResponse({ ...response, token: 'wrong' }, 'request-1')
    ).toBeNull();
    expect(parseEffectImportResult({ ...result, extra: true })).toBeNull();
    expect(parseEffectImportResult({ artifact: { kind: 'unknown' }, ok: true })).toBeNull();
  });
});

describe('EffectV1 import worker bundle result validation', () => {
  it('revalidates bundle documents and materialized assets after structured clone', async () => {
    const corpusCase = EFFECT_BUNDLE_CORPUS.find(
      ({ accepted, artifact }) => accepted && artifact.includes('asset-bearing-conformance')
    )!;
    const result = await importEffectArtifactInCurrentThread(
      'bundle-zip',
      readEffectBundleCorpusArchive(corpusCase)
    );
    if (!result.ok || result.artifact.kind !== 'bundle-zip') {
      throw new Error('Expected accepted asset-bearing bundle');
    }

    expect(parseEffectImportResult(result)).toEqual(result);
    expect(
      parseEffectImportResult({
        ...result,
        artifact: {
          ...result.artifact,
          bundle: { ...result.artifact.bundle, archiveSha256: 'invalid' },
        },
      })
    ).toBeNull();
    expect(
      parseEffectImportResult({
        ...result,
        artifact: {
          ...result.artifact,
          bundle: { ...result.artifact.bundle, documents: [] },
        },
      })
    ).toBeNull();
    const document = result.artifact.bundle.documents[0]!;
    expect(
      parseEffectImportResult({
        ...result,
        artifact: {
          ...result.artifact,
          bundle: {
            ...result.artifact.bundle,
            documents: [{ ...document, assets: [{ ...document.assets[0], path: '../escape' }] }],
          },
        },
      })
    ).toBeNull();
  });
});

describe('EffectV1 import worker raw result validation', () => {
  it('rejects malformed raw document envelopes and assets', async () => {
    const result = await importEffectArtifactInCurrentThread('raw-json', readRawFixture());
    if (!result.ok || result.artifact.kind !== 'raw-json') throw new Error('Expected raw fixture');
    const imported = result.artifact.document;

    expect(
      parseEffectImportResult({
        ...result,
        artifact: { ...result.artifact, document: { ...imported, sourceSha256: 'invalid' } },
      })
    ).toBeNull();
    expect(
      parseEffectImportResult({
        ...result,
        artifact: {
          ...result.artifact,
          document: { ...imported, document: { ...imported.document, document: {} } },
        },
      })
    ).toBeNull();
    expect(
      parseEffectImportResult({
        ...result,
        artifact: {
          ...result.artifact,
          document: {
            ...imported,
            document: { ...imported.document, assets: 'invalid' },
          },
        },
      })
    ).toBeNull();
  });
});

describe('EffectV1 import worker transfer ownership', () => {
  it('collects unique asset buffers only from successful artifacts', async () => {
    const result = await importEffectArtifactInCurrentThread('raw-json', readRawFixture());
    if (!result.ok || result.artifact.kind !== 'raw-json') throw new Error('Expected raw fixture');
    const bytes = Uint8Array.from([1, 2, 3]);
    const asset = {
      byteLength: bytes.byteLength,
      bytes,
      id: 'asset',
      kind: 'image' as const,
      mimeType: 'image/png',
      sha256: HASH,
    };
    result.artifact.document.document.assets = [asset, { ...asset, id: 'asset-copy' }];

    expect(collectEffectImportResultTransferables(result)).toEqual([bytes.buffer]);
    expect(
      collectEffectImportResultTransferables(
        createEffectBundleFailure('BUNDLE_ARCHIVE_INVALID', '$archive')
      )
    ).toEqual([]);
  });
});

describe('EffectV1 import worker single-use lifecycle', () => {
  it('posts one parsed response, closes, and rejects a second capability use', async () => {
    const scope = createWorkerScopeStub();
    vi.stubGlobal('self', scope);
    await import('./index');
    const request = createEffectImportWorkerRequest('request-1', 'raw-json', readRawFixture());

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

  it('closes without executing messages carrying a window origin', async () => {
    const scope = createWorkerScopeStub();
    vi.stubGlobal('self', scope);
    await import('./index');

    scope.onmessage?.(
      new MessageEvent('message', {
        data: createEffectImportWorkerRequest('request-1', 'raw-json', readRawFixture()),
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

function readRawFixture(): Uint8Array {
  return new Uint8Array(
    readFileSync(
      new URL(
        '../../../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/' +
          'neutral-standalone.sniptale-effect.json',
        import.meta.url
      )
    )
  );
}
