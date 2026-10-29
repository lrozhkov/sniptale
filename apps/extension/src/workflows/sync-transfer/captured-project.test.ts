import { CaptureMode, VideoDisplaySurface } from '@sniptale/runtime-contracts/video/types/types';
import { parseVideoProjectEntry } from '../../composition/persistence/projects/read-guards';
import { VideoProjectAssetType } from '../../features/video/project/types';
import { createVideoProjectAsset } from '../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../features/video/project/factories/clip';
import { parseCapturedVideoProjectRows } from '../../composition/persistence/sync-capture/project-snapshot';
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import { VideoProjectTrackRole } from '../../features/video/project/types';
import {
  buildProjectExportMediaEntry,
  buildRecordingMediaEntry,
} from '../../composition/persistence/media-library/entry-mapping';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../tooling/test/support/effect-v1-corpus.test-support';
import type { AssetRef } from '../../composition/persistence/assets';
import type { CapturedVideoProjectRows } from '../../composition/persistence/sync-capture/contracts';
import {
  createProjectAssetEntry,
  createProjectExportEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../composition/persistence/projects/index.test-support';
import { importEffectBundleZip } from '../../features/video/project/effect-bundle/import/zip';
import { parsePortableVideoProjectMetadata } from '../media-hub-backup/v6/root-codecs/projects';
import { encodeCapturedProjectRoot } from './captured-project';
import { parsePortableSyncRoot, preparePortableReplica } from './prepared-root';
import { workspace as reviewWorkspace } from '../../composition/persistence/review-workspaces/backup-restore.test-support';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { parseSyncOperationText } from './wire-record';

const io = vi.hoisted(() => ({ read: vi.fn(), files: new Map<string, File>() }));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: io.read,
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.files.clear();
  io.read.mockImplementation(async (ref: AssetRef, filename: string) => {
    const file = new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType });
    io.files.set(ref.assetId, file);
    return file;
  });
});

function projectRows(): CapturedVideoProjectRows {
  const project = createVideoProjectEntryWithMediaClip({
    id: 'project-one',
    name: 'Frozen project',
  });
  const asset = createProjectAssetEntry({
    id: 'project-asset-1',
    assetId: 'source-original',
    mimeType: 'video/webm',
    size: 1024,
  });
  const exported = createProjectExportEntry({
    id: 'export-one',
    projectId: project.id,
    assetId: 'export-original',
    // Identical names, MIME and sizes must not substitute one native binding for another.
    filename: 'Asset 001.webm',
    mimeType: asset.mimeType,
    size: asset.size,
  });
  return {
    project,
    assets: [asset],
    exports: [exported],
    media: [],
    refs: [asset, exported].map((entry) => ({
      assetId: entry.assetId,
      createdAt: entry.createdAt,
      location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
      mimeType: entry.mimeType ?? 'video/webm',
      size: entry.size,
      sha256: null,
    })),
    mediaDependencies: [],
  };
}

