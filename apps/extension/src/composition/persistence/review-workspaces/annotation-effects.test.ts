import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
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
    'apps/extension/public/video-effects/animations/callout.sniptale-animation.json',
    'utf8'
  );
  const result = parseAnimationTemplateSource(source);
  if (!result.template) throw Error('Invalid source fixture');
  const hash = createHash('sha256').update(source).digest('hex');
  return {
    id: `effect:${hash}`,
    schemaVersion: 'sniptale.animation.v1',
    kind: 'standalone',
    documentId: result.template.id,
    sha256: hash,
    source,
    retainedByteLength: new TextEncoder().encode(source).byteLength,
    assets: [],
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
    anchors: { tip: { x: 0.5, y: 0.5 } },
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

it.each([0, 1])(
  'embedded sources cannot authorize detached private claims at cursor %i',
  (cursor) => {
    const value = workspace(cursor),
      retained = value.effectSnapshots![0]!;
    expect(
      reviewWorkspaceHasAnnotationEffectResource(
        value,
        {
          sourceAssetId: value.sourceAssetId,
          snapshotId: retained.id,
          resourceId: 'legacy-mark',
          sha256: 'a'.repeat(64),
        },
        { assetId: 'project-asset:mark', mimeType: 'image/svg+xml', byteLength: 358 }
      )
    ).toBe(false);
    expect(collectReviewAssetReferences(value)).toEqual(new Set());
  }
);

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

it('requires exact verified source admission without external prepared resource claims', async () => {
  const next = workspace(),
    previous = { ...next, history: [], effectSnapshots: [] },
    retained = next.effectSnapshots![0]!;
  const stores = { assets: { get: async () => undefined }, media: { get: async () => undefined } };
  const prepared = {
    assets: new Map(),
    libraryAudioClaims: [],
    resourceClaims: [],
    annotationEffectSources: [{ snapshot: retained, resources: new Map() }],
  };
  expect(await areNewReviewSourcesAvailable(next, previous, stores, prepared)).toBe(true);
  expect(
    await areNewReviewSourcesAvailable(next, previous, stores, {
      ...prepared,
      annotationEffectSources: [],
    })
  ).toBe(false);
  expect(
    await areNewReviewSourcesAvailable(next, previous, stores, {
      ...prepared,
      annotationEffectSources: [
        { snapshot: { ...retained, sha256: '0'.repeat(64) }, resources: new Map() },
      ],
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
    expect(collectReviewAssetReferences(parsed.workspace!)).toEqual(new Set());
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

it('portable roundtrip preserves self-contained source bytes without resource remapping', () => {
  const raw = workspace(),
    { sourceAssetId: _source, ...portable } = raw;
  expect(() => assertPortableReviewAssetRefs(portable)).not.toThrow();
  const encoded = encodePortableReviewAssetRefs({ workspace: portable, draft: null });
  expect(encoded.workspace.effectSnapshots?.[0]?.assets).toEqual([]);
  expect(decodePortableReviewAssetRefs(encoded.workspace)).toEqual(portable);
  const copied = remapReviewAssetReferences({ workspace: raw, draft: null }, new Map());
  expect(copied.workspace.effectSnapshots).toEqual(raw.effectSnapshots);
  expect(copied.workspace.history).toEqual(raw.history);
  expect(parseVideoWorkspace(copied.workspace)).not.toBeNull();
});
it.each([0, 1])(
  'unrelated asset removal preserves embedded sources and retained history at cursor %i',
  (cursor) => {
    const raw = workspace(cursor),
      cleaned = stripReviewAssetReference(raw, 'project-asset:mark', 2);
    expect(cleaned.effectSnapshots).toEqual(raw.effectSnapshots);
    expect(cleaned.history).toEqual(raw.history);
    expect(cleaned.cursor).toBe(cursor);
    expect(collectReviewAssetReferences(cleaned).size).toBe(0);
    expect(parseVideoWorkspace(cleaned)).not.toBeNull();
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
