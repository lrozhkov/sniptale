import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { validateEffectV1Document } from '@sniptale/runtime-contracts/effect-v1';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffectSnapshot,
} from '../../../features/video/review/annotation-effects/types';
import { inspectVideoWorkspace, parseVideoWorkspace } from './parser';
import {
  collectReviewAssetReferences,
  encodePortableReviewAssetRefs,
  decodePortableReviewAssetRefs,
  assertPortableReviewAssetRefs,
  remapReviewAssetReferences,
  collectReviewAnnotationEffectSnapshotIds,
  pruneReviewAnnotationEffectSnapshots,
  reviewWorkspaceHasAnnotationEffectResource,
} from './asset-refs';
import { stripReviewAssetReference } from './strip-asset';
import {
  workspaceStorageHead,
  workspaceStorageRows,
  materializeWorkspaceStorage,
} from './storage-format';
import { readWorkspaceStorage, replaceWorkspaceStorage, writeWorkspaceStorage } from './storage';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import type { VideoWorkspace } from './contracts';
import { areNewReviewSourcesAvailable } from './new-reference-admission';

function snapshot(): ReviewAnnotationEffectSnapshot {
  const source = readFileSync(
    resolve(
      'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json'
    ),
    'utf8'
  );
  const result = validateEffectV1Document(JSON.parse(source));
  if (!result.ok || !result.document) throw new Error('Invalid source fixture');
  const asset = result.document.assets[0]!;
  const hash = 'a'.repeat(64);
  return {
    id: `effect:${hash}`,
    schemaVersion: 'sniptale.effect.v1',
    kind: 'standalone',
    documentId: result.document.id,
    sha256: hash,
    source,
    retainedByteLength: new TextEncoder().encode(source).byteLength + asset.byteLength!,
    assets: [
      {
        id: asset.id,
        kind: 'svg',
        mimeType: asset.mimeType,
        byteLength: asset.byteLength!,
        sha256: asset.sha256!,
        assetId: 'project-asset:mark',
      },
    ],
  };
}
function annotation(snapshotId: string): ReviewAnnotationEffect {
  return {
    id: 'effect',
    snapshotId,
    enabled: false,
    start: 1,
    end: 4,
    attachment: 'viewport',
    transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    controls: { accent: '#123456' },
    order: 0,
  };
}
function workspace(cursor = 0): VideoWorkspace {
  const effect = snapshot();
  const advanced = createQuickEditAdvancedState();
  const before = reviewAdvancedContentBaseline(advanced);
  const after = {
    ...before,
    annotationEffects: { enabled: false, instances: [annotation(effect.id)] },
  };
  return {
    aggregateId: 'review',
    sourceAssetId: 'source',
    formatVersion: 1,
    source: { duration: 10, width: 640, height: 360, size: 10, mimeType: 'video/webm' },
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    advanced,
    effectSnapshots: [effect],
    history: [{ id: 'apply', at: 1, target: 'advancedContent', before, after }],
    cursor,
  };
}

it.each([0, 1])('exact private claims survive disabled retained history at cursor %i', (cursor) => {
  const value = workspace(cursor);
  const snapshot = value.effectSnapshots![0]!;
  const asset = snapshot.assets[0]!;
  const claim = {
    sourceAssetId: value.sourceAssetId,
    snapshotId: snapshot.id,
    resourceId: asset.id,
    sha256: asset.sha256,
  };
  const resource = {
    assetId: asset.assetId,
    mimeType: asset.mimeType,
    byteLength: asset.byteLength,
  };
  expect(reviewWorkspaceHasAnnotationEffectResource(value, claim, resource)).toBe(true);
  for (const change of [
    { sourceAssetId: 'other' },
    { snapshotId: `effect:${'b'.repeat(64)}` },
    { resourceId: 'other' },
    { sha256: 'b'.repeat(64) },
  ])
    expect(
      reviewWorkspaceHasAnnotationEffectResource(value, { ...claim, ...change }, resource)
    ).toBe(false);
  for (const change of [
    { assetId: 'project-asset:other' },
    { mimeType: 'image/png' },
    { byteLength: asset.byteLength + 1 },
  ])
    expect(
      reviewWorkspaceHasAnnotationEffectResource(value, claim, { ...resource, ...change })
    ).toBe(false);
  expect(
    reviewWorkspaceHasAnnotationEffectResource({ ...value, history: [] }, claim, resource)
  ).toBe(false);
});