it('preserves Scenario source kinds through frozen backup and prepared exact native child mappings', async () => {
  const rows = projectRows();
  const child = {
    assetId: 'scenario-native-bytes',
    id: 'scenario-child',
    projectId: 'scenario-source',
    galleryAssetId: null,
    mimeType: 'image/png',
    size: 3,
    width: 10,
    height: 10,
    createdAt: 1,
  };
  const ref: AssetRef = {
    assetId: child.assetId,
    mimeType: child.mimeType,
    size: child.size,
    createdAt: 1,
    sha256: 'a'.repeat(64),
    location: { kind: 'opfs', objectKey: `objects/${child.assetId}` },
  };
  const asset = createVideoProjectAsset(
    'Scenario image',
    VideoProjectAssetType.IMAGE,
    { kind: 'scenario-asset', scenarioAssetId: child.id },
    {
      audioPeaks: null,
      duration: 0,
      hasAudio: false,
      width: child.width,
      height: child.height,
      mimeType: child.mimeType,
      size: child.size,
    }
  );
  rows.project.project.assets = [asset];
  rows.project.project.clips = [
    createVideoClipFromAsset(
      rows.project.project.tracks[0]!.id,
      asset,
      rows.project.project.width,
      rows.project.project.height
    ),
  ];
  rows.project.project.source = { kind: 'scenario', scenarioProjectId: child.projectId };
  rows.assets = [];
  rows.exports = [];
  rows.refs = [ref];
  rows.scenarioAssets = [child];
  rows.rootDependencies = [
    {
      rootKind: 'scenario-project',
      rootId: child.projectId,
      generation: 2,
      basis: ['scenario-head'],
      childIds: [child.id],
    },
  ];
  expect(parseCapturedVideoProjectRows(rows)).not.toBeNull();
  const portable = await encodeCapturedProjectRoot(rows);
  expect(portable.rootDependencies).toEqual(rows.rootDependencies);
  expect(portable.objects).toEqual([]);
  const metadata = parsePortableVideoProjectMetadata(portable.envelope.metadata);
  expect(metadata.projectAssets).toEqual([]);
  expect(metadata.entry.project.source).toEqual(rows.project.project.source);
  const wire = {
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: 'space',
    operationId: 'montage-head',
    rootKind: 'video-project',
    rootId: rows.project.id,
    kind: 'edit',
    parents: [],
    dependencies: [],
    rootDependencies: rows.rootDependencies.map(({ rootKind, rootId, basis, childIds }) => ({
      rootKind,
      rootId,
      basis,
      childIds,
    })),
    envelope: portable.envelope,
    objects: [],
  };
  expect((await parseSyncOperationText(JSON.stringify(wire))).rootDependencies).toEqual(
    wire.rootDependencies
  );
  const parsed = await parsePortableSyncRoot(portable.envelope);
  expect(parsed.kind).toBe('video-project');
  const rootDependency = {
    rootKind: 'scenario-project' as const,
    rootId: child.projectId,
    expectedGeneration: 2,
    expectedBasis: ['scenario-head'],
    expectedWorkspaceRevision: 4,
    nativeDigest: 'b'.repeat(64),
    children: [{ entry: child, ref }],
  };
  const args = {
    envelope: portable.envelope,
    verifiedObjects: new Map<string, AssetRef>(),
    senderDependencies: [],
    senderRootDependencies: rows.rootDependencies,
    admission: {
      spaceId: 'space',
      profileCreatedAt: 1,
      connectionGeneration: 1,
      operationId: 'montage-head',
      sourceDigest: 'c'.repeat(64),
      expectedBasis: [],
      expectedLocalGeneration: 0,
      expectedWorkspaceRevision: null,
      dependencies: [],
      rootDependencies: [rootDependency],
    },
  };
  const prepared = await preparePortableReplica(args);
  expect(prepared.kind).toBe('video-project');
  if (prepared.kind !== 'video-project') throw new Error('Expected Montage preparation.');
  expect(prepared.input.root.entry.project.source).toEqual(rows.project.project.source);
  expect(prepared.input.root.entry.project.assets[0]!.source).toEqual(asset.source);
  expect(prepared.input.rootDependencies).toEqual([rootDependency]);
  await expect(
    preparePortableReplica({
      ...args,
      senderRootDependencies: [{ ...rows.rootDependencies[0]!, childIds: ['wrong-child'] }],
    })
  ).rejects.toThrow();
  await expect(
    preparePortableReplica({
      ...args,
      admission: {
        ...args.admission,
        rootDependencies: [
          {
            ...rootDependency,
            children: [{ entry: { ...child, projectId: 'foreign-scenario' }, ref }],
          },
        ],
      },
    })
  ).rejects.toThrow();
  await expect(
    preparePortableReplica({
      ...args,
      admission: {
        ...args.admission,
        rootDependencies: [
          {
            ...rootDependency,
            children: [
              { entry: { ...child, size: child.size + 1 }, ref: { ...ref, size: ref.size + 1 } },
            ],
          },
        ],
      },
    })
  ).rejects.toThrow('source metadata');
});

