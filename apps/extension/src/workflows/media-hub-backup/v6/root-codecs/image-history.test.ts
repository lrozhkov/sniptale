import { expect, it, vi } from 'vitest';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_BROWSER_FRAME_STATE,
} from '../../../../features/editor/document/constants';
import type { EditorDocument } from '../../../../features/editor/document/types';
import {
  encodeEditorImageHistorySnapshot,
  IMAGE_HISTORY_VALUE_TOKEN_PREFIX,
} from '../../../../features/editor-history/image-snapshot';
import {
  parseEditorImageHistoryCheckpoint,
  type EditorImageHistoryValue,
} from '../../../../features/editor-history/image-checkpoint';
import {
  imageHistoryAssetBindings,
  type PersistedImageHistory,
} from '../../../../composition/persistence/image-workspaces/history-contracts';
import { createMediaHubBackupExportOptions } from '../options';
import { assertPortableJson } from '../codec';
import { projectImageHistorySnapshotPrivacy } from '../privacy';
import {
  encodePortableImageHistory,
  decodePortableImageHistory,
  parsePortableImageHistory,
  projectImageHistoryMetadata,
} from './image-history';

function fixture(sharedFavicon = false, faviconSource?: 'site' | 'file', svgSource?: string) {
  const source = 'data:image/png;base64,' + 'QUJD'.repeat(2100);
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';
  const favicon = 'data:image/png;base64,' + btoa(atob(png) + '\0'.repeat(7000));
  const units: EditorImageHistoryValue[] = [];
  const byValue = new Map<string, string>();
  const content = new Map<string, string>();
  const snapshots = [0, 1, 2].map((index) => {
    const document: EditorDocument = {
      version: 2,
      sourceImageData: source,
      sourceName: null,
      displayName: `Caption ${index}`,
      sourceWidth: 100,
      sourceHeight: 80,
      canvasWidth: 100,
      canvasHeight: 80,
      sourceLeft: 0,
      sourceTop: 0,
      sourceDisplayWidth: 100,
      sourceDisplayHeight: 80,
      frame: {
        ...DEFAULT_EDITOR_FRAME_SETTINGS,
        browserTitle: 'Secret page title',
        browserUrl: 'https://user:pass@example.test/page?token=secret#hash',
      },
      browserFrame: {
        ...DEFAULT_BROWSER_FRAME_STATE,
        faviconEnabled: true,
        title: 'Secret page title',
        url: 'https://user:pass@example.test/page?token=secret#hash',
        faviconDataUrl: favicon,
        ...(faviconSource ? { faviconSource } : {}),
      },
      canvasJson: JSON.stringify({
        objects: svgSource
          ? [{ type: 'image', sniptaleType: 'browser-frame', src: svgSource }]
          : sharedFavicon
            ? [
                {
                  type: 'image',
                  sniptaleId: 'user-image',
                  sniptaleLabel: 'User picture',
                  src: favicon,
                },
              ]
            : [],
      }),
    };
    const snapshot = encodeEditorImageHistorySnapshot(
      document,
      {
        intern(value, kind) {
          const existing = byValue.get(value);
          if (existing) return existing;
          const id = IMAGE_HISTORY_VALUE_TOKEN_PREFIX + units.length;
          byValue.set(value, id);
          units.push({ id, kind, value });
          return id;
        },
      },
      new Set()
    );
    const assetId = `snapshot-${index}`;
    content.set(assetId, snapshot);
    return { assetId };
  });
  const values = units.map((unit): PersistedImageHistory['values'][number] => {
    const assetId = `value-${unit.id}`;
    if (unit.kind === 'json') {
      content.set(assetId, unit.value);
      return { id: unit.id, kind: 'json', assetId };
    }
    return {
      id: unit.id,
      kind: 'image',
      assetId,
      dataUrl: {
        header: 'data:image/png;base64,',
        lastCharacter: unit.value.at(-1)!,
        padding: 0,
      },
    };
  });
  const history: PersistedImageHistory = {
    version: 1,
    epoch: 'epoch',
    cursor: 1,
    snapshots,
    values,
    actions: [null, { operation: 'update', target: null }, { operation: 'update', target: null }],
  };
  const objects = new Map(
    imageHistoryAssetBindings(history).map(({ assetId }) => [assetId, `archive-${assetId}`])
  );
  return { history, objects, content, units, favicon };
}