it('prunes only unreferenced snapshots when a redo branch is discarded', () => {
  const value = workspace(0);
  expect(collectReviewAnnotationEffectSnapshotIds(value)).toEqual(
    new Set([value.effectSnapshots![0]!.id])
  );
  expect(pruneReviewAnnotationEffectSnapshots(value).effectSnapshots).toEqual(
    value.effectSnapshots
  );
  expect(pruneReviewAnnotationEffectSnapshots({ ...value, history: [] }).effectSnapshots).toEqual(
    []
  );
  expect(value.effectSnapshots).toHaveLength(1);
  expect(value.history).toHaveLength(1);
});

it('admits only exact available private prepared claims, refusing generic prepared annotation bytes', async () => {
  const next = workspace();
  const previous = { ...next, history: [], effectSnapshots: [] };
  const retained = next.effectSnapshots![0]!;
  const asset = retained.assets[0]!;
  const entry = {
    id: 'mark',
    assetId: 'physical-mark',
    createdAt: 1,
    mimeType: asset.mimeType,
    size: asset.byteLength,
  };
  const payload = {
    entry,
    filename: 'mark.svg',
    expectedAssetId: null,
    publishToLibrary: false,
    requiredReviewAnnotationEffect: {
      aggregateId: next.aggregateId,
      sourceAssetId: next.sourceAssetId,
      snapshotId: retained.id,
      resourceId: asset.id,
      sha256: asset.sha256,
    },
  };
  const stores = { assets: { get: async () => undefined }, media: { get: async () => undefined } };
  const prepared = {
    assets: new Map(),
    libraryAudioClaims: [],
    resourceClaims: [{ payload, available: true }],
    annotationEffectSources: [
      { snapshot: retained, resources: new Map([[asset.assetId, entry.assetId]]) },
    ],
  };
  expect(await areNewReviewSourcesAvailable(next, previous, stores, prepared)).toBe(true);
  expect(
    await areNewReviewSourcesAvailable(next, previous, stores, {
      ...prepared,
      annotationEffectSources: [],
    })
  ).toBe(false);
  for (const claims of [
    [],
    [{ payload, available: false }],
    [
      {
        payload: {
          ...payload,
          requiredReviewAnnotationEffect: {
            ...payload.requiredReviewAnnotationEffect,
            sourceAssetId: 'other',
          },
        },
        available: true,
      },
    ],
    [{ payload: { ...payload, entry: { ...entry, size: entry.size + 1 } }, available: true }],
  ])
    expect(
      await areNewReviewSourcesAvailable(next, previous, stores, {
        ...prepared,
        resourceClaims: claims,
      })
    ).toBe(false);
  expect(
    await areNewReviewSourcesAvailable(next, previous, stores, {
      assets: new Map([[entry.id, entry]]),
      libraryAudioClaims: [],
    })
  ).toBe(false);
});

it.each([0, 1])(
  'retains disabled visual sources at cursor %i and after reopening without a catalog',
  (cursor) => {
    const raw = workspace(cursor);
    const original = structuredClone(raw);
    const parsed = inspectVideoWorkspace(raw);
    expect(parsed.failure).toBeNull();
    expect(parsed.workspace?.effectSnapshots).toEqual(raw.effectSnapshots);
    expect(parsed.document?.advancedContent.annotationEffects?.instances.length ?? 0).toBe(cursor);
    expect(parseVideoWorkspace(parsed.workspace)).toEqual(parsed.workspace);
    expect(raw).toEqual(original);
    expect(collectReviewAssetReferences(parsed.workspace!)).toEqual(
      new Set(['project-asset:mark'])
    );
  }
);

