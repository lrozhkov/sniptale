import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncProductExecution } from './product-execution';
const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  authentication: vi.fn(),
  requests: vi.fn(),
  close: vi.fn(),
  webdav: vi.fn(),
  verify: vi.fn(),
  refresh: vi.fn(),
  cached: vi.fn(),
  receive: vi.fn(),
  parse: vi.fn(),
  ready: vi.fn(),
}));
vi.mock('../../composition/persistence/remote-connection/store', () => ({
  loadSyncConnection: mocks.connection,
  loadSyncConnectionAuthentication: mocks.authentication,
}));
vi.mock('../../workflows/sync-transfer/connection-requests', () => ({
  createSyncConnectionRequests: mocks.requests,
}));
vi.mock('../../workflows/sync-transfer/webdav', () => ({ createWebdavRemoteStore: mocks.webdav }));
vi.mock('../../workflows/sync-transfer/workspace', () => ({
  verifySyncWorkspaceIdentity: mocks.verify,
}));
vi.mock('../../workflows/sync-transfer/catalog-refresh', () => ({
  refreshPersistedSyncCatalog: mocks.refresh,
}));
vi.mock('../../workflows/sync-transfer/catalog-view', () => ({
  readCheckedPersistedSyncCatalog: mocks.cached,
}));
vi.mock('../../workflows/sync-transfer/incoming-selected', () => ({
  receiveSelectedCatalogRoot: mocks.receive,
}));
vi.mock('../../workflows/sync-transfer/prepared-root', () => ({
  parsePortableSyncRoot: mocks.parse,
}));
vi.mock('../runtime/data-readiness', () => ({
  offscreenDataReadiness: { ensureAssets: mocks.ready },
}));
import { hashSyncText } from '../../workflows/sync-transfer/wire-record';
const authorization = { incarnation: '11111111-1111-4111-8111-111111111111', revision: 1 };
const scope = { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 1 };
const selected = {
  rootKind: 'video-project' as const,
  rootId: 'project',
  operationId: 'operation',
  sourceDigest: hashSyncText('{}'),
};
const metadata = {
  binding: { ...scope, rootUrl: 'https://dav.test/root/', accountId: 'alice', provider: 'webdav' },
  identity: authorization,
  phase: 'active',
};
function catalog() {
  return {
    roots: new Map([
      [
        JSON.stringify(['video-project', 'project']),
        {
          rootKind: 'video-project',
          rootId: 'project',
          heads: ['operation'],
          deleted: false,
          blocked: false,
          conflict: false,
          unavailableDependencies: [],
        },
      ],
    ]),
    operations: new Map([
      [
        'operation',
        { operationText: '{}', operation: { envelope: {}, objects: [] }, attempts: [] },
      ],
    ]),
    invalid: [],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connection.mockResolvedValue(metadata);
  mocks.close.mockResolvedValue(undefined);
  mocks.requests.mockReturnValue({ request: vi.fn(), close: mocks.close });
  mocks.webdav.mockResolvedValue({ read: vi.fn(), list: vi.fn() });
  mocks.verify.mockResolvedValue(undefined);
  mocks.ready.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(catalog());
  mocks.cached.mockResolvedValue(catalog());
  mocks.parse.mockResolvedValue({ kind: 'video-project', metadata: {}, envelope: { objects: [] } });
  mocks.receive.mockResolvedValue({
    rootKind: 'video-project',
    rootId: 'project',
    operationId: 'operation',
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('product execution through existing sync owners', () => {
  it('reads immutable thumbnail metadata without DAV listing and reuses one checked snapshot', async () => {
    const first = createSyncProductExecution(
      {
        ...scopeBinding(),
        work: { kind: 'thumbnail-read', selection: selected },
        signal: new AbortController().signal,
      },
      async () => true
    );
    await expect(first.run()).resolves.toMatchObject({
      state: 'ready',
      completion: { kind: 'thumbnail', dataUrl: null },
      containment: 'contained',
    });
    const second = createSyncProductExecution(
      {
        ...scopeBinding(),
        work: { kind: 'thumbnail-read', selection: selected },
        signal: new AbortController().signal,
      },
      async () => true
    );
    await expect(second.run()).resolves.toMatchObject({ state: 'ready' });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.cached).toHaveBeenCalledTimes(1);
    expect(mocks.receive).not.toHaveBeenCalled();
    await second.drain();
  });
  it('freshly refreshes a pinned project then delegates native admission without caller counters', async () => {
    const signal = new AbortController().signal;
    const execution = createSyncProductExecution(
      { ...scopeBinding(), work: { kind: 'replica-prepare', selection: selected }, signal },
      async () => true
    );
    await expect(execution.run()).resolves.toMatchObject({
      state: 'ready',
      completion: { kind: 'replica', selection: selected },
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.receive).toHaveBeenCalledWith(
      expect.objectContaining({ scope, authorization, selection: selected, signal })
    );
    expect(mocks.receive.mock.calls[0]?.[0]).not.toHaveProperty('admission');
    await execution.drain();
  });
  it('refuses a changed displayed version before native preparation', async () => {
    const execution = createSyncProductExecution(
      {
        ...scopeBinding(),
        work: { kind: 'replica-prepare', selection: { ...selected, sourceDigest: 'f'.repeat(64) } },
        signal: new AbortController().signal,
      },
      async () => true
    );
    await expect(execution.run()).resolves.toMatchObject({
      state: 'failed',
      failureCode: 'selection-changed',
    });
    expect(mocks.receive).not.toHaveBeenCalled();
    await execution.drain();
  });
  it('aborted admission starts neither native readiness nor transport and drain failure remains unsafe', async () => {
    const controller = new AbortController();
    controller.abort();
    mocks.close.mockRejectedValue(new Error('private transport detail'));
    const execution = createSyncProductExecution(
      {
        ...scopeBinding(),
        work: { kind: 'catalog-refresh', bypassCache: false },
        signal: controller.signal,
      },
      async () => true
    );
    await expect(execution.run()).resolves.toMatchObject({
      state: 'interrupted',
      failureCode: 'interrupted',
      containment: 'unsafe',
    });
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(mocks.webdav).not.toHaveBeenCalled();
    mocks.close.mockResolvedValue(undefined);
    await execution.drain();
  });
});
function scopeBinding() {
  return { scope, authorization };
}

const thumbnailBytes = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII='
  ),
  (character) => character.charCodeAt(0)
);
function installThumbnail(
  options: {
    digest?: string;
    declaredSize?: number;
    mimeType?: string;
    bytes?: Uint8Array;
    width?: number;
    height?: number;
    missingBinding?: boolean;
    parsedKind?: 'image' | 'video-project' | 'media';
  } = {}
) {
  const bytes = options.bytes ?? thumbnailBytes;
  const object = {
    objectId: 'thumbnail',
    size: options.declaredSize ?? thumbnailBytes.byteLength,
    mimeType: options.mimeType ?? 'image/png',
  };
  const checked = {
    ...catalog(),
    operations: new Map([
      [
        'operation',
        {
          operationText: '{}',
          operation: {
            envelope: {},
            objects: [
              {
                objectId: object.objectId,
                sha256: options.digest ?? createHash('sha256').update(thumbnailBytes).digest('hex'),
              },
            ],
          },
          attempts: options.missingBinding
            ? []
            : [{ objects: [{ objectId: object.objectId, remoteKey: 'thumbnail-key' }] }],
        },
      ],
    ]),
  };
  mocks.cached.mockResolvedValue(checked);
  const read = vi.fn(
    async () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, 8));
          controller.enqueue(bytes.slice(8));
          controller.close();
        },
      })
  );
  const list = vi.fn();
  mocks.webdav.mockResolvedValue({ read, list });
  const kind = options.parsedKind ?? 'video-project';
  mocks.parse.mockResolvedValue({
    kind,
    metadata:
      kind === 'image'
        ? { presentation: { thumbnailObjectId: object.objectId } }
        : { thumbnail: { objectId: object.objectId } },
    envelope: { objects: [object] },
  });
  const bitmapClose = vi.fn();
  const decode = vi.fn(async (_blob: Blob) => ({
    width: options.width ?? 1,
    height: options.height ?? 1,
    close: bitmapClose,
  }));
  vi.stubGlobal('createImageBitmap', decode);
  return { read, list, decode, bitmapClose };
}

