import { readFileSync } from 'node:fs';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { createSha256Digest, createSha256BytesDigest } from '@sniptale/platform/security/digest';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import { VideoTrackKind } from '../../../features/video/project/types';
import {
  createVideoProjectHistoryChange,
  applyVideoProjectHistoryChangeValues,
} from '../../../features/video/project/history-change';
import {
  collectVideoProjectHistorySources,
  type VideoProjectHistoryCapture,
} from '../../../features/video/project/history-capture';
import type { AssetRef } from '../assets/contracts';
import {
  preparePersistedVideoProjectHistory,
  hydratePersistedVideoProjectHistory,
} from './history-codec';
import {
  parsePersistedVideoProjectHistory,
  videoProjectHistoryAssetBindings,
} from './history-contracts';

const io = vi.hoisted(() => ({
  sequence: 0,
  files: new Map<string, Blob>(),
  write: vi.fn(),
  read: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  writeBlobToAsset: io.write,
  readAssetFile: io.read,
  collectPreparedAssetCleanupFailures: io.cleanup,
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.sequence = 0;
  io.files.clear();
  io.write.mockReset().mockImplementation(async (blob: Blob) => {
    const assetId = `video-history-${++io.sequence}`;
    io.files.set(assetId, blob);
    return {
      ref: {
        assetId,
        createdAt: 1,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
        mimeType: blob.type,
        sha256: null,
        size: blob.size,
      },
    };
  });
  io.read.mockReset().mockImplementation(async (ref: AssetRef, name: string) => {
    const blob = io.files.get(ref.assetId);
    if (!blob) throw new Error('Missing history file');
    return new File([blob], name, { type: blob.type });
  });
  io.cleanup.mockReset().mockImplementation(async (ids: string[]) => {
    for (const id of ids) io.files.delete(id);
    return [];
  });
});

function fixture() {
  const first = createEmptyVideoProject('First');
  first.baseRecordingId = 'original';
  first.source = { kind: 'recording', recordingId: 'original' };
  const current = {
    ...first,
    name: 'Current',
    baseRecordingId: null,
    source: { kind: 'manual' as const },
  };
  const last = { ...current, name: 'Last' };
  const value = (before: typeof current | typeof first, after: typeof current) => {
    const encoded = JSON.stringify(createVideoProjectHistoryChange(before, after));
    return {
      value: encoded,
      bytes: new TextEncoder().encode(encoded).byteLength,
      sources: collectVideoProjectHistorySources(before),
    };
  };
  const capture: VideoProjectHistoryCapture = {
    version: 1,
    epoch: 'session',
    past: [value(first, current)],
    future: [value(last, current)],
  };
  return { first, current, last, capture };
}

it('roundtrips both directions and retains removed source identities through the native reference graph', async () => {
  const { first, current, last, capture } = fixture();
  const prepared = await preparePersistedVideoProjectHistory(capture);
  expect(prepared.history.sources).toEqual([{ kind: 'recording', id: 'original' }]);
  expect(prepared.objects).toHaveLength(2);
  expect(videoProjectHistoryAssetBindings(prepared.history)).toHaveLength(2);
  const loaded = await hydratePersistedVideoProjectHistory({
    history: prepared.history,
    refs: prepared.refs,
    current,
  });
  expect(applyVideoProjectHistoryChangeValues(current, loaded.past[0]!.change)).toEqual(first);
  expect(applyVideoProjectHistoryChangeValues(current, loaded.future[0]!.change)).toEqual(last);
  expect(loaded.epoch).toBe('session');
  expect(loaded.past[0]!.sources).toContainEqual({ kind: 'recording', id: 'original' });
  expect(io.read).toHaveBeenCalledTimes(2);
});

it('restores the pre-gesture anchor before admitting both saved history directions', async () => {
  const fixtureValue = fixture();
  const current = {
    ...fixtureValue.current,
    tracks: [
      ...fixtureValue.current.tracks,
      createVideoProjectTrack('Audio', 1, VideoTrackKind.AUDIO),
    ],
  };
  const first = { ...fixtureValue.first, tracks: current.tracks };
  expect(current.tracks.length).toBeGreaterThan(1);
  const draft = { ...current, name: 'Draft', tracks: current.tracks.slice(0, 1) };
  const later = {
    ...current,
    name: 'Later',
    tracks: current.tracks.map((track, index) =>
      index === 1 ? { ...track, name: 'Later track' } : track
    ),
  };
  const value = (target: typeof current | typeof first, anchor: typeof current) => {
    const value = JSON.stringify(createVideoProjectHistoryChange(target, anchor));
    return {
      value,
      bytes: new TextEncoder().encode(value).byteLength,
      sources: collectVideoProjectHistorySources(target),
    };
  };
  const capture = { ...fixtureValue.capture, past: [value(first, current)] };
  const prepared = await preparePersistedVideoProjectHistory({
    ...capture,
    future: [value(later, current)],
    recovery: value(current, draft),
  });
  const loaded = await hydratePersistedVideoProjectHistory({
    history: prepared.history,
    refs: prepared.refs,
    current: draft,
  });
  expect(loaded.recovery).toBeDefined();
  const anchor = applyVideoProjectHistoryChangeValues(draft, loaded.recovery!.change);
  expect(anchor).toEqual(current);
  expect(applyVideoProjectHistoryChangeValues(anchor, loaded.past[0]!.change)).toEqual(first);
  expect(applyVideoProjectHistoryChangeValues(anchor, loaded.future[0]!.change)).toEqual(later);
  expect(loaded.recovery!.bytes).toBe(new TextEncoder().encode(loaded.recovery!.value).byteLength);
  io.write.mockClear();
  io.read.mockClear();
  await preparePersistedVideoProjectHistory(
    { ...capture, future: [value(later, current)], recovery: value(current, draft) },
    loaded.assetsByValue
  );
  expect(io.write).not.toHaveBeenCalled();
  expect(io.read).not.toHaveBeenCalled();
});

it.each([null, { assetId: '' }, { assetId: 'recovery', extra: true }])(
  'refuses malformed recovery references: %j',
  (recovery) => {
    expect(
      parsePersistedVideoProjectHistory({
        version: 1,
        epoch: 'epoch',
        past: [],
        future: [],
        sources: [],
        recovery,
      })
    ).toBeNull();
  }
);

it('counts recovery as one bounded transition before preparing files', async () => {
  const { capture } = fixture();
  await expect(
    preparePersistedVideoProjectHistory({
      ...capture,
      past: Array.from({ length: 50 }, () => capture.past[0]!),
      future: [],
      recovery: capture.past[0]!,
    })
  ).rejects.toThrow('invalid');
  expect(io.write).not.toHaveBeenCalled();
});

it.each(['original', 'malformed-bytes'] as const)(
  'refuses malformed UTF-8 with identical decoded JSON, stored digest=%s',
  async (digest) => {
    const { first, current, capture } = fixture();
    const before = { ...first, name: 'Before�' };
    const value = JSON.stringify(createVideoProjectHistoryChange(before, current));
    const prepared = await preparePersistedVideoProjectHistory({
      ...capture,
      future: [],
      past: [
        {
          value,
          bytes: new TextEncoder().encode(value).byteLength,
          sources: collectVideoProjectHistorySources(before),
        },
      ],
    });
    const ref = prepared.refs[0]!;
    const blob = io.files.get(ref.assetId)!;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const index = bytes.findIndex(
      (byte, index) => byte === 0xef && bytes[index + 1] === 0xbf && bytes[index + 2] === 0xbd
    );
    expect(index).toBeGreaterThanOrEqual(0);
    bytes.set([0xf0, 0x90, 0x80], index);
    expect(new TextDecoder().decode(bytes)).toBe(value);
    expect(bytes.byteLength).toBe(blob.size);
    io.files.set(ref.assetId, new Blob([bytes], { type: 'application/json' }));
    if (digest === 'malformed-bytes')
      ref.sha256 = (await createSha256BytesDigest(bytes)).slice('sha256:'.length);
    const loaded = hydratePersistedVideoProjectHistory({
      history: prepared.history,
      refs: prepared.refs,
      current,
    });
    if (digest === 'original') await expect(loaded).rejects.toThrow('digest');
    else await expect(loaded).rejects.toThrow(TypeError);
  }
);

it('reuses unchanged encoded values without parsing, reading or writing old payloads', async () => {
  const { capture } = fixture();
  const first = await preparePersistedVideoProjectHistory(capture);
  io.write.mockClear();
  const parse = vi.spyOn(JSON, 'parse');
  let next;
  try {
    next = await preparePersistedVideoProjectHistory(capture, first.assetsByValue);
    expect(parse).not.toHaveBeenCalled();
    expect(io.write).not.toHaveBeenCalled();
    expect(io.read).not.toHaveBeenCalled();
  } finally {
    parse.mockRestore();
  }
  expect(next.history).toEqual(first.history);
  expect(next.objects).toEqual([]);
});

it('shares repeated values and writes only one newly appended change', async () => {
  const { capture } = fixture();
  const first = await preparePersistedVideoProjectHistory({ ...capture, future: [] });
  io.write.mockClear();
  const next = await preparePersistedVideoProjectHistory(
    { ...capture, past: [capture.past[0]!, capture.past[0]!] },
    first.assetsByValue
  );
  expect(io.write).toHaveBeenCalledTimes(1);
  expect(next.refs).toHaveLength(2);
  expect(next.history.past[0]).toEqual(next.history.past[1]);
  expect(next.assetsByValue.size).toBe(2);
});

it.each([
  'missing',
  'extra',
  'duplicate',
  'mime',
  'size',
  'invalid-json',
  'invalid-change',
  'wrong-hash',
  'same-size-corruption',
  'sources',
] as const)('refuses a damaged native history graph: %s', async (kind) => {
  const { capture, current } = fixture();
  const prepared = await preparePersistedVideoProjectHistory(capture);
  let refs = [...prepared.refs];
  let history = prepared.history;
  if (kind === 'missing') refs = refs.slice(1);
  if (kind === 'extra') refs.push({ ...refs[0]!, assetId: 'extra' });
  if (kind === 'duplicate') refs.push(refs[0]!);
  if (kind === 'mime') refs[0] = { ...refs[0]!, mimeType: 'image/png' };
  if (kind === 'size') refs[0] = { ...refs[0]!, size: refs[0]!.size + 1 };
  if (kind === 'wrong-hash') refs[0] = { ...refs[0]!, sha256: 'a'.repeat(64) };
  if (kind === 'same-size-corruption') {
    const blob = io.files.get(refs[0]!.assetId)!;
    const value = (await blob.text()).replace('First', 'Other');
    io.files.set(refs[0]!.assetId, new Blob([value], { type: 'application/json' }));
  }
  if (kind === 'sources') history = { ...history, sources: [] };
  if (kind === 'invalid-json' || kind === 'invalid-change') {
    const text =
      kind === 'invalid-json' ? '{broken' : JSON.stringify({ kind: 'replace', value: {} });
    const blob = new Blob([text], { type: 'application/json' });
    io.files.set(refs[0]!.assetId, blob);
    refs[0] = {
      ...refs[0]!,
      size: blob.size,
      sha256: (await createSha256Digest(text)).slice('sha256:'.length),
    };
  }
  const before = structuredClone(current);
  await expect(hydratePersistedVideoProjectHistory({ history, refs, current })).rejects.toThrow();
  expect(current).toEqual(before);
});

it('refuses an excessive declared history before reading any immutable file', async () => {
  const { capture, current } = fixture();
  const prepared = await preparePersistedVideoProjectHistory(capture);
  const refs = prepared.refs.map((ref) => ({ ...ref, size: 8 * 1024 * 1024 }));
  await expect(
    hydratePersistedVideoProjectHistory({ history: prepared.history, refs, current })
  ).rejects.toThrow('budget');
  expect(io.read).not.toHaveBeenCalled();
});

it('cleans only newly staged objects after failure and retains borrowed objects for retry', async () => {
  const { capture } = fixture();
  const old = await preparePersistedVideoProjectHistory({ ...capture, future: [] });
  const extra = {
    value: JSON.stringify({
      kind: 'record',
      fields: [['name', { kind: 'replace', value: 'Extra' }]],
    }),
    sources: [],
  };
  io.write
    .mockImplementationOnce(async (blob: Blob) => {
      const assetId = 'new-before-failure';
      io.files.set(assetId, blob);
      return {
        ref: {
          ...old.refs[0]!,
          assetId,
          size: blob.size,
          location: { kind: 'opfs', objectKey: 'objects/new-before-failure' },
        },
      };
    })
    .mockRejectedValueOnce(new Error('Quota refused'));
  await expect(
    preparePersistedVideoProjectHistory(
      {
        ...capture,
        future: [
          capture.future[0]!,
          { ...extra, bytes: new TextEncoder().encode(extra.value).byteLength },
        ],
      },
      old.assetsByValue
    )
  ).rejects.toThrow('Quota refused');
  expect(io.cleanup).toHaveBeenCalledWith(['new-before-failure']);
  expect(io.files.has(old.refs[0]!.assetId)).toBe(true);
});

it.each([
  null,
  {},
  { version: 2 },
  { past: null },
  { sources: [{ kind: 'unknown', id: 'x' }] },
  { extra: true },
])('rejects malformed native reference envelopes: %j', (patch) => {
  expect(parsePersistedVideoProjectHistory(patch)).toBeNull();
});

it.each([false, true])(
  'checks historical effect package integrity before adoption, forged=%s',
  async (forged) => {
    const { first, current, capture } = fixture();
    const source = readFileSync(
      'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
      'utf8'
    );
    const parsed = parseAnimationTemplateSource(source);
    if (!parsed.ok) throw new Error('Invalid shipped package fixture');
    const sha256 = forged
      ? 'a'.repeat(64)
      : (await createSha256Digest(source)).slice('sha256:'.length);
    const previous = {
      ...first,
      effectSnapshots: [
        {
          kind: 'standalone' as const,
          schemaVersion: 'sniptale.animation.v1' as const,
          id: `effect:${sha256}`,
          sha256,
          documentId: parsed.template.id,
          source,
          retainedByteLength: new TextEncoder().encode(source).byteLength,
          assets: [],
        },
      ],
    };
    const value = JSON.stringify(createVideoProjectHistoryChange(previous, current));
    const prepared = await preparePersistedVideoProjectHistory({
      ...capture,
      past: [
        {
          value,
          bytes: new TextEncoder().encode(value).byteLength,
          sources: collectVideoProjectHistorySources(previous),
        },
      ],
      future: [],
    });
    const loaded = hydratePersistedVideoProjectHistory({
      history: prepared.history,
      refs: prepared.refs,
      current,
    });
    if (forged) await expect(loaded).rejects.toThrow('integrity');
    else
      await expect(loaded).resolves.toMatchObject({ past: [expect.objectContaining({ value })] });
  }
);