it('rejects missing registry in retained redo and malformed controls with bounded diagnostics', () => {
  const raw = workspace();
  const { effectSnapshots: _registry, ...missing } = raw;
  expect(inspectVideoWorkspace(missing).failure?.check).toBe('effect-snapshots');
  const operation = raw.history[0]!;
  if (operation.target !== 'advancedContent') throw new Error('Invalid fixture target');
  const instance = operation.after.annotationEffects!.instances[0]!;
  for (const change of [
    { snapshotId: 'missing' },
    { end: 11 },
    { controls: { intensity: 2 } },
    { anchors: { private: { x: 0, y: 0 } } },
  ]) {
    const candidate = {
      ...raw,
      history: [
        {
          ...operation,
          after: {
            ...operation.after,
            annotationEffects: { enabled: false, instances: [{ ...instance, ...change }] },
          },
        },
      ],
    };
    const result = inspectVideoWorkspace(candidate);
    expect(result.workspace).toBeNull();
    expect(result.failure?.check).toBe('effect-snapshots');
    expect(JSON.stringify(result.failure)).not.toMatch(/private|intensity|source|accent/);
  }
});

it('legacy omission stays absent and advanced version 14 cannot carry unadmitted annotation content', () => {
  const raw = workspace();
  const legacy = {
    ...raw,
    advanced: { ...raw.advanced, schemaVersion: 14 },
    history: [],
    cursor: 0,
  };
  const parsed = parseVideoWorkspace(legacy)!;
  expect(parsed.advanced).not.toHaveProperty('annotationEffects');
  expect(parsed.advanced.ui.tracks).not.toHaveProperty('annotationEffects');
  expect(
    parseVideoWorkspace({
      ...legacy,
      advanced: { ...legacy.advanced, annotationEffects: { enabled: true, instances: [] } },
    })
  ).toBeNull();
});

it('keeps registry out of the slim head and every operation row, and rejects mixed physical ownership', () => {
  const raw = workspace();
  const head = workspaceStorageHead(raw, []),
    rows = workspaceStorageRows(raw);
  expect(head).not.toHaveProperty('effectSnapshots');
  expect(rows[0]).toHaveProperty('effectSnapshots', raw.effectSnapshots);
  expect(rows[1]).not.toHaveProperty('effectSnapshots');
  expect(parseVideoWorkspace(materializeWorkspaceStorage(head, rows))).toEqual(raw);
  expect(
    parseVideoWorkspace(
      materializeWorkspaceStorage({ ...head, effectSnapshots: raw.effectSnapshots }, rows)
    )
  ).toBeNull();
  expect(
    parseVideoWorkspace(
      materializeWorkspaceStorage(head, [rows[0], { ...rows[1], effectSnapshots: [] }])
    )
  ).toBeNull();
});

it('portable roundtrip remaps registry resources, refusing missing maps and local keys', () => {
  const raw = workspace();
  const { sourceAssetId: _source, ...portable } = raw;
  expect(() => assertPortableReviewAssetRefs(portable)).toThrow('local asset id');
  const encoded = encodePortableReviewAssetRefs({ workspace: portable, draft: null });
  expect(() => assertPortableReviewAssetRefs(encoded.workspace)).not.toThrow();
  expect(encoded.workspace.effectSnapshots?.[0]?.assets[0]).not.toHaveProperty('assetId');
  expect(decodePortableReviewAssetRefs(encoded.workspace)).toEqual(portable);
  const input = { workspace: raw, draft: null };
  expect(() => remapReviewAssetReferences(input, new Map())).toThrow('unresolved');
  const copied = remapReviewAssetReferences(input, new Map([['mark', 'copied']]));
  expect(copied.workspace.effectSnapshots?.[0]?.assets[0]?.assetId).toBe('project-asset:copied');
  expect(copied.workspace.history).toEqual(raw.history);
  expect(raw.effectSnapshots?.[0]?.assets[0]?.assetId).toBe('project-asset:mark');
  expect(parseVideoWorkspace(copied.workspace)).not.toBeNull();
});