it('roundtrips cursor and both directions using portable object IDs and fresh native asset IDs', () => {
  const f = fixture();
  const portable = encodePortableImageHistory({ history: f.history, objectsByAssetId: f.objects });
  expect(portable.snapshots[0]).toEqual({ objectId: 'archive-snapshot-0' });
  expect(JSON.stringify(portable)).not.toContain('"assetId"');
  expect(JSON.stringify(portable)).not.toContain('data:');
  expect(() => assertPortableJson(portable)).not.toThrow();
  expect(parsePortableImageHistory(portable)).toEqual(portable);
  const assets = new Map([...f.objects.values()].map((id) => [id, `restored-${id}`]));
  const restored = decodePortableImageHistory({ history: portable, assetsByObjectId: assets });
  expect(restored).toMatchObject({
    cursor: 1,
    epoch: 'epoch',
    snapshots: [
      { assetId: 'restored-archive-snapshot-0' },
      { assetId: 'restored-archive-snapshot-1' },
      { assetId: 'restored-archive-snapshot-2' },
    ],
  });
  expect(restored.values.map((unit) => unit.id)).toEqual(f.history.values.map((unit) => unit.id));
  expect(restored.actions).toEqual(f.history.actions);
});

it('projects an SVG image object through shared bounded JSON without a raster resource or bitmap read', async () => {
  const svg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><text>' + 'Frame '.repeat(1500) + '</text></svg>')}`;
  const f = fixture(false, undefined, svg);
  const projected = await projectImageHistoryMetadata({
    history: f.history,
    readJson: async (id) => {
      const text = f.content.get(id);
      if (!text) throw new Error('Must not read a bitmap.');
      return text;
    },
    projectSnapshot: (value) => value,
  });
  const portable = encodePortableImageHistory({
    history: f.history,
    objectsByAssetId: f.objects,
    values: projected.values,
  });
  expect(() => assertPortableJson(portable)).not.toThrow();
  expect(
    projected.values.filter(
      (unit) =>
        unit.kind === 'json' && 'assetId' in unit && f.content.get(unit.assetId)?.includes(svg)
    )
  ).toHaveLength(1);
});

it.each(['native-snapshot', 'native-unit', 'extra-unit-field', 'wrong-cursor', 'wrong-padding'])(
  'refuses %s at the portable reference boundary',
  (corruption) => {
    const f = fixture();
    const portable = encodePortableImageHistory({
      history: f.history,
      objectsByAssetId: f.objects,
    });
    const invalid =
      corruption === 'native-snapshot'
        ? { ...portable, snapshots: [{ assetId: 'snapshot-0' }] }
        : corruption === 'native-unit'
          ? { ...portable, values: [{ ...portable.values[0], assetId: 'native' }] }
          : corruption === 'extra-unit-field'
            ? { ...portable, values: [{ ...portable.values[0], trusted: true }] }
            : corruption === 'wrong-cursor'
              ? { ...portable, cursor: 10 }
              : {
                  ...portable,
                  values: [
                    {
                      ...portable.values[0],
                      dataUrl: { header: 'data:image/png;base64,', lastCharacter: 'A', padding: 4 },
                    },
                  ],
                };
    expect(parsePortableImageHistory(invalid)).toBeNull();
  }
);

it('refuses an undeclared resource during export and restore', () => {
  const f = fixture();
  expect(() =>
    encodePortableImageHistory({ history: f.history, objectsByAssetId: new Map() })
  ).toThrow('missing');
  const portable = encodePortableImageHistory({ history: f.history, objectsByAssetId: f.objects });
  expect(() =>
    decodePortableImageHistory({ history: portable, assetsByObjectId: new Map() })
  ).toThrow('missing');
});

