import type { Mock } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { materializeWorkspaceStorage } from '../../../../composition/persistence/review-workspaces/storage-format';
import { createMediaLibraryEntry } from '../../../../composition/persistence/projects/index.test-support';
import { materializeVideoWorkspaceProject } from '../../../../composition/persistence/review-workspaces/project-metadata';
import { readFileSync } from 'node:fs';
import {
  sha256EffectV1Bytes,
  validateEffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import { reviewAdvancedContentBaseline } from '../../../../features/video/review/document';
import type { ReviewAnnotationEffectSnapshot } from '../../../../features/video/review/annotation-effects/types';
import type {
  ArchiveRestoreSession,
  AssetReadyJournal,
} from '../../../../composition/persistence/assets';
import { encodePortableReviewAssetRefs } from '../../../../composition/persistence/review-workspaces/asset-refs';
import { createQuickEditAdvancedState } from '../../../../features/video/review/advanced/defaults';
import type { ReviewOperation } from '../../../../features/video/review/types';
import { assertPortableJson } from '../codec';
import type { JsonValue } from '../contracts';
import type { AssetRef } from '../../../../composition/persistence/assets';
import type { VideoWorkspaceSnapshot } from '../../../../composition/persistence/review-workspaces/contracts';
import type { CapturedVideoReviewRows } from '../../../../composition/persistence/sync-capture/review-snapshot';
import { parseVideoWorkspace } from '../../../../composition/persistence/review-workspaces/parser';
import { createQuickEditWebcam } from '../../../../features/video/review/advanced/webcam';

export const journal = {
  assetRefs: [],
  createdAt: 1,
  domain: 'archive-restore',
  journalId: 'journal-1',
  payload: {},
} satisfies AssetReadyJournal;

/** Install the native table fixture through the suite's mutation and write mocks. */
export function installDatabase(
  metadata: {
    entry: { id: string };
    projectExport?: object;
    projectAsset?: { id: string };
  },
  runMutation: Mock,
  write: (value: Record<string, unknown>) => unknown
) {
  const review = reviewFixture();
  const tables = new Map<string, Map<string, unknown>>([
    ['media_library', new Map([[metadata.entry.id, metadata.entry]])],
    [
      'project_exports',
      new Map(
        metadata.projectExport ? [['e', { ...metadata.projectExport, assetId: 'old-local' }]] : []
      ),
    ],
    [
      'project_assets',
      new Map(
        metadata.projectAsset
          ? [[metadata.projectAsset.id, { ...metadata.projectAsset, assetId: 'old-local' }]]
          : []
      ),
    ],
    [
      'video_workspaces',
      new Map([
        [
          metadata.entry.id,
          { ...review.workspace, aggregateId: metadata.entry.id, sourceAssetId: 'old-local' },
        ],
      ]),
    ],
    ['video_workspace_drafts', new Map([[metadata.entry.id, review.draft]])],
    ['aggregate_presentations', new Map()],
    ['image_workspaces', new Map()],
  ]);
  const storeFor = (name: string) => {
    const table = tables.get(name) ?? new Map<string, unknown>();
    tables.set(name, table);
    return {
      get: async (key: IDBValidKey) =>
        table.get(Array.isArray(key) ? JSON.stringify(key) : String(key)),
      getAll: async () => [...table.values()],
      delete: async (key: IDBValidKey) =>
        table.delete(Array.isArray(key) ? JSON.stringify(key) : String(key)),
      put: async (value: Record<string, unknown>) => {
        write(value);
        const key =
          name === 'video_workspace_history'
            ? JSON.stringify([value['aggregateId'], value['ordinal']])
            : (value['aggregateId'] ?? value['id'] ?? value['assetId'] ?? 'other');
        table.set(String(key), structuredClone(value));
      },
      index: (indexName: string) => ({
        count: async () => 0,
        getAll: async (key: IDBValidKey) =>
          [...table.values()].filter(isRecord).filter((row) => row[indexName] === key),
        getAllKeys: async (key: IDBValidKey) =>
          [...table.values()]
            .filter(isRecord)
            .filter((row) => row[indexName] === key)
            .map((row) => {
              if (typeof row['aggregateId'] !== 'string' || typeof row['ordinal'] !== 'number')
                throw new Error('Invalid history fixture key');
              return [row['aggregateId'], row['ordinal']];
            }),
      }),
    };
  };
  runMutation.mockImplementation(async (callback) =>
    callback({
      get: async (name: string, key: IDBValidKey) => storeFor(name).get(key),
      transaction: () => ({ objectStore: storeFor, done: Promise.resolve() }),
    })
  );
  return tables;
}

/** Read logical reviews from the fixture's native workspace and history rows. */
export function logicalReviewValues(tables: Map<string, Map<string, unknown>>) {
  return [...(tables.get('video_workspaces')?.values() ?? [])].map((head) => {
    const ownRows = [...(tables.get('video_workspace_history')?.values() ?? [])].filter(
      (row) => isRecord(row) && isRecord(head) && row['aggregateId'] === head['aggregateId']
    );
    const workspace = parseVideoWorkspace(materializeWorkspaceStorage(head, ownRows));
    if (!workspace) throw new Error('Invalid restored workspace fixture');
    return workspace;
  });
}

function clip(id: string, assetId: string, timelineStart: number) {
  return {
    id,
    assetId,
    timelineStart,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
}

export function reviewFixture() {
  const advanced = {
    ...createQuickEditAdvancedState(),
    background: {
      enabled: true as const,
      type: 'image' as const,
      assetId: 'project-asset:background',
      imageFit: 'cover' as const,
      layout: { padding: 0, cornerRadius: 0 },
    },
    audio: {
      original: { muted: false, volume: 1 },
      voiceover: [],
      music: [clip('music', 'project-asset:music', 0)],
    },
  };
  const before = {
    schemaVersion: advanced.schemaVersion,
    zoom: advanced.zoom,
    background: advanced.background,
    audio: advanced.audio,
  };
  const after = {
    ...before,
    audio: { ...before.audio, voiceover: [clip('voice', 'project-asset:voice', 1)] },
  };
  return {
    workspace: {
      aggregateId: 'export:e',
      formatVersion: 1 as const,
      source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
      revision: 3,
      history: [
        { id: 'advanced', at: 1, target: 'advancedContent', before, after },
      ] as ReviewOperation[],
      cursor: 1,
      advanced,
      createdAt: 1,
      updatedAt: 2,
    },
    draft: {
      aggregateId: 'export:e',
      revision: 2,
      annotation: {
        id: 'draft',
        text: 'Recovered text',
        anchor: { kind: 'point' as const, time: 1 },
      },
      before: null,
      updatedAt: 2,
    },
  };
}

export function portableMetadata(explicitMime: boolean) {
  const projectExport = {
    id: 'e',
    projectId: 'p',
    filename: 'result.webm',
    createdAt: 1,
    size: 6,
    ...(explicitMime ? { mimeType: 'video/webm' } : {}),
    duration: 2,
    width: 640,
    height: 360,
    fps: 30,
  };
  return {
    entry: {
      id: 'export:e',
      kind: 'export',
      source: { kind: 'project-export', exportId: 'e', projectId: 'p' },
      filename: 'result.webm',
      originalFilename: 'result.webm',
      createdAt: 1,
      updatedAt: 1,
      size: 6,
      mimeType: 'video/webm',
      duration: 2,
      width: 640,
      height: 360,
      tags: [],
      sourceUrl: null,
      sourceTitle: null,
      sourceFavicon: null,
    },
    projectExport,
    originalObjectId: 'o',
    videoReview: encodePortableReviewAssetRefs(reviewFixture()),
    reviewAssets: ['background', 'music', 'voice'].map((id) => ({
      entry: {
        id,
        mimeType: id === 'background' ? 'image/png' : 'audio/mpeg',
        createdAt: 1,
        size: 10,
      },
      filename: `${id}.${id === 'background' ? 'png' : 'mp3'}`,
      objectId: `${id}-object`,
    })),
  };
}

function staged(objectId: string, assetId: string, mimeType: string, size: number) {
  return {
    objectId,
    ref: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      mimeType,
      sha256: null,
      size,
    },
  };
}

export function stagedObjects() {
  return [
    staged('o', 'new-local', 'video/webm', 6),
    staged('background-object', 'background-bytes', 'image/png', 10),
    staged('music-object', 'music-bytes', 'audio/mpeg', 10),
    staged('voice-object', 'voice-bytes', 'audio/mpeg', 10),
  ];
}

export function session(strategy: 'skip' | 'replace' | 'duplicate'): ArchiveRestoreSession {
  return {
    archiveFingerprint: 'a'.repeat(64),
    childIdMap: {},
    committedRoots: [],
    conflictedRoots: [],
    createdAt: 1,
    currentRoot: 'media:library-item:export:e',
    kind: 'archive-restore-session',
    operationId: 'restore-1',
    rootIdMap: {},
    skippedRoots: [],
    status: 'pending',
    strategy,
    updatedAt: 1,
  };
}

export function portableJson(value: unknown): JsonValue {
  assertPortableJson(value);
  return value;
}

export async function annotationReviewFixture() {
  const result = validateEffectV1Document(
    JSON.parse(
      readFileSync(
        'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json',
        'utf8'
      )
    )
  );
  if (!result.ok || !result.document) throw new Error('Invalid annotation fixture');
  const blob = new Blob(
    ['<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'],
    { type: 'image/svg+xml' }
  );
  const resourceHash = await sha256EffectV1Bytes(new Uint8Array(await blob.arrayBuffer()));
  const resource = result.document.assets[0];
  if (!resource) throw new Error('Missing fixture resource');
  const source = JSON.stringify({
    ...result.document,
    assets: [{ ...resource, sha256: resourceHash, byteLength: blob.size }],
  });
  const sha256 = await sha256EffectV1Bytes(new TextEncoder().encode(source));
  const snapshot: ReviewAnnotationEffectSnapshot = {
    id: `effect:${sha256}`,
    schemaVersion: 'sniptale.effect.v1',
    kind: 'standalone',
    documentId: result.document.id,
    sha256,
    source,
    retainedByteLength: new TextEncoder().encode(source).byteLength + blob.size,
    assets: [
      {
        id: resource.id,
        assetId: 'project-asset:mark',
        kind: 'svg',
        mimeType: blob.type,
        byteLength: blob.size,
        sha256: resourceHash,
      },
    ],
  };
  const base = reviewFixture();
  const advanced = {
    ...createQuickEditAdvancedState(),
    annotationEffects: { enabled: false, instances: [] },
  };
  const before = reviewAdvancedContentBaseline(advanced);
  const instance = {
    id: 'effect',
    snapshotId: snapshot.id,
    enabled: false,
    start: 0,
    end: 1,
    attachment: 'viewport' as const,
    transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    controls: { accent: '#7cf7ff', intensity: 0.8 },
    order: 0,
  };
  const operation: ReviewOperation = {
    id: 'effect-redo',
    at: 1,
    target: 'advancedContent',
    before,
    after: { ...before, annotationEffects: { enabled: false, instances: [instance] } },
  };
  const review = {
    ...base,
    workspace: {
      ...base.workspace,
      advanced,
      cursor: 0,
      history: [operation],
      effectSnapshots: [snapshot],
    },
  };
  return { review, snapshot, blob };
}

/** Saved project-asset review with no unrelated resource families. */
export function projectAssetReviewMetadata() {
  const id = 'project-asset:review-original';
  const base = reviewFixture();
  const native = materializeVideoWorkspaceProject(
    {
      ...base.workspace,
      aggregateId: id,
      sourceAssetId: 'portable',
      history: [],
      cursor: 0,
      advanced: createQuickEditAdvancedState(),
    },
    'Transferred review'
  );
  const { sourceAssetId: _sourceAssetId, ...workspace } = native;
  return {
    entry: createMediaLibraryEntry({
      id,
      kind: 'video',
      filename: 'review.webm',
      originalFilename: 'review.webm',
      mimeType: 'video/webm',
      size: 6,
      source: { kind: 'project-asset', projectAssetId: 'review-original' },
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
    }),
    projectAsset: { id: 'review-original', mimeType: 'video/webm', size: 6, createdAt: 1 },
    originalObjectId: 'review-original-object',
    videoReview: encodePortableReviewAssetRefs({
      workspace,
      draft: { ...base.draft, aggregateId: id },
    }),
  };
}

/** One flat private video closure, with a redo-only edge and an optional resource cycle. */
export function nestedMediaReviewFixture(cycle: boolean) {
  const base = projectAssetReviewMetadata();
  const source = reviewFixture().workspace.source;
  function snapshot(id: string, child?: string, redo = false): VideoWorkspaceSnapshot {
    const advanced = createQuickEditAdvancedState();
    const webcam = child
      ? createQuickEditWebcam(`project-asset:${child}`, source, source)
      : undefined;
    const before = reviewAdvancedContentBaseline(advanced);
    const history: ReviewOperation[] =
      webcam && redo
        ? [
            {
              id: `redo-${id}`,
              at: 1,
              target: 'advancedContent',
              before,
              after: { ...before, webcam },
            },
          ]
        : [];
    const aggregateId = `project-asset:${id}`;
    const workspace = parseVideoWorkspace({
      ...reviewFixture().workspace,
      aggregateId,
      sourceAssetId: `${id}-bytes`,
      advanced: webcam && !redo ? { ...advanced, webcam } : advanced,
      history,
      cursor: 0,
    });
    if (!workspace) throw new Error('Invalid nested review fixture.');
    return {
      workspace: materializeVideoWorkspaceProject(workspace, `Review ${id}`),
      draft: {
        ...reviewFixture().draft,
        aggregateId,
        annotation: {
          ...reviewFixture().draft.annotation,
          text: `Draft ${id}`,
        },
      },
    };
  }
  const reviews = [
    snapshot('review-original', 'b'),
    snapshot('b', 'c', true),
    snapshot('c', cycle ? 'b' : undefined),
  ];
  const portableReview = (review: VideoWorkspaceSnapshot) => {
    const {
      sourceAssetId: _source,
      typing: _typing,
      sourceMediaId: _media,
      ...workspace
    } = review.workspace;
    return encodePortableReviewAssetRefs({ workspace, draft: review.draft });
  };
  const reference = (id: string): AssetRef => ({
    assetId: `${id}-bytes`,
    createdAt: 1,
    size: 6,
    mimeType: 'video/webm',
    sha256: null,
    location: { kind: 'opfs', objectKey: `objects/${id}-bytes` },
  });
  const assets = ['b', 'c'].map((id) => ({
    id,
    assetId: `${id}-bytes`,
    createdAt: 1,
    size: 6,
    mimeType: 'video/webm',
  }));
  const rows: CapturedVideoReviewRows = {
    review: reviews[0]!,
    source: {
      media: { ...base.entry, workspaceRevision: 0 },
      projectAsset: { ...base.projectAsset, assetId: 'review-original-bytes' },
      ref: reference('review-original'),
    },
    assets,
    refs: assets.map((asset) => reference(asset.id)),
    media: [],
    privateReviews: reviews.slice(1),
  };
  const metadata = {
    ...base,
    videoReview: portableReview(rows.review),
    reviewAssets: assets.map(({ assetId: _asset, ...entry }, index) => ({
      entry,
      filename: `${entry.id}.webm`,
      objectId: `${entry.id}-object`,
      publishToLibrary: false,
      videoReview: portableReview(reviews[index + 1]!),
    })),
  };
  const staged = [
    { objectId: base.originalObjectId, ref: rows.source.ref },
    ...rows.assets.map((asset) => ({ objectId: `${asset.id}-object`, ref: reference(asset.id) })),
  ];
  return { rows, metadata, staged };
}
