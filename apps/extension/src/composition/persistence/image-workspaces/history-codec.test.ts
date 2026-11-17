import { beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  type EditorDocument,
} from '../../../features/editor/document/public';
import {
  encodeEditorImageHistorySnapshot,
  IMAGE_HISTORY_VALUE_TOKEN_PREFIX,
} from '../../../features/editor-history/image-snapshot';
import type { EditorHistoryAction } from '../../../features/editor-history/action';
import type {
  EditorImageHistoryCheckpoint,
  EditorImageHistoryValue,
} from '../../../features/editor-history/image-checkpoint';
import type { AssetRef } from '../assets/contracts';
import {
  hydratePersistedImageHistory,
  preparePersistedImageHistory as prepareCurrentImageHistory,
} from './history-codec';
import { imageHistoryAssetBindings, parsePersistedImageHistory } from './history-contracts';

function preparePersistedImageHistory(
  checkpoint: Parameters<typeof prepareCurrentImageHistory>[0],
  options: Parameters<typeof prepareCurrentImageHistory>[1] = {}
) {
  return prepareCurrentImageHistory(checkpoint, { ...options, formatVersion: 1 });
}

const io = vi.hoisted(() => ({
  sequence: 0,
  files: new Map<string, Blob>(),
  validationLengths: [] as number[],
  write: vi.fn(),
  read: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock('@sniptale/runtime-contracts/validation/data-url', async (original) => {
  const module = await original<typeof import('@sniptale/runtime-contracts/validation/data-url')>();
  return {
    ...module,
    isImageDataUrl(value: unknown) {
      if (typeof value === 'string') io.validationLengths.push(value.length);
      return module.isImageDataUrl(value);
    },
  };
});

vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  writeBlobToAsset: io.write,
  readAssetFile: io.read,
  collectPreparedAssetCleanupFailures: io.cleanup,
}));

