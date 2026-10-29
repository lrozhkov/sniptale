import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncProductExecution } from './product-execution';
const mocks = vi.hoisted(() => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  release: vi.fn(),
  trim: vi.fn(),
  index: vi.fn(),
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
  prepareEditing: vi.fn(),
  locallyReady: vi.fn(),
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ info: mocks.logInfo, warn: mocks.logWarn }),
}));
vi.mock('../../workflows/sync-transfer/native-cache', () => ({
  releaseNativeEditingRoot: mocks.release,
}));
vi.mock('../../workflows/sync-transfer/native-cache-policy', () => ({
  trimNativeCache: mocks.trim,
}));
vi.mock('../../workflows/sync-transfer/residency-copy', () => ({
  indexCatalogCopies: mocks.index,
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
vi.mock('../../workflows/sync-transfer/native-residency', () => ({
  prepareNativeEditingRoot: mocks.prepareEditing,
  isNativeEditingRootReady: mocks.locallyReady,
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
  mocks.prepareEditing.mockResolvedValue({ downloaded: 0 });
  mocks.locallyReady.mockResolvedValue(true);
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

it('invalidates Gallery after catalogue refresh and after committed native incoming publication', async () => {
  let commit!: (value: typeof selected) => void;
  let entered!: () => void;
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const committed = new Promise<typeof selected>((resolve) => {
    commit = resolve;
  });
  mocks.receive.mockImplementationOnce(() => {
    entered();
    return committed;
  });
  const notify = vi.fn();
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'replica-prepare', selection: selected },
      signal: new AbortController().signal,
    },
    async () => true,
    notify
  );
  const running = execution.run();
  await reached;
  expect(notify).toHaveBeenCalledOnce();
  commit(selected);
  await expect(running).resolves.toMatchObject({ state: 'ready' });
  expect(notify).toHaveBeenCalledTimes(2);
});

it('keeps successful catalogue work when its Gallery advisory fails', async () => {
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'catalog-refresh', bypassCache: false },
      signal: new AbortController().signal,
    },
    async () => true,
    () => {
      throw new Error('advisory unavailable');
    }
  );
  await expect(execution.run()).resolves.toMatchObject({
    state: 'ready',
    completion: { kind: 'catalog', count: 1 },
  });
});

it('refreshes metadata and delegates automatic native work inside the checked connection lifetime', async () => {
  const signal = new AbortController().signal;
  const automatic = {
    run: vi.fn().mockResolvedValue({ applied: 1, deferred: 1, remaining: true }),
  };
  const changed = vi.fn();
  const execution = createSyncProductExecution(
    { ...scopeBinding(), work: { kind: 'automatic-sync' }, signal },
    async () => true,
    changed,
    undefined,
    automatic
  );
  await expect(execution.run()).resolves.toMatchObject({
    state: 'ready',
    containment: 'contained',
    completion: { kind: 'automatic', applied: 1, deferred: 1, remaining: true },
  });
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(automatic.run).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      scope,
      authorization,
      catalog: expect.objectContaining({ roots: expect.any(Map) }),
      signal,
    })
  );
  expect(mocks.receive).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledTimes(2);
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('does not grant automatic native work after connection authority changes during catalog refresh', async () => {
  const automatic = { run: vi.fn() };
  mocks.refresh.mockImplementationOnce(async () => {
    mocks.connection.mockResolvedValue({
      ...metadata,
      identity: { ...authorization, revision: 2 },
    });
    return catalog();
  });
  const execution = createSyncProductExecution(
    { ...scopeBinding(), work: { kind: 'automatic-sync' }, signal: new AbortController().signal },
    async () => true,
    undefined,
    undefined,
    automatic
  );
  await expect(execution.run()).resolves.toMatchObject({
    state: 'failed',
    containment: 'contained',
  });
  expect(automatic.run).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('reports ready only after committed native editing dependencies finish preparation', async () => {
  let finish!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  mocks.prepareEditing.mockImplementationOnce(async () => {
    entered();
    await gate;
    return { downloaded: 1 };
  });
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'replica-prepare', selection: selected },
      signal: new AbortController().signal,
    },
    async () => true
  );
  let complete = false;
  const run = execution.run().then((result) => {
    complete = true;
    return result;
  });
  await started;
  expect(complete).toBe(false);
  expect(mocks.prepareEditing).toHaveBeenCalledWith(
    expect.objectContaining({
      root: { rootKind: selected.rootKind, rootId: selected.rootId },
      authorization,
    })
  );
  finish();
  await expect(run).resolves.toMatchObject({ state: 'ready', completion: { kind: 'replica' } });
  await execution.drain();
});

it('keeps a completed native commit visible when missing-byte preparation is interrupted', async () => {
  const controller = new AbortController();
  const notify = vi.fn();
  mocks.prepareEditing.mockImplementationOnce(async () => {
    controller.abort();
    throw new DOMException('Cancelled', 'AbortError');
  });
  mocks.locallyReady.mockResolvedValueOnce(false);
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'replica-prepare', selection: selected },
      signal: controller.signal,
    },
    async () => true,
    notify
  );
  await expect(execution.run()).resolves.toMatchObject({ state: 'interrupted' });
  expect(notify).toHaveBeenCalledTimes(2);
  await execution.drain();
});

it('preserves late-cancel completion only when all committed editing bytes are locally ready', async () => {
  const controller = new AbortController();
  mocks.prepareEditing.mockImplementationOnce(async () => {
    controller.abort();
    throw new DOMException('Cancelled', 'AbortError');
  });
  mocks.locallyReady.mockResolvedValueOnce(true);
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'replica-prepare', selection: selected },
      signal: controller.signal,
    },
    async () => true
  );
  await expect(execution.run()).resolves.toMatchObject({
    state: 'ready',
    completion: { kind: 'replica' },
  });
  await execution.drain();
});