it.each([false, true])(
  'projects source metadata across current, past and future without reading bitmap files, shared=%s',
  async (sharedFavicon) => {
    const f = fixture(sharedFavicon, 'file');
    const original = JSON.stringify(f.history);
    const reads = vi.fn(async (id: string) => {
      const value = f.content.get(id);
      if (value === undefined)
        throw new Error('Bitmap file must not be read for privacy projection');
      return value;
    });
    const options = createMediaHubBackupExportOptions({ includeSourceMetadata: false });
    const projected = await projectImageHistoryMetadata({
      history: f.history,
      readJson: reads,
      projectSnapshot: (snapshot) => projectImageHistorySnapshotPrivacy(snapshot, options),
    });
    const serialized = JSON.stringify(projected.snapshots);
    expect(serialized).not.toContain('Secret page title');
    expect(serialized).not.toContain('example.test');
    const faviconId = f.units.find((unit) => unit.value === f.favicon)!.id;
    expect(projected.values.some((unit) => unit.id === faviconId)).toBe(sharedFavicon);
    expect(reads.mock.calls.every(([id]) => f.content.has(id))).toBe(true);
    expect(new Set(reads.mock.calls.map(([id]) => id)).size).toBe(reads.mock.calls.length);
    const retained = new Set(projected.values.map((unit) => unit.id));
    expect(
      parseEditorImageHistoryCheckpoint({
        version: 1,
        epoch: f.history.epoch,
        cursor: f.history.cursor,
        actions: f.history.actions,
        snapshots: projected.snapshots.map(({ json }) => json),
        values: f.units.filter((unit) => retained.has(unit.id)),
      })
    ).not.toBeNull();
    expect(JSON.stringify(f.history)).toBe(original);
  }
);

it.each([
  { olderLayer: true, newestLayer: false, reserve: true },
  { olderLayer: false, newestLayer: false, reserve: false },
  { olderLayer: true, newestLayer: true, reserve: false },
])(
  'keeps raster admission after removing a favicon, older layer=$olderLayer, newest layer=$newestLayer',
  async ({ olderLayer, newestLayer, reserve }) => {
    const f = fixture(olderLayer, 'file');
    const newest = f.history.snapshots.at(-1)!.assetId;
    const last = JSON.parse(f.content.get(newest)!) as Record<string, unknown>;
    f.content.set(
      newest,
      JSON.stringify({
        ...last,
        sourceImageData: 'data:image/png;base64,QUJDRA==',
        canvasJson: newestLayer ? last['canvasJson'] : '{"objects":[]}',
      })
    );
    const projected = await projectImageHistoryMetadata({
      history: f.history,
      readJson: async (assetId) => f.content.get(assetId)!,
      projectSnapshot: (snapshot) =>
        projectImageHistorySnapshotPrivacy(
          snapshot,
          createMediaHubBackupExportOptions({ includeSourceMetadata: false })
        ),
    });
    const retained = new Set(projected.values.map(({ id }) => id));
    const favicon = f.units.find(({ value }) => value === f.favicon)!;
    const source = f.units.find(({ kind, id }) => kind === 'image' && id !== favicon.id)!;
    const original = {
      version: 1,
      epoch: f.history.epoch,
      cursor: f.history.cursor,
      actions: f.history.actions,
      snapshots: f.history.snapshots.map(({ assetId }) => f.content.get(assetId)!),
      values: f.units,
    };
    const afterRedaction = {
      ...original,
      snapshots: projected.snapshots.map(({ json }) => json),
      values: f.units.filter(({ id }) => retained.has(id)),
    };
    const justBelow = {
      maxActions: 10,
      maxBytes: 30_000,
      maxAssetBytes: source.value.length + (reserve ? favicon.value.length : 0) - 1,
    };
    expect(retained.has(favicon.id)).toBe(olderLayer);
    expect(afterRedaction.snapshots.at(-1)).toContain('"faviconDataUrl":null');
    const exact = { ...justBelow, maxAssetBytes: justBelow.maxAssetBytes + 1 };
    expect(parseEditorImageHistoryCheckpoint(original, exact)).not.toBeNull();
    expect(parseEditorImageHistoryCheckpoint(afterRedaction, exact)).not.toBeNull();
    expect(parseEditorImageHistoryCheckpoint(original, justBelow)).toBeNull();
    expect(parseEditorImageHistoryCheckpoint(afterRedaction, justBelow)).toBeNull();
  }
);