it('uses backup project inventory and binds exact native originals without copying their files', async () => {
  const rows = projectRows();
  const result = await encodeCapturedProjectRoot(rows);
  const metadata = parsePortableVideoProjectMetadata(result.envelope.metadata);
  const source = metadata.projectAssets[0]!;
  const exported = metadata.projectExports[0]!;
  expect(result.bindings).toEqual([
    { objectId: source.objectId, ref: rows.refs[0] },
    { objectId: exported.objectId, ref: rows.refs[1] },
  ]);
  expect(result.objects.map((object) => object.ref.filename)).toEqual([
    'Asset 001.webm',
    'Asset 001.webm',
  ]);
  for (const binding of result.bindings)
    expect(result.objects.find((object) => object.ref.objectId === binding.objectId)!.blob).toBe(
      io.files.get(binding.ref.assetId)
    );
  expect(source.publishToLibrary).toBe(false);
  expect(result.dependencies).toEqual([]);
  expect(JSON.stringify(result.envelope)).not.toContain('source-original');
  expect(JSON.stringify(result.envelope)).not.toContain('export-original');
  expect(result.envelope.descriptor.totalBytes).toBe(2048);
});

it('detaches the complete project before the first asynchronous source read', async () => {
  const rows = projectRows();
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  io.read.mockImplementationOnce(async (ref: AssetRef, filename: string) => {
    entered();
    await gate;
    return new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType });
  });
  const pending = encodeCapturedProjectRoot(rows);
  await started;
  rows.project.project.name = 'Live replacement';
  rows.assets[0]!.assetId = 'live-replacement';
  rows.refs[0]!.assetId = 'live-replacement';
  release();
  const result = await pending;
  expect(JSON.stringify(result.envelope)).not.toContain('Live replacement');
  expect(result.bindings[0]!.ref.assetId).toBe('source-original');
});

it('keeps effect binary objects unbound while preserving the complete backup snapshot metadata', async () => {
  const corpus = EFFECT_BUNDLE_CORPUS.find(
    ({ accepted, artifact }) => accepted && artifact.includes('asset-bearing-conformance')
  );
  if (!corpus) throw new Error('Missing asset-bearing effect fixture.');
  const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(corpus));
  if (!imported.ok) throw new Error('Invalid effect fixture.');
  const document = imported.bundle.documents[0]!;
  const rows = projectRows();
  rows.project.project.effectSnapshots = [
    {
      id: `effect:${document.sha256}`,
      documentId: document.document.id,
      kind: document.document.kind,
      schemaVersion: 'sniptale.effect.v1',
      sha256: document.sha256,
      source: document.source,
      retainedByteLength:
        new TextEncoder().encode(document.source).byteLength +
        document.assets.reduce((sum, asset) => sum + asset.byteLength, 0),
      assets: document.assets.map((asset) => ({
        blob: new Blob([Uint8Array.from(asset.bytes).buffer], { type: asset.mimeType }),
        id: asset.id,
        kind: asset.kind,
        byteLength: asset.byteLength,
        mimeType: asset.mimeType,
        sha256: asset.sha256,
      })),
    },
  ];
  const result = await encodeCapturedProjectRoot(rows);
  const metadata = parsePortableVideoProjectMetadata(result.envelope.metadata);
  const snapshots = metadata.entry.project.effectSnapshots!;
  expect(snapshots[0]!.source).toBe(document.source);
  expect(result.objects).toHaveLength(2 + document.assets.length);
  expect(result.bindings).toHaveLength(2);
  for (const asset of snapshots[0]!.assets) {
    expect(asset).not.toHaveProperty('blob');
    expect(result.bindings.some((binding) => binding.objectId === asset.objectId)).toBe(false);
    const object = result.objects.find((object) => object.ref.objectId === asset.objectId)!;
    expect(object.ref.size).toBe(asset.byteLength);
    expect(object.ref.filename).not.toContain(':');
  }
});