it.each([0, 1])(
  'confirmed asset removal cleans snapshots and redo together at cursor %i',
  (cursor) => {
    const raw = workspace(cursor);
    const cleaned = stripReviewAssetReference(raw, 'project-asset:mark', 2);
    expect(cleaned.effectSnapshots).toEqual([]);
    expect(cleaned.cursor).toBe(cursor);
    expect(cleaned.history).toHaveLength(1);
    const retained = cleaned.history[0]!;
    if (retained.target !== 'advancedContent') throw new Error('Invalid retained target');
    expect(retained.after.annotationEffects).toEqual({ enabled: false, instances: [] });
    expect(collectReviewAssetReferences(cleaned).size).toBe(0);
    expect(parseVideoWorkspace(cleaned)).not.toBeNull();
    expect(raw.history).toHaveLength(1);
  }
);

it('moves the cursor without rewriting sources and appends only baseline, operation and head', async () => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const stores = ['video_workspaces', 'video_workspace_history'];
  const raw = workspace(1);
  const setup = fixture.database.transaction(stores, 'readwrite');
  await replaceWorkspaceStorage(setup, raw, []);
  await setup.done;
  const original = structuredClone(fixture.rows.get('video_workspace_history'));
  const read = fixture.database.transaction(stores, 'readonly');
  const storage = await readWorkspaceStorage(read, 'review');
  await read.done;
  const writes: { store: string; value: unknown }[] = [];
  const tx = fixture.database.transaction(stores, 'readwrite');
  const observed = {
    objectStore(name: string) {
      const store = tx.objectStore(name);
      return {
        ...store,
        put(value: unknown) {
          writes.push({ store: name, value });
          return store.put(value);
        },
      };
    },
  };
  await writeWorkspaceStorage(observed, {
    storage,
    previous: raw,
    workspace: { ...raw, cursor: 0, revision: 2 },
    usageReferenceKeys: [],
    mode: 'cursor',
  });
  await tx.done;
  expect(writes.map((write) => write.store)).toEqual(['video_workspaces']);
  expect(writes[0]?.value).not.toHaveProperty('effectSnapshots');
  expect(fixture.rows.get('video_workspace_history')).toEqual(original);

  const empty = { ...raw, history: [], cursor: 0, effectSnapshots: [] };
  const initialize = fixture.database.transaction(stores, 'readwrite');
  await replaceWorkspaceStorage(initialize, empty, []);
  await initialize.done;
  const reader = fixture.database.transaction(stores, 'readonly');
  const emptyStorage = await readWorkspaceStorage(reader, 'review');
  await reader.done;
  const apply = fixture.database.transaction(stores, 'readwrite');
  writes.length = 0;
  const applyObserved = {
    objectStore(name: string) {
      const store = apply.objectStore(name);
      return {
        ...store,
        put(value: unknown) {
          writes.push({ store: name, value });
          return store.put(value);
        },
      };
    },
  };
  await writeWorkspaceStorage(applyObserved, {
    storage: emptyStorage,
    previous: empty,
    workspace: raw,
    usageReferenceKeys: [],
    mode: 'append',
  });
  await apply.done;
  expect(writes.map((write) => write.store)).toEqual([
    'video_workspace_history',
    'video_workspace_history',
    'video_workspaces',
  ]);
  expect(writes[0]?.value).not.toHaveProperty('effectSnapshots');
  expect(writes[1]?.value).toHaveProperty('effectSnapshots');
  expect(writes[2]?.value).not.toHaveProperty('effectSnapshots');
});