vi.mock('../../../platform/media-utils/data-url', async (original) => ({
  ...(await original<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: async (blob: Blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:${blob.type};base64,${btoa(String.fromCharCode(...bytes))}`;
  },
}));

async function stageBlob(blob: Blob) {
  const assetId = `history-${++io.sequence}`;
  io.files.set(assetId, blob);
  return {
    ref: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      mimeType: blob.type,
      sha256: null,
      size: blob.size,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  io.sequence = 0;
  io.files.clear();
  io.validationLengths.length = 0;
  io.write.mockReset().mockImplementation(stageBlob);
  io.read.mockReset().mockImplementation(async (ref: AssetRef, filename: string) => {
    const blob = io.files.get(ref.assetId);
    if (!blob) throw new Error('Missing immutable file');
    return new File([blob], filename, { type: blob.type });
  });
  io.cleanup.mockReset().mockImplementation(async (ids: readonly string[]) => {
    for (const id of ids) io.files.delete(id);
    return [];
  });
});

const source = 'data:image/png;base64,' + 'QUJD'.repeat(2_100) + 'RA==';

function fixture(
  steps = 2,
  image = source,
  otherImage: string | null = null,
  extraObject?: Record<string, unknown>
): EditorImageHistoryCheckpoint {
  const units: EditorImageHistoryValue[] = [];
  const ids = new Map<string, string>();
  const snapshots: string[] = [];
  const actions: (EditorHistoryAction | null)[] = [null];
  const base: EditorDocument = {
    version: 2,
    sourceImageData: image,
    sourceName: null,
    sourceWidth: 20,
    sourceHeight: 20,
    canvasWidth: 20,
    canvasHeight: 20,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 20,
    sourceDisplayHeight: 20,
    frame: { ...DEFAULT_EDITOR_FRAME_SETTINGS, backgroundImageData: otherImage },
    canvasJson: '{}',
  };
  for (let left = 0; left <= steps; left++) {
    snapshots.push(
      encodeEditorImageHistorySnapshot(
        {
          ...base,
          canvasJson: JSON.stringify({
            objects: [
              { type: 'image', sniptaleId: 'source', src: image },
              { type: 'rect', sniptaleId: 'card', sniptaleLabel: 'Card', left },
              ...(extraObject ? [extraObject] : []),
            ],
          }),
        },
        {
          intern(value, kind) {
            const existing = ids.get(value);
            if (existing) return existing;
            const id = IMAGE_HISTORY_VALUE_TOKEN_PREFIX + ids.size;
            ids.set(value, id);
            units.push({ id, kind, value });
            return id;
          },
        },
        new Set()
      )
    );
    if (left) actions.push({ operation: 'move', target: { id: 'card', name: 'Card' } });
  }
  return {
    version: 1,
    epoch: 'native-fixture',
    cursor: Math.min(1, steps),
    snapshots,
    values: units,
    actions,
  };
}

it.each([2, 30])(
  'packs %s Image actions in one immutable JSON file while binary images keep their files',
  async (steps) => {
    const checkpoint = fixture(steps);
    const prepared = await prepareCurrentImageHistory(checkpoint);
    expect(prepared.history.version).toBe(2);
    expect(prepared.refs.filter((ref) => ref.mimeType === 'application/json')).toHaveLength(1);
    expect(new Set(prepared.history.snapshots.map((entry) => entry.assetId)).size).toBe(1);
    expect(io.write.mock.calls.filter(([blob]) => blob.type === 'application/json')).toHaveLength(
      1
    );
    expect(
      (
        await hydratePersistedImageHistory({
          history: prepared.history,
          refs: prepared.refs,
        })
      ).checkpoint
    ).toEqual(checkpoint);
  }
);

it('round-trips an editable SVG browser-frame layer through the shared JSON object owner', async () => {
  const svg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><text>' + 'Title '.repeat(1500) + '</text></svg>')}`;
  const checkpoint = fixture(3, source, null, {
    type: 'image',
    sniptaleType: 'browser-frame',
    src: svg,
  });
  const prepared = await preparePersistedImageHistory(checkpoint);
  expect(
    (await hydratePersistedImageHistory({ history: prepared.history, refs: prepared.refs }))
      .checkpoint
  ).toEqual(checkpoint);
  expect(prepared.refs.filter((ref) => ref.mimeType === 'image/svg+xml')).toHaveLength(0);
  expect(
    checkpoint.values.filter((unit) => unit.kind === 'json' && unit.value.includes(svg))
  ).toHaveLength(1);
});

it('round-trips current, past and redo through shared immutable JSON and binary objects', async () => {
  const checkpoint = fixture();
  const prepared = await preparePersistedImageHistory(checkpoint);
  expect(prepared.objects).toHaveLength(checkpoint.values.length + checkpoint.snapshots.length);
  expect(prepared.refs.filter((ref) => ref.mimeType === 'image/png')).toHaveLength(1);
  expect(JSON.stringify(prepared.history)).not.toContain('QUJDQUJD');
  const hydrated = await hydratePersistedImageHistory({
    history: prepared.history,
    refs: prepared.refs,
  });
  expect(hydrated.checkpoint).toEqual(checkpoint);
  expect(io.read).toHaveBeenCalledTimes(prepared.refs.length);
  expect(hydrated.assetsByValue.size).toBe(prepared.assetsByValue.size);
  expect(imageHistoryAssetBindings(prepared.history)).toHaveLength(prepared.refs.length);
});

it('reuses a ready graph and cursor movement without reading, rewriting or revalidating media payloads', async () => {
  const checkpoint = fixture(30);
  const first = await preparePersistedImageHistory(checkpoint);
  io.write.mockClear();
  io.read.mockClear();
  io.validationLengths.length = 0;
  const parse = vi.spyOn(JSON, 'parse');
  const second = await preparePersistedImageHistory(
    { ...checkpoint, cursor: 0 },
    { reusableAssetsByValue: first.assetsByValue }
  );
  expect(io.write).not.toHaveBeenCalled();
  expect(io.read).not.toHaveBeenCalled();
  expect(parse).not.toHaveBeenCalled();
  parse.mockRestore();
  expect(Math.max(...io.validationLengths)).toBeLessThan(100);
  expect(second.objects).toEqual([]);
  expect(second.refs).toEqual(first.refs);
  expect(second.history).toEqual({ ...first.history, cursor: 0 });
});

it('writes only a changed object version and new state on append, then drops expired byte-index entries', async () => {
  const first = await preparePersistedImageHistory(fixture(30));
  io.write.mockClear();
  const next = await preparePersistedImageHistory(fixture(31), {
    reusableAssetsByValue: first.assetsByValue,
  });
  expect(next.objects).toHaveLength(2);
  expect(io.write).toHaveBeenCalledTimes(2);
  expect(io.read).not.toHaveBeenCalled();
  io.write.mockClear();
  const retained = await preparePersistedImageHistory(fixture(0), {
    reusableAssetsByValue: next.assetsByValue,
  });
  expect(io.write).not.toHaveBeenCalled();
  expect(retained.assetsByValue.size).toBeLessThan(next.assetsByValue.size);
  expect([...retained.assetsByValue.keys()]).not.toContain(fixture(31).snapshots.at(-1));
});

it('shares an existing document bitmap and preserves exact data URL spellings across restart', async () => {
  const original = await preparePersistedImageHistory(fixture(0));
  const ref = original.assetsByValue.get(source)!;
  const alias = 'data:IMAGE/PNG;BASE64,' + 'QUJD'.repeat(2_100) + 'RB';
  io.write.mockClear();
  const checkpoint = fixture(2, source, alias);
  const prepared = await preparePersistedImageHistory(checkpoint, {
    reusableAssetsByValue: original.assetsByValue,
    reusableImagesByRuntimeUrl: new Map([[alias, ref]]),
  });
  expect(prepared.refs.filter((asset) => asset.mimeType === 'image/png')).toEqual([ref]);
  const hydrated = await hydratePersistedImageHistory({
    history: prepared.history,
    refs: prepared.refs,
  });
  expect(hydrated.checkpoint).toEqual(checkpoint);
  expect(io.read).toHaveBeenCalledTimes(prepared.refs.length);
  expect(hydrated.assetsByValue.get(alias)).toEqual(ref);
});

it('refuses representation metadata that changes bitmap bytes or has invalid padding', async () => {
  const prepared = await preparePersistedImageHistory(fixture());
  for (const patch of [{ lastCharacter: 'f' }, { padding: 1 }]) {
    const history = {
      ...prepared.history,
      values: prepared.history.values.map((unit) =>
        unit.kind === 'image' ? { ...unit, dataUrl: { ...unit.dataUrl, ...patch } } : unit
      ),
    };
    await expect(hydratePersistedImageHistory({ history, refs: prepared.refs })).rejects.toThrow(
      'representation changes'
    );
  }
});

it('rejects missing, duplicate, wrong-MIME or unavailable resources before returning a history', async () => {
  const prepared = await preparePersistedImageHistory(fixture());
  await expect(
    hydratePersistedImageHistory({ history: prepared.history, refs: prepared.refs.slice(1) })
  ).rejects.toThrow();
  await expect(
    hydratePersistedImageHistory({
      history: prepared.history,
      refs: [...prepared.refs, prepared.refs[0]],
    })
  ).rejects.toThrow();
  await expect(
    hydratePersistedImageHistory({
      history: prepared.history,
      refs: prepared.refs.map((ref) => ({ ...ref, mimeType: 'text/html' })),
    })
  ).rejects.toThrow();
  io.files.clear();
  await expect(
    hydratePersistedImageHistory({ history: prepared.history, refs: prepared.refs })
  ).rejects.toThrow('Missing immutable file');
});

it('rejects damaged bytes, dangling graph references and exceeded history limits', async () => {
  const prepared = await preparePersistedImageHistory(fixture());
  await expect(
    hydratePersistedImageHistory({
      history: prepared.history,
      refs: prepared.refs,
      limits: { maxActions: 0, maxBytes: 32 * 1024 * 1024 },
    })
  ).rejects.toThrow();
  await expect(
    hydratePersistedImageHistory({
      history: prepared.history,
      refs: prepared.refs,
      limits: { maxActions: 100, maxBytes: 0 },
    })
  ).rejects.toThrow('graph is invalid');
  if (prepared.history.version !== 1) throw new Error('Expected legacy file fixture.');
  const snapshotId = prepared.history.snapshots[0]!.assetId;
  const original = io.files.get(snapshotId)!;
  const invalid = (await original.text()).replace(
    /sniptale-history-asset:0/g,
    'sniptale-history-asset:9'
  );
  expect(invalid.length).toBe((await original.text()).length);
  io.files.set(snapshotId, new Blob([invalid], { type: original.type }));
  await expect(
    hydratePersistedImageHistory({ history: prepared.history, refs: prepared.refs })
  ).rejects.toThrow('graph is invalid');
  io.files.set(snapshotId, new Blob(['bad-size'], { type: original.type }));
  await expect(
    hydratePersistedImageHistory({ history: prepared.history, refs: prepared.refs })
  ).rejects.toThrow('bytes do not match');
});

it('refuses an excessive declared JSON resource budget before reading any file', async () => {
  const prepared = await preparePersistedImageHistory(fixture(0));
  const extra = Array.from({ length: 9 }, (_, index) => ({
    ...prepared.refs[0]!,
    assetId: `large-json-${index}`,
    mimeType: 'application/json',
    size: 64 * 1024 * 1024,
    location: { kind: 'opfs' as const, objectKey: `objects/large-json-${index}` },
  }));
  io.read.mockRejectedValueOnce(new Error('Read attempted before budget admission'));
  await expect(
    hydratePersistedImageHistory({
      history: {
        ...prepared.history,
        values: [
          ...prepared.history.values,
          ...extra.map((ref, index) => ({
            id: IMAGE_HISTORY_VALUE_TOKEN_PREFIX + `large-${index}`,
            kind: 'json',
            assetId: ref.assetId,
          })),
        ],
      },
      refs: [...prepared.refs, ...extra],
    })
  ).rejects.toThrow('metadata budget');
  expect(io.read).not.toHaveBeenCalled();
});

it('cleans only newly staged files after a failed append and keeps borrowed bytes available for retry', async () => {
  const first = await preparePersistedImageHistory(fixture(0));
  const borrowed = new Set(first.refs.map(({ assetId }) => assetId));
  io.write.mockImplementationOnce(stageBlob).mockRejectedValueOnce(new Error('disk full'));
  await expect(
    preparePersistedImageHistory(fixture(1), { reusableAssetsByValue: first.assetsByValue })
  ).rejects.toThrow('disk full');
  expect(io.cleanup).toHaveBeenLastCalledWith([`history-${io.sequence}`]);
  expect(new Set(io.files.keys())).toEqual(borrowed);
  const retry = await preparePersistedImageHistory(fixture(1), {
    reusableAssetsByValue: first.assetsByValue,
  });
  expect(retry.objects).toHaveLength(2);
  expect(
    (await hydratePersistedImageHistory({ history: retry.history, refs: retry.refs })).checkpoint
  ).toEqual(fixture(1));
});

it.each([null, {}, { version: 2 }, { cursor: -1 }, { actions: [] }, { extra: true }])(
  'refuses malformed native history envelopes: %j',
  async (patch) => {
    const prepared = await preparePersistedImageHistory(fixture());
    const value =
      patch === null || !Object.keys(patch).length ? patch : { ...prepared.history, ...patch };
    expect(parsePersistedImageHistory(value)).toBeNull();
    await expect(
      hydratePersistedImageHistory({ history: value, refs: prepared.refs })
    ).rejects.toThrow();
    expect(io.read).not.toHaveBeenCalled();
  }
);

it('refuses damaged packed graph metadata without creating replacement files', async () => {
  const prepared = await prepareCurrentImageHistory(fixture());
  const id = prepared.history.snapshots[0]!.assetId;
  const original = io.files.get(id)!;
  const payload = JSON.parse(await original.text());
  payload.snapshots[0] = '!' + payload.snapshots[0].slice(1);
  io.files.set(id, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  io.write.mockClear();
  await expect(
    hydratePersistedImageHistory({ history: prepared.history, refs: prepared.refs })
  ).rejects.toThrow();
  expect(io.write).not.toHaveBeenCalled();
  expect(io.cleanup).not.toHaveBeenCalled();
});

it.each(['{', '[]', 'null'])(
  'refuses malformed packed snapshot input before creating files: %s',
  async (snapshot) => {
    const checkpoint = fixture();
    await expect(
      prepareCurrentImageHistory({
        ...checkpoint,
        snapshots: [snapshot, ...checkpoint.snapshots.slice(1)],
      })
    ).rejects.toThrow();
    expect(io.write).not.toHaveBeenCalled();
  }
);

it.each(['snapshot-count', 'unknown-value', 'extra-field'])(
  'refuses a mismatched packed resource: %s',
  async (damage) => {
    const prepared = await prepareCurrentImageHistory(fixture());
    const id = prepared.history.snapshots[0]!.assetId;
    const payload = JSON.parse(await io.files.get(id)!.text());
    if (damage === 'snapshot-count') payload.snapshots.pop();
    else if (damage === 'unknown-value')
      payload.values.push({
        id: IMAGE_HISTORY_VALUE_TOKEN_PREFIX + 'unknown',
        kind: 'json',
        value: '{}',
      });
    else payload.extra = true;
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    io.files.set(id, blob);
    const refs = prepared.refs.map((ref) =>
      ref.assetId === id ? { ...ref, size: blob.size } : ref
    );
    io.write.mockClear();
    await expect(hydratePersistedImageHistory({ history: prepared.history, refs })).rejects.toThrow(
      'bundle'
    );
    expect(io.write).not.toHaveBeenCalled();
  }
);

it('cleans the staged bundle if the following bitmap write fails', async () => {
  io.write.mockImplementationOnce(stageBlob).mockRejectedValueOnce(new Error('Quota'));
  await expect(prepareCurrentImageHistory(fixture())).rejects.toThrow('Quota');
  expect(io.cleanup).toHaveBeenCalledWith(['history-1']);
  expect(io.files.size).toBe(0);
});