it('restores a native root without catalog enumeration or applying a remote revision', async () => {
  const root = { rootKind: 'video-project' as const, rootId: 'project' };
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'native-prepare', root },
      signal: new AbortController().signal,
    },
    async () => true
  );
  await expect(execution.run()).resolves.toMatchObject({
    state: 'ready',
    completion: { kind: 'native', root },
  });
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.cached).not.toHaveBeenCalled();
  expect(mocks.receive).not.toHaveBeenCalled();
  expect(mocks.prepareEditing).toHaveBeenCalledWith(
    expect.objectContaining({ root, binding: metadata.binding, authorization })
  );
});

it('notifies native availability only after preparation settles, including partial failure', async () => {
  const notify = vi.fn();
  let fail!: (reason: Error) => void;
  const pending = new Promise<never>((_resolve, reject) => {
    fail = reject;
  });
  mocks.prepareEditing.mockReturnValueOnce(pending);
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'native-prepare', root: { rootKind: 'media', rootId: 'image' } },
      signal: new AbortController().signal,
    },
    async () => true,
    notify
  );
  const result = execution.run();
  await vi.waitFor(() => expect(mocks.prepareEditing).toHaveBeenCalledOnce());
  expect(notify).not.toHaveBeenCalled();
  fail(new Error('partial restore refused'));
  await expect(result).resolves.toMatchObject({ state: 'failed' });
  expect(notify).toHaveBeenCalledOnce();
});

it.each(['native-release', 'cache-trim'] as const)(
  'executes %s using the current binding and a checked catalog, and refreshes after partial failure',
  async (kind) => {
    const checked = catalog();
    mocks.refresh.mockResolvedValue(checked);
    const index = { spaceId: 'space', copies: new Map(), operations: new Map() };
    mocks.index.mockReturnValue(index);
    const result = {
      released: 1,
      releasedBytes: 12,
      absent: 0,
      unavailable: 0,
      busy: 0,
      protected: 0,
    };
    const action = kind === 'native-release' ? mocks.release : mocks.trim;
    action.mockResolvedValue(result);
    const root = { rootKind: 'video-project' as const, rootId: 'project' };
    const changed = vi.fn();
    const signal = new AbortController().signal;
    const work = kind === 'native-release' ? { kind, root } : { kind };
    const execution = createSyncProductExecution(
      { ...scopeBinding(), work, signal },
      async () => true,
      changed
    );
    await expect(execution.run()).resolves.toMatchObject({
      state: 'ready',
      completion: { kind, result },
    });
    expect(mocks.index).toHaveBeenCalledWith(checked, 'space');
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({ binding: metadata.binding, authorization, index, signal })
    );
    expect(mocks.receive).not.toHaveBeenCalled();
    action.mockRejectedValueOnce(
      Object.assign(new Error('Temporary refusal after partial release'), { code: 'temporary' })
    );
    const partial = createSyncProductExecution(
      { ...scopeBinding(), work, signal },
      async () => true,
      changed
    );
    await expect(partial.run()).resolves.toMatchObject({
      state: 'failed',
      failureCode: 'temporary',
      completion: null,
      containment: 'contained',
    });
    expect(changed).toHaveBeenCalledTimes(4);
  }
);

it('prepares a native backup closure without catalog refresh or replica replacement', async () => {
  const root = { rootKind: 'video-project' as const, rootId: 'project' };
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'backup-prepare', root },
      signal: new AbortController().signal,
    },
    async () => true
  );
  await expect(execution.run()).resolves.toMatchObject({
    state: 'ready',
    completion: { kind: 'native', root },
  });
  expect(mocks.prepareEditing).toHaveBeenCalledWith(
    expect.objectContaining({ root, purpose: 'backup' })
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.receive).not.toHaveBeenCalled();
});

it('logs fixed start and terminal outcomes without provider or source content', async () => {
  const execution = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'catalog-refresh', bypassCache: false },
      signal: new AbortController().signal,
    },
    async () => true
  );
  await expect(execution.run()).resolves.toMatchObject({
    state: 'ready',
    containment: 'contained',
  });
  expect(mocks.logInfo.mock.calls).toEqual([
    [
      'sync.product.started kind=catalog-refresh code=none',
      { kind: 'catalog-refresh', state: 'started', code: null },
    ],
    [
      'sync.product.ready kind=catalog-refresh code=none',
      { kind: 'catalog-refresh', state: 'ready', code: null },
    ],
  ]);
  expect(JSON.stringify(mocks.logInfo.mock.calls)).not.toContain('dav.test');
});
it('logs a fixed failure code and preserves success when the diagnostic sink throws', async () => {
  mocks.refresh.mockRejectedValueOnce(new Error('private provider body'));
  const failed = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'catalog-refresh', bypassCache: false },
      signal: new AbortController().signal,
    },
    async () => true
  );
  await expect(failed.run()).resolves.toMatchObject({
    state: 'failed',
    failureCode: 'invalid-data',
  });
  expect(mocks.logWarn).toHaveBeenCalledExactlyOnceWith(
    'sync.product.failed kind=catalog-refresh code=invalid-data',
    {
      kind: 'catalog-refresh',
      state: 'failed',
      code: 'invalid-data',
    }
  );
  mocks.logInfo.mockImplementationOnce(() => {
    throw new Error('sink unavailable');
  });
  const completed = createSyncProductExecution(
    {
      ...scopeBinding(),
      work: { kind: 'catalog-refresh', bypassCache: false },
      signal: new AbortController().signal,
    },
    async () => true
  );
  await expect(completed.run()).resolves.toMatchObject({
    state: 'ready',
    containment: 'contained',
  });
});