it('refuses missing dependency evidence and changed native file metadata', async () => {
  const rows = projectRows();
  delete rows.mediaDependencies;
  await expect(encodeCapturedProjectRoot(rows)).rejects.toThrow('dependency evidence');
  expect(io.read).not.toHaveBeenCalled();
  rows.mediaDependencies = [];
  io.read.mockResolvedValue(new File(['short'], 'Asset 001.webm', { type: 'video/webm' }));
  await expect(encodeCapturedProjectRoot(rows)).rejects.toThrow('native reference');
});

it.each([false, true])(
  'preserves recursive reviews through encoding and replica preparation (cycle=%s)',
  async (cycle) => {
    const rows = projectRows();
    const source = rows.assets[0]!;
    const camera = createProjectAssetEntry({
      id: 'camera-b',
      assetId: 'camera-b-original',
      mimeType: 'video/webm',
      size: 6,
    });
    const nested = createProjectAssetEntry({
      id: 'camera-c',
      assetId: 'camera-c-original',
      mimeType: 'video/webm',
      size: 6,
    });
    rows.assets.push(camera, nested);
    for (const asset of [camera, nested])
      rows.refs.push({
        assetId: asset.assetId,
        createdAt: asset.createdAt,
        location: { kind: 'opfs', objectKey: `objects/${asset.assetId}` },
        mimeType: asset.mimeType,
        size: asset.size,
        sha256: null,
      });
    rows.reviews = [
      { source, supplementary: camera },
      { source: camera, supplementary: nested },
      ...(cycle ? [{ source: nested, supplementary: camera }] : []),
    ].map(({ source: owner, supplementary }) => {
      const workspace = parseVideoWorkspace({
        ...reviewWorkspace,
        aggregateId: `project-asset:${owner.id}`,
        sourceAssetId: owner.assetId,
        source: { ...reviewWorkspace.source, size: owner.size, mimeType: owner.mimeType },
        history: [],
        cursor: 0,
        advanced: {
          ...reviewWorkspace.advanced,
          webcam: createQuickEditWebcam(
            `project-asset:${supplementary.id}`,
            reviewWorkspace.source,
            reviewWorkspace.source
          ),
        },
      });
      if (!workspace) throw new Error('Expected valid native recursive review fixture.');
      return { workspace, draft: null };
    });
    const encoded = await encodeCapturedProjectRoot(rows);
    const parsed = await parsePortableSyncRoot(encoded.envelope);
    expect(parsed.kind).toBe('video-project');
    const verifiedObjects = new Map(
      encoded.objects.map((object): [string, AssetRef] => [
        object.ref.objectId,
        {
          assetId: `received-${object.ref.objectId}`,
          createdAt: 1,
          location: { kind: 'opfs', objectKey: `objects/received-${object.ref.objectId}` },
          mimeType: object.ref.mimeType,
          size: object.ref.size,
          sha256: null,
        },
      ])
    );
    const payload = await preparePortableReplica({
      envelope: encoded.envelope,
      verifiedObjects,
      senderDependencies: encoded.dependencies,
      admission: {
        operationId: 'recursive-review-operation',
        sourceDigest: 'a'.repeat(64),
        connectionGeneration: 1,
        spaceId: 'space',
        profileCreatedAt: 1,
        expectedLocalGeneration: 1,
        expectedBasis: ['previous-project'],
        expectedWorkspaceRevision: 0,
        dependencies: [],
      },
    });
    if (payload.kind !== 'video-project') throw new Error('Expected project replica.');
    const restored = payload.input.root.assets;
    expect(restored).toHaveLength(3);
    const expectedRefs = rows.assets.map((asset) => {
      const binding = encoded.bindings.find((item) => item.ref.assetId === asset.assetId);
      if (!binding) throw new Error(`Missing encoded original: ${asset.id}.`);
      return verifiedObjects.get(binding.objectId)!.assetId;
    });
    expect(new Set(restored.map((asset) => asset.ref.assetId))).toEqual(new Set(expectedRefs));
    const [restoredSource, restoredCamera, restoredNested] = expectedRefs.map((assetId) =>
      restored.find((asset) => asset.ref.assetId === assetId)!
    );
    expect(restored.filter((asset) => asset.videoReview)).toHaveLength(cycle ? 3 : 2);
    for (const [owner, supplementary] of [
      [restoredSource!, restoredCamera!],
      [restoredCamera!, restoredNested!],
      ...(cycle ? [[restoredNested!, restoredCamera!]] : []),
    ]) {
      expect(owner!.videoReview!.workspace.aggregateId).toBe(`project-asset:${owner!.entry.id}`);
      expect(owner!.videoReview!.workspace.sourceAssetId).toBe(owner!.ref.assetId);
      expect(owner!.videoReview!.workspace.advanced.webcam!.assetId).toBe(
        `project-asset:${supplementary!.entry.id}`
      );
    }
    expect(restored.map((asset) => asset.entry.id)).not.toEqual(
      rows.assets.map((asset) => asset.id)
    );
    expect(payload.input.dependencies).toEqual([]);
  }
);

