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

export const journal = {
  assetRefs: [],
  createdAt: 1,
  domain: 'archive-restore',
  journalId: 'journal-1',
  payload: {},
} satisfies AssetReadyJournal;

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