function thumbnailExecution() {
  return createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'thumbnail-read', selection: selected },
      signal: new AbortController().signal,
    },
    async () => true
  );
}

it.each(['image', 'video-project'] as const)(
  'returns only a verified %s presentation thumbnail without materializing originals',
  async (parsedKind) => {
    const { read, list, decode, bitmapClose } = installThumbnail({ parsedKind });
    const execution = thumbnailExecution();
    await expect(execution.run()).resolves.toEqual({
      state: 'ready',
      failureCode: null,
      containment: 'contained',
      completion: {
        kind: 'thumbnail',
        width: 1,
        height: 1,
        dataUrl: `data:image/png;base64,${btoa(String.fromCharCode(...thumbnailBytes))}`,
      },
    });
    expect(read).toHaveBeenCalledExactlyOnceWith('thumbnail-key', expect.any(AbortSignal));
    expect(list).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.receive).not.toHaveBeenCalled();
    const decodedBlob = decode.mock.calls[0]?.[0];
    expect(decodedBlob?.type).toBe('image/png');
    expect(new Uint8Array(await decodedBlob!.arrayBuffer())).toEqual(thumbnailBytes);
    expect(bitmapClose).toHaveBeenCalledOnce();
    await execution.drain();
  }
);

it.each([
  ['digest mismatch', { digest: 'f'.repeat(64) }],
  ['truncated bytes', { bytes: thumbnailBytes.slice(0, 12) }],
  ['excess bytes', { declaredSize: 12 }],
  ['missing binding', { missingBinding: true }],
  ['zero width', { width: 0 }],
  ['excess width', { width: 8193 }],
  ['excess pixels', { width: 8192, height: 8192 }],
] as const)(
  'refuses %s without publishing a thumbnail or native root',
  async (_reason, options) => {
    installThumbnail(options);
    const execution = thumbnailExecution();
    await expect(execution.run()).resolves.toEqual({
      state: 'failed',
      failureCode: 'invalid-data',
      completion: null,
      containment: 'contained',
    });
    expect(mocks.receive).not.toHaveBeenCalled();
    await execution.drain();
  }
);