it('prepares screen, camera, audio and authored anchors without copying recording originals', async () => {
  const recordings = [
    {
      id: 'screen',
      assetId: 'screen-original',
      filename: 'Screen.webm',
      createdAt: 1,
      mimeType: 'video/webm',
      size: 1024,
    },
    {
      id: 'camera',
      assetId: 'camera-original',
      filename: 'Camera.webm',
      createdAt: 1,
      mimeType: 'video/webm',
      size: 128,
    },
  ];
  const screen = recordings[0]!;
  const camera = recordings[1]!;
  const project = createVideoProjectFromRecording({
    recordingId: screen.id,
    filename: screen.filename,
    width: 640,
    height: 360,
    duration: 2,
    mimeType: screen.mimeType,
    size: screen.size,
    hasAudio: true,
    recordingSignals: [],
    sourceNormalizedActionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        time: 1,
        duration: 0.45,
        point: { x: 0.2, y: 0.3 },
        label: 'Click',
        preset: 'CLICK_RIPPLE',
        data: {},
      },
    ],
    sidecarVideos: [
      {
        recordingId: camera.id,
        filename: camera.filename,
        width: 320,
        height: 180,
        duration: 2,
        mimeType: camera.mimeType,
        size: camera.size,
        trackRole: VideoProjectTrackRole.CAMERA,
      },
    ],
  });
  const actionSource = project.actionFeedback?.[0];
  if (!actionSource) throw new Error('Expected authored recording feedback.');
  project.cursorFocusPath = {
    version: 1,
    mode: 'follow',
    smoothing: 0.5,
    sensitivity: 0.5,
    gapPolicy: 'hold',
    segments: [
      {
        id: 'focus',
        binding: {
          kind: 'recording-source',
          recordingId: screen.id,
          sourceInstanceId: actionSource.sourceInstanceId,
        },
        start: 0,
        end: 2,
        keys: [
          { id: 'focus-key', time: 1, x: 0.2, y: 0.3, anchor: 'manual', interpolation: 'smooth' },
        ],
      },
    ],
  };
  const base = projectRows().project;
  const media = recordings.map((recording) => buildRecordingMediaEntry(recording));
  const refs: AssetRef[] = recordings.map((recording) => ({
    assetId: recording.assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${recording.assetId}` },
    mimeType: recording.mimeType,
    size: recording.size,
    sha256: null,
  }));
  const dependencies = media.map((entry, index) => ({
    mediaId: entry.id,
    generation: index + 1,
    basis: [`original-head-${index}`],
  }));
  const rows: CapturedVideoProjectRows = {
    project: { ...base, id: project.id, project },
    recordings,
    telemetry: [],
    assets: [],
    exports: [],
    media,
    refs,
    mediaDependencies: dependencies,
  };
  expect(parseVideoProjectEntry(rows.project)).not.toBeNull();
  const encoded = await encodeCapturedProjectRoot(rows);
  expect(encoded.objects).toEqual([]);
  expect(encoded.bindings).toEqual([]);
  expect(encoded.dependencies).toEqual(dependencies);
  const prepared = await preparePortableReplica({
    envelope: encoded.envelope,
    verifiedObjects: new Map(),
    senderDependencies: dependencies,
    admission: {
      operationId: 'recording-project-operation',
      sourceDigest: 'a'.repeat(64),
      connectionGeneration: 1,
      spaceId: 'space',
      profileCreatedAt: 1,
      expectedLocalGeneration: 0,
      expectedBasis: [],
      expectedWorkspaceRevision: null,
      dependencies: media.map((entry, index) => ({
        entry,
        ref: refs[index]!,
        expectedGeneration: dependencies[index]!.generation,
        expectedBasis: dependencies[index]!.basis,
      })),
    },
  });
  expect(prepared.kind).toBe('video-project');
  if (prepared.kind !== 'video-project') throw new Error('Expected native project preparation.');
  const restored = prepared.input.root.entry.project;
  expect(restored.source).toEqual(project.source);
  expect(restored.baseRecordingId).toBe(screen.id);
  expect(restored.assets.map((asset) => asset.source)).toEqual(
    project.assets.map((asset) => asset.source)
  );
  expect(restored.assets.map((asset) => asset.recordingPart)).toEqual(
    project.assets.map((asset) => asset.recordingPart)
  );
  expect(restored.actionFeedback).toEqual(project.actionFeedback);
  expect(restored.actionEvents).toEqual(project.actionEvents);
  expect(restored.cursorFocusPath).toEqual(project.cursorFocusPath);
  expect(restored.clips.some((clip) => clip.type === 'AUDIO')).toBe(true);
  expect(restored.tracks.some((track) => track.role === VideoProjectTrackRole.CAMERA)).toBe(true);
  const changed = structuredClone(media);
  changed[1]!.size++;
  await expect(
    preparePortableReplica({
      envelope: encoded.envelope,
      verifiedObjects: new Map(),
      senderDependencies: dependencies,
      admission: {
        operationId: 'invalid-recording-project',
        sourceDigest: 'b'.repeat(64),
        connectionGeneration: 1,
        spaceId: 'space',
        profileCreatedAt: 1,
        expectedLocalGeneration: 0,
        expectedBasis: [],
        expectedWorkspaceRevision: null,
        dependencies: changed.map((entry, index) => ({
          entry,
          ref: refs[index]!,
          expectedGeneration: dependencies[index]!.generation,
          expectedBasis: dependencies[index]!.basis,
        })),
      },
    })
  ).rejects.toThrow('dependency');
});

it('encodes a frozen Montage export with matching acquisition metadata and exact original bindings', async () => {
  const rows = projectRows();
  const exported = {
    ...rows.exports[0]!,
    recordingMetadata: {
      captureMode: CaptureMode.TAB,
      displaySurface: VideoDisplaySurface.BROWSER,
      actionCount: 4,
      hasPointer: true,
    },
  };
  rows.exports = [exported];
  rows.media = [buildProjectExportMediaEntry(exported)];
  const frozen = parseCapturedVideoProjectRows(JSON.parse(JSON.stringify(rows)));
  if (!frozen) throw new Error('Expected captured recording-derived export');
  const encoded = await encodeCapturedProjectRoot(frozen);
  const portable = parsePortableVideoProjectMetadata(encoded.envelope.metadata);
  expect(portable.projectExports[0]?.entry.recordingMetadata).toEqual(exported.recordingMetadata);
  expect(encoded.bindings).toEqual([
    { objectId: portable.projectAssets[0]!.objectId, ref: rows.refs[0] },
    { objectId: portable.projectExports[0]!.objectId, ref: rows.refs[1] },
  ]);
  expect(encoded.objects).toHaveLength(2);
  expect(io.files.get(exported.assetId)?.size).toBe(exported.size);
  expect(encoded.dependencies).toEqual([]);
  const changed = structuredClone(frozen);
  changed.media[0]!.recordingMetadata = { ...exported.recordingMetadata, actionCount: 5 };
  await expect(encodeCapturedProjectRoot(changed)).rejects.toThrow('Invalid frozen project');
});