it('sanitizes historical provenance URLs even when source metadata is included', async () => {
  const f = fixture();
  const projected = await projectImageHistoryMetadata({
    history: f.history,
    readJson: async (id) => f.content.get(id)!,
    projectSnapshot: (snapshot) =>
      projectImageHistorySnapshotPrivacy(snapshot, createMediaHubBackupExportOptions()),
  });
  const serialized = JSON.stringify(projected.snapshots);
  expect(serialized).toContain('example.test');
  expect(serialized).not.toContain('user:pass');
  expect(serialized).not.toContain('token=secret');
  expect(serialized).not.toContain('#hash');
  expect(projected.values).toEqual(f.history.values);
});

it.each([false, true])(
  'projects packed history privacy after one JSON read, shared=%s',
  async (shared) => {
    const f = fixture(shared, 'file');
    const bundle = JSON.stringify({
      version: 1,
      snapshots: f.history.snapshots.map((entry) => f.content.get(entry.assetId)!),
      values: f.units.filter((unit) => unit.kind === 'json'),
    });
    const history: PersistedImageHistory = {
      ...f.history,
      version: 2,
      snapshots: f.history.snapshots.map(() => ({ assetId: 'packed' })),
      values: f.history.values.map((unit) =>
        unit.kind === 'json' ? { ...unit, assetId: 'packed' } : unit
      ),
    };
    const original = JSON.stringify(history);
    const readJson = vi.fn(async (id: string) => {
      if (id !== 'packed') throw new Error('Must not read bitmap bytes.');
      return bundle;
    });
    const projected = await projectImageHistoryMetadata({
      history,
      readJson,
      projectSnapshot: (snapshot) =>
        projectImageHistorySnapshotPrivacy(
          snapshot,
          createMediaHubBackupExportOptions({ includeSourceMetadata: false })
        ),
    });
    expect(readJson).toHaveBeenCalledTimes(1);
    expect(projected.packed).not.toContain('Secret page title');
    expect(projected.packed).not.toContain('example.test');
    const faviconId = f.units.find((unit) => unit.value === f.favicon)!.id;
    expect(projected.values.some((unit) => unit.id === faviconId)).toBe(shared);
    const objects = new Map([...f.objects, ['packed', 'projected-packed']]);
    const portable = encodePortableImageHistory({
      history,
      objectsByAssetId: objects,
      values: projected.values,
    });
    expect(parsePortableImageHistory(portable)).toEqual(portable);
    const restored = decodePortableImageHistory({
      history: portable,
      assetsByObjectId: new Map([...objects.values()].map((id) => [id, `received-${id}`])),
    });
    expect(restored).toMatchObject({
      version: 2,
      cursor: 1,
      actions: history.actions,
      snapshots: projected.snapshots.map(() => ({ assetId: 'received-projected-packed' })),
    });
    expect(JSON.stringify(history)).toBe(original);
  }
);

it('refuses split JSON bundle pointers and extra portable keys', () => {
  const history: PersistedImageHistory = { ...fixture().history, version: 2 };
  expect(
    parsePortableImageHistory(
      encodePortableImageHistory({ history, objectsByAssetId: fixture().objects })
    )
  ).toBeNull();
});