it.each([
  { declaredSize: 1024 * 1024 + 1 },
  { mimeType: 'text/html' },
  { parsedKind: 'media' as const },
])(
  'uses a metadata-only fallback when no supported bounded thumbnail is available %#',
  async (options) => {
    const { read, decode } = installThumbnail(options);
    const execution = thumbnailExecution();
    await expect(execution.run()).resolves.toMatchObject({
      state: 'ready',
      completion: { kind: 'thumbnail', dataUrl: null, width: 0, height: 0 },
    });
    expect(read).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expect(mocks.receive).not.toHaveBeenCalled();
    await execution.drain();
  }
);

it('verifies workspace identity and refreshes only catalog metadata with the explicit cache choice', async () => {
  const workspace = {
    spaceId: 'space',
    bootstrapId: authorization.incarnation,
    fingerprint: 'a'.repeat(64),
  };
  mocks.connection.mockResolvedValue({ ...metadata, workspace });
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'catalog-refresh', bypassCache: true },
      signal: new AbortController().signal,
    },
    async () => true
  );
  await expect(execution.run()).resolves.toMatchObject({
    state: 'ready',
    completion: { kind: 'catalog', count: 1 },
    containment: 'contained',
  });
  expect(mocks.verify).toHaveBeenCalledOnce();
  expect(mocks.verify).toHaveBeenCalledBefore(mocks.refresh);
  expect(mocks.refresh).toHaveBeenCalledWith(
    expect.anything(),
    scope.spaceId,
    scope.connectionGeneration,
    expect.any(AbortSignal),
    { bypassCache: true }
  );
  expect(mocks.receive).not.toHaveBeenCalled();
  await execution.drain();
});

it.each([
  ['authentication', 'authentication'],
  ['access-denied', 'access-denied'],
  ['storage-full', 'storage-full'],
  ['missing', 'unavailable'],
  ['unavailable', 'unavailable'],
  ['transport', 'temporary'],
  ['temporary', 'temporary'],
])('exposes only the finite %s failure code after provider refusal', async (code, expected) => {
  mocks.refresh.mockRejectedValue(Object.assign(new Error('private provider body'), { code }));
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'catalog-refresh', bypassCache: false },
      signal: new AbortController().signal,
    },
    async () => true
  );
  await expect(execution.run()).resolves.toEqual({
    state: 'failed',
    failureCode: expected,
    completion: null,
    containment: 'contained',
  });
  expect(mocks.receive).not.toHaveBeenCalled();
  await execution.drain();
});

it('reports native quota refusal without returning partial preparation', async () => {
  mocks.receive.mockRejectedValue(new DOMException('private storage detail', 'QuotaExceededError'));
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'replica-prepare', selection: selected },
      signal: new AbortController().signal,
    },
    async () => true
  );
  await expect(execution.run()).resolves.toEqual({
    state: 'failed',
    failureCode: 'storage-full',
    completion: null,
    containment: 'contained',
  });
  await execution.drain();
});

it('does not prepare a native root when authorization changes while catalog IO is pending', async () => {
  mocks.refresh.mockImplementation(async () => {
    mocks.connection.mockResolvedValue({ ...metadata, phase: 'paused' });
    return catalog();
  });
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'replica-prepare', selection: selected },
      signal: new AbortController().signal,
    },
    async () => true
  );
  await expect(execution.run()).resolves.toMatchObject({ state: 'failed', completion: null });
  expect(mocks.receive).not.toHaveBeenCalled();
  await execution.drain();
});

it('rechecks a missing cached selection once and refuses absent thumbnail metadata without DAV listing', async () => {
  mocks.cached.mockResolvedValue(null);
  const execution = thumbnailExecution();
  await expect(execution.run()).resolves.toMatchObject({ state: 'failed', completion: null });
  expect(mocks.cached).toHaveBeenCalledTimes(2);
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.receive).not.toHaveBeenCalled();
  await execution.drain();
});
