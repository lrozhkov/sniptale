import type { ReviewOriginalSpeech } from '../../../features/video/review/original-speech';
import { reviewSpeechTextSignature } from '../../../features/video/review/speech-transcript';
import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../../features/video/project/scene/focus-appearance';
import { bindMotionRegionToClip } from '../../../features/video/project/motion/source-binding';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import { createVideoProjectRestoreTransaction } from './index.test-support';
import { expect, it, vi } from 'vitest';
import {
  putVideoProjectBackupRestore,
  type VideoProjectBackupRestoreStores,
} from './backup-restore';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import type { MediaThumbnailEntry } from '../media-library/contracts';
import type { StoredProjectExportEntry } from './contracts';
import {
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from './index.test-support';

function store(get: (key: IDBValidKey) => unknown = () => undefined) {
  return {
    delete: vi.fn(),
    get: vi.fn(async (key) => get(key)),
    getAll: vi.fn(async () => []),
    put: vi.fn(),
  };
}

function stores(): VideoProjectBackupRestoreStores {
  const exports = { ...store(), index: vi.fn(() => ({ getAll: vi.fn(async () => []) })) };
  const owners = { ...store(), index: vi.fn(() => ({ count: vi.fn(async () => 0) })) };
  return {
    assets: store(),
    exports,
    media: store(),
    videoWorkspaces: store(),
    videoDrafts: store(),
    operations: store(),
    owners,
    presentations: store(),
    projects: store(),
    refs: store(),
    thumbnails: store(),
    scenarioAssets: store(),
  } satisfies VideoProjectBackupRestoreStores;
}

const operation = () => ({
  assetIds: [],
  createdAt: 1,
  kind: 'physical-delete' as const,
  operationId: 'delete',
  status: 'pending' as const,
  updatedAt: 1,
});
const ref = {
  assetId: 'local',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/local' },
  mimeType: 'image/png',
  sha256: null,
  size: 1,
};

it('restores an archived temporary project as permanent without changing its graph', async () => {
  const target = stores();
  const entry = createVideoProjectEntry({ id: 'legacy-import' }, { id: 'legacy-import' });
  entry.lifecycle = { savedAt: null, storageClass: 'temporary', updatedAt: 10 };
  await putVideoProjectBackupRestore({
    operation: operation(),
    root: { assets: [], entry, exports: [] },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  expect(target.projects.put).toHaveBeenCalledWith({
    ...entry,
    workspaceRevision: 1,
    usageReferenceKeys: ['indexed:v2'],
    lifecycle: expect.objectContaining({ savedAt: 10, storageClass: 'library' }),
  });
});

it('publishes a prepared project graph through caller-owned stores', async () => {
  const target = stores();
  await expect(
    putVideoProjectBackupRestore({
      operation: operation(),
      root: {
        assets: [
          {
            entry: {
              assetId: 'local',
              createdAt: 1,
              id: 'project-asset',
              mimeType: 'image/png',
              size: 1,
            },
            filename: 'image.png',
            ref,
          },
        ],
        entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
        exports: [],
      },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'replace',
    })
  ).resolves.toEqual({ conflicted: false, imported: true });
  expect(target.projects.put).toHaveBeenCalled();
  expect(target.refs.put).toHaveBeenCalledWith(ref);
  expect(target.media.put).toHaveBeenCalled();
});

it('skips the complete root when a child identity already exists', async () => {
  const target = stores();
  target.assets.get = vi.fn(async () => ({
    assetId: 'other-local',
    createdAt: 1,
    id: 'project-asset',
    mimeType: 'image/png',
    size: 1,
  }));
  await expect(
    putVideoProjectBackupRestore({
      operation: operation(),
      root: {
        assets: [
          {
            entry: {
              assetId: 'local',
              createdAt: 1,
              id: 'project-asset',
              mimeType: 'image/png',
              size: 1,
            },
            filename: 'image.png',
            ref,
          },
        ],
        entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
        exports: [],
      },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'skip',
    })
  ).resolves.toEqual({ conflicted: true, imported: false });
  expect(target.projects.put).not.toHaveBeenCalled();
});

it('rejects replace when an asset identity belongs to another root', async () => {
  const target = stores();
  target.assets.get = vi.fn(async () => ({
    assetId: 'other-local',
    createdAt: 1,
    id: 'project-asset',
    mimeType: 'image/png',
    size: 1,
  }));
  target.projects.getAll = vi.fn(async () => [
    createVideoProjectEntryWithMediaClip({ id: 'other-project' }),
  ]);

  await expect(
    putVideoProjectBackupRestore({
      operation: operation(),
      root: {
        assets: [
          {
            entry: {
              assetId: 'local',
              createdAt: 1,
              id: 'project-asset',
              mimeType: 'image/png',
              size: 1,
            },
            filename: 'image.png',
            ref,
          },
        ],
        entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
        exports: [],
      },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'replace',
    })
  ).rejects.toThrow('Video project asset belongs to another root');
});

it('rejects a duplicate conflict that changed after preflight', async () => {
  const target = stores();
  target.projects.get = vi.fn(async () =>
    createVideoProjectEntry({ id: 'project' }, { id: 'project' })
  );
  await expect(
    putVideoProjectBackupRestore({
      operation: operation(),
      root: {
        assets: [],
        entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
        exports: [],
      },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'duplicate',
    })
  ).rejects.toThrow('conflict changed after preflight');
});

it('replaces the complete existing graph and records unowned bytes for deletion', async () => {
  const target = stores();
  const existing = createVideoProjectEntryWithMediaClip({ id: 'project' });
  const existingExport = {
    assetId: 'export-object',
    createdAt: 1,
    duration: 1,
    filename: 'old.webm',
    fps: 30,
    height: 100,
    id: 'old-export',
    mimeType: 'video/webm',
    projectId: 'project',
    size: 4,
    width: 100,
  } satisfies StoredProjectExportEntry;
  target.projects.get = vi.fn(async () => existing);
  target.projects.getAll = vi.fn(async () => [existing]);
  target.assets.get = vi.fn(async () => ({
    assetId: 'asset-object',
    createdAt: 1,
    id: 'project-asset-1',
    mimeType: 'video/webm',
    size: 4,
  }));
  target.exports.index = vi.fn(() => ({ getAll: vi.fn(async () => [existingExport]) }));
  target.exports.get = vi.fn(async (key) =>
    key === existingExport.id ? existingExport : undefined
  );
  target.projects.put = vi.fn(async (value) => {
    vi.mocked(target.projects.getAll).mockResolvedValue([value]);
  });
  const pendingDelete = operation();

  await expect(
    putVideoProjectBackupRestore({
      operation: pendingDelete,
      root: {
        assets: [],
        entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
        exports: [],
      },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'replace',
    })
  ).resolves.toEqual({ conflicted: true, imported: true });

  expect(target.assets.delete).toHaveBeenCalledWith('project-asset-1');
  expect(target.exports.delete).toHaveBeenCalledWith('old-export');
  for (const id of ['project-asset:project-asset-1', 'export:old-export']) {
    expect(target.videoWorkspaces.delete).toHaveBeenCalledWith(id);
    expect(target.videoDrafts.delete).toHaveBeenCalledWith(id);
  }
  expect(target.projects.delete).toHaveBeenCalledWith('project');
  expect(pendingDelete.assetIds).toHaveLength(2);
  expect(pendingDelete.assetIds).toEqual(expect.arrayContaining(['asset-object', 'export-object']));
});

it('publishes export and project presentation sidecars', async () => {
  const target = stores();
  const thumbnail = {
    assetId: 'export:export',
    blob: new Blob(['thumb']),
    createdAt: 1,
    height: 1,
    updatedAt: 1,
    width: 1,
  } satisfies MediaThumbnailEntry;
  const presentation = {
    aggregateId: 'project',
    aggregateKind: 'video-project' as const,
    presentationRevision: 1,
    thumbnailBlob: new Blob(['presentation']),
    updatedAt: 1,
  } satisfies AggregatePresentationEntry;
  const exportEntry = {
    assetId: 'local',
    createdAt: 1,
    duration: 1,
    filename: 'export.webm',
    fps: 30,
    height: 100,
    id: 'export',
    mimeType: 'video/webm',
    projectId: 'project',
    size: 1,
    width: 100,
  } satisfies StoredProjectExportEntry;

  await putVideoProjectBackupRestore({
    operation: operation(),
    root: {
      assets: [],
      entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
      exports: [{ entry: exportEntry, ref, thumbnail }],
      presentation,
      thumbnail,
    },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });

  expect(target.exports.put).toHaveBeenCalledWith(exportEntry);
  expect(target.thumbnails.put).toHaveBeenCalledWith(thumbnail);
  expect(target.presentations.put).toHaveBeenCalledWith(presentation);
});
it('restores a private project representation without publishing a Library card', async () => {
  const target = stores();
  await putVideoProjectBackupRestore({
    operation: operation(),
    strategy: 'replace',
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    root: {
      entry: createVideoProjectEntry(),
      exports: [],
      assets: [
        {
          entry: { id: 'private', assetId: 'local', createdAt: 1, mimeType: 'image/png', size: 1 },
          filename: 'image.png',
          ref,
          publishToLibrary: false,
        },
      ],
    },
  });
  expect(target.assets.put).toHaveBeenCalled();
  expect(target.owners.put).toHaveBeenCalled();
  expect(target.media.put).not.toHaveBeenCalled();
});

it.each(['same', 'changed', 'missing'] as const)(
  'revalidates explicitly reused export bytes before any replacement: %s',
  async (state) => {
    const { createProjectExportEntry, createMediaLibraryEntry } =
      await import('./index.test-support');
    const target = stores();
    const previous = createProjectExportEntry({
      id: 'shared-export',
      assetId: 'original',
      projectId: 'old-parent',
      size: 1,
      mimeType: 'video/webm',
    });
    const exported = {
      entry: { ...previous, projectId: 'new-parent' },
      ref: { ...ref, assetId: previous.assetId, mimeType: 'video/webm' },
      reusePublished: true,
    };
    const media = createMediaLibraryEntry({
      id: `export:${previous.id}`,
      source: { kind: 'project-export', exportId: previous.id, projectId: previous.projectId },
    });
    target.exports.get = vi.fn(async () =>
      state === 'missing'
        ? undefined
        : state === 'changed'
          ? { ...previous, assetId: 'replaced' }
          : previous
    );
    target.media.get = vi.fn(async () => media);
    const restore = () =>
      putVideoProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [],
          entry: createVideoProjectEntry({ id: 'new-parent' }, { id: 'new-parent' }),
          exports: [exported],
        },
        stores: target,
        tx: createVideoProjectRestoreTransaction(target),
        strategy: 'replace',
      });
    if (state === 'same') {
      await expect(restore()).resolves.toEqual({ imported: true, conflicted: false });
      expect(target.exports.put).toHaveBeenCalledWith(exported.entry);
      expect(target.media.put).toHaveBeenCalledWith(
        expect.objectContaining({
          ...media,
          source: { ...media.source, projectId: 'new-parent' },
        })
      );
      expect(target.refs.put).not.toHaveBeenCalled();
      expect(target.owners.put).not.toHaveBeenCalled();
    } else {
      await expect(restore()).rejects.toThrow('changed after preparation');
      expect(target.projects.put).not.toHaveBeenCalled();
      expect(target.exports.put).not.toHaveBeenCalled();
    }
  }
);

it('preserves independently published exports when replacing their parent project', async () => {
  const { createProjectExportEntry, createMediaLibraryEntry } =
    await import('./index.test-support');
  const target = stores();
  const parent = createVideoProjectEntry();
  const exported = createProjectExportEntry({ projectId: parent.id });
  target.projects.get = vi.fn(async () => parent);
  target.exports.index = vi.fn(() => ({ getAll: vi.fn(async () => [exported]) }));
  target.media.get = vi.fn(async () =>
    createMediaLibraryEntry({
      id: `export:${exported.id}`,
      source: { kind: 'project-export', exportId: exported.id, projectId: parent.id },
    })
  );
  await putVideoProjectBackupRestore({
    operation: operation(),
    root: { assets: [], entry: parent, exports: [] },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  expect(target.exports.delete).not.toHaveBeenCalled();
  expect(target.media.delete).not.toHaveBeenCalledWith(`export:${exported.id}`);
  expect(target.owners.delete).not.toHaveBeenCalled();
});

it.each(['missing', 'wrong-id', 'wrong-kind', 'wrong-export', 'wrong-parent'] as const)(
  'refuses a changed published export identity before project writes: %s',
  async (failure) => {
    const { createProjectExportEntry, createMediaLibraryEntry } =
      await import('./index.test-support');
    const target = stores();
    const entry = createProjectExportEntry({
      id: 'shared',
      assetId: 'body',
      projectId: 'old',
      mimeType: 'video/webm',
    });
    const media = createMediaLibraryEntry({
      id: failure === 'wrong-id' ? 'different' : 'export:shared',
      source:
        failure === 'wrong-kind'
          ? { kind: 'screenshot' }
          : {
              kind: 'project-export',
              exportId: failure === 'wrong-export' ? 'different' : entry.id,
              projectId: failure === 'wrong-parent' ? 'different' : entry.projectId,
            },
    });
    target.exports.get = vi.fn(async () => entry);
    target.media.get = vi.fn(async () => (failure === 'missing' ? undefined : media));
    await expect(
      putVideoProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [],
          entry: createVideoProjectEntry(),
          exports: [
            {
              entry: { ...entry, projectId: 'new' },
              ref: { ...ref, assetId: entry.assetId, mimeType: 'video/webm' },
              reusePublished: true,
            },
          ],
        },
        stores: target,
        tx: createVideoProjectRestoreTransaction(target),
        strategy: 'replace',
      })
    ).rejects.toThrow('identity changed after preparation');
    expect(target.projects.put).not.toHaveBeenCalled();
    expect(target.media.put).not.toHaveBeenCalled();
  }
);

it('refuses a prepared shared project asset removed before consumer publication', async () => {
  const target = stores();
  const asset = {
    entry: { id: 'shared', assetId: 'body', mimeType: ref.mimeType, size: ref.size, createdAt: 1 },
    filename: 'shared.png',
    ref: { ...ref, assetId: 'body' },
    reusePublished: true,
  };
  await expect(
    putVideoProjectBackupRestore({
      operation: operation(),
      root: { assets: [asset], entry: createVideoProjectEntry(), exports: [] },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'replace',
    })
  ).rejects.toThrow();
  expect(target.projects.put).not.toHaveBeenCalled();
  expect(target.assets.put).not.toHaveBeenCalled();
});

it('pins a direct Library source only when the archive parent is accepted', async () => {
  const { createMediaLibraryEntry } = await import('./index.test-support');
  const entry = createVideoProjectEntryWithMediaClip();
  entry.project.assets[0]!.source = { kind: 'library-asset', mediaId: 'original' };
  const source = createMediaLibraryEntry({
    id: 'original',
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
  });
  for (const strategy of ['skip', 'replace'] as const) {
    const target = stores();
    target.projects.get = vi.fn(async () => entry);
    target.media.get = vi.fn(async (key) => (key === source.id ? source : undefined));
    await putVideoProjectBackupRestore({
      operation: operation(),
      root: { assets: [], entry, exports: [] },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy,
    });
    if (strategy === 'skip') expect(target.media.put).not.toHaveBeenCalled();
    else
      expect(target.media.put).toHaveBeenCalledWith(
        expect.objectContaining({
          id: source.id,
          lifecycle: expect.objectContaining({ storageClass: 'library' }),
        })
      );
  }
});

it('publishes an accepted canonical project asset as permanent', async () => {
  const target = stores();
  const entry = createVideoProjectEntryWithMediaClip();
  const assets = new Map<IDBValidKey, unknown>();
  const media = new Map<IDBValidKey, unknown>();
  target.assets.get = vi.fn(async (key) => assets.get(key));
  target.assets.put = vi.fn(async (value) => {
    assets.set(value.id, value);
  });
  target.media.get = vi.fn(async (key) => media.get(key));
  target.media.put = vi.fn(async (value) => {
    media.set(value.id, value);
  });
  await putVideoProjectBackupRestore({
    operation: operation(),
    strategy: 'replace',
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    root: {
      entry,
      exports: [],
      assets: [
        {
          entry: {
            id: 'project-asset-1',
            assetId: 'local',
            createdAt: 1,
            mimeType: ref.mimeType,
            size: ref.size,
          },
          filename: 'image.png',
          ref,
        },
      ],
    },
  });
  expect(media.get('project-asset:project-asset-1')).toMatchObject({
    lifecycle: { storageClass: 'library' },
  });
});

it('restores schema17 camera phases and disabled strengths through the existing project writer', async () => {
  const target = stores();
  const entry = createVideoProjectEntry({ id: 'phase-restore' }, { id: 'phase-restore' });
  entry.project.duration = 4;
  const region = {
    ...createVideoProjectMotionRegion(entry.project, 1),
    duration: 2,
    motionBlur: {
      enter: { enabled: false, strength: 0.731 },
      exit: { enabled: true, strength: 0.8 },
      link: { enabled: true, strength: 0.4 },
    },
  };
  entry.project = applyVideoProjectMutationPatch(entry.project, { motionRegions: [region] });
  await putVideoProjectBackupRestore({
    operation: operation(),
    root: { assets: [], entry, exports: [] },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  expect(target.projects.put).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({ version: 17, motionRegions: [region] }),
    })
  );
});

it('restores schema18 independent entrance and exit modes through the existing project writer', async () => {
  const target = stores();
  const entry = createVideoProjectEntry({ id: 'phase-restore' }, { id: 'phase-restore' });
  entry.project.duration = 4;
  const region = {
    ...createVideoProjectMotionRegion(entry.project, 1, { enter: 'none', exit: 'ease-in-out' }),
    duration: 2,
    motionBlur: {
      enter: { enabled: false, strength: 0.731 },
      exit: { enabled: true, strength: 0.8 },
      link: { enabled: true, strength: 0.4 },
    },
  };
  entry.project = applyVideoProjectMutationPatch(entry.project, { motionRegions: [region] });
  await putVideoProjectBackupRestore({
    operation: operation(),
    root: { assets: [], entry, exports: [] },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  expect(target.projects.put).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({ version: 18, motionRegions: [region] }),
    })
  );
});

it('restores schema19 spatial settings and independent reference through the existing project writer', async () => {
  const target = stores();
  const entry = createVideoProjectEntry({ id: 'spatial-restore' }, { id: 'spatial-restore' });
  entry.project.duration = 4;
  const region = {
    ...createVideoProjectMotionRegion(entry.project, 1),
    duration: 2,
    perspective: { enabled: false, rotateX: 20, rotateY: -30, rotateZ: 40, strength: 0.7 },
    depthOfField: {
      enabled: true,
      mode: 'depth' as const,
      x: 0.4,
      y: 0.6,
      width: 0.2,
      softness: 0.3,
      strength: 0.8,
    },
    spatialReference: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
  };
  entry.project = applyVideoProjectMutationPatch(entry.project, { motionRegions: [region] });
  await putVideoProjectBackupRestore({
    operation: operation(),
    root: { assets: [], entry, exports: [] },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  expect(target.projects.put).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({ version: 19, motionRegions: [region] }),
    })
  );
});

it('restores schema21 border targets, appearance and retained clocks through the existing writer', async () => {
  const target = stores();
  const entry = createVideoProjectEntryWithMediaClip({ id: 'border-restore' });
  const clip = entry.project.clips.find((item) => item.type === 'VIDEO')!;
  const bound = bindMotionRegionToClip(
    {
      ...createVideoProjectMotionRegion(entry.project, 1),
      id: 'bound-border',
      duration: 2,
      border: {
        ...createQuickEditBorder(),
        style: 'dotted',
        reveal: 'draw-ccw',
        exitReveal: 'erase-ccw',
        loop: true,
        motion: 'ripple',
        period: 0.5,
        segmentPercent: 23,
      },
      borderTarget: 'window',
    },
    clip
  );
  const viewport = { ...bound, id: 'viewport-border', borderTarget: 'viewport' as const };
  entry.project = applyVideoProjectMutationPatch(entry.project, {
    motionRegions: [bound, viewport],
  });
  await putVideoProjectBackupRestore({
    operation: operation(),
    root: { assets: [], entry, exports: [] },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  expect(target.projects.put).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({ version: 21, motionRegions: [bound, viewport] }),
    })
  );
});

it('restores schema22 spotlight coverage, appearance and retained clocks through the existing writer', async () => {
  const target = stores();
  const entry = createVideoProjectEntryWithMediaClip({ id: 'spotlight-restore' });
  const clip = entry.project.clips.find((item) => item.type === 'VIDEO')!;
  const bound = bindMotionRegionToClip(
    {
      ...createVideoProjectMotionRegion(entry.project, 1),
      id: 'window-spotlight',
      duration: 2,
      spotlight: {
        ...createQuickEditSpotlight(),
        effect: 'blur',
        reveal: 'contract',
        exitReveal: 'fade',
      },
      spotlightTarget: 'window',
    },
    clip
  );
  const scene = { ...bound, id: 'scene-spotlight', spotlightTarget: 'scene' as const };
  const viewport = { ...bound, id: 'viewport-spotlight', spotlightTarget: 'viewport' as const };
  entry.project = applyVideoProjectMutationPatch(entry.project, {
    motionRegions: [bound, scene, viewport],
  });
  await putVideoProjectBackupRestore({
    operation: operation(),
    root: { assets: [], entry, exports: [] },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  expect(target.projects.put).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({ version: 22, motionRegions: [bound, scene, viewport] }),
    })
  );
});

it.each([23, 24])(
  'restores schema%i notes and optional scene edges without changing the project graph',
  async (version) => {
    const { createCanvasComment } = await import('../../../features/video/review/comments');
    const target = stores();
    const entry = createVideoProjectEntryWithMediaClip({ id: 'comments-restore' });
    const clip = entry.project.clips.find((item) => item.type === 'VIDEO')!;
    if (clip.type !== 'VIDEO') throw new Error('Missing video');
    const comments = [
      {
        id: 'source-comments',
        binding: {
          kind: 'source' as const,
          assetId: clip.assetId,
          sourceInstanceId: clip.sourceInstanceId ?? clip.id,
        },
        annotations: [
          { id: 'note', text: 'Retained linked text', anchor: { kind: 'point' as const, time: 0 } },
        ],
        canvasComments: [
          {
            ...createCanvasComment({ id: 'bubble', annotationId: 'note' }),
            visible: false,
            renderToVideo: false,
          },
        ],
      },
    ];
    const sceneEdges =
      version === 24
        ? {
            intro: { enabled: true, duration: 0.123456, color: '#ff0000ff', audioFade: true },
            outro: { enabled: false, duration: 3, color: '#0000ffff', audioFade: false },
          }
        : undefined;
    entry.project = applyVideoProjectMutationPatch(entry.project, {
      commentDocuments: comments,
      ...(sceneEdges ? { sceneEdges } : {}),
    });
    const original = structuredClone(entry.project);
    await putVideoProjectBackupRestore({
      operation: operation(),
      root: { assets: [], entry, exports: [] },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'replace',
    });
    expect(target.projects.put).toHaveBeenCalledWith(
      expect.objectContaining({
        project: original,
      })
    );
    expect(original.version).toBe(version);
    expect(entry.project).toEqual(original);
  }
);

it.each([false, true])(
  'restores remembered bookend settings and optional joins (%s) through the existing root writer',
  async (joins) => {
    const { createBookendVideoPresentation } =
      await import('../../../features/video/project/scene/bookend-media');
    const target = stores();
    const entry = createVideoProjectEntryWithMediaClip({ id: 'bookend-restore' });
    const asset = entry.project.assets[0]!;
    const slot = {
      mode: 'none' as const,
      video: {
        ...createBookendVideoPresentation(asset.metadata.duration!),
        assetId: asset.id,
        trim: { start: 0.123456, end: asset.metadata.duration! },
        audio: { muted: true, gain: 0.37 },
      },
    };
    entry.project = applyVideoProjectMutationPatch(entry.project, {
      bookendPresets: {
        intro: slot,
        outro: structuredClone(slot),
        ...(joins ? { introTransition: { type: 'dissolve', before: 0.2, after: 0.3 } } : {}),
      },
      ...(joins
        ? {
            compositionJoins: [
              {
                id: 'saved-join',
                clipId: entry.project.clips[0]!.id,
                edge: 'end',
                transition: { type: 'fade-black', before: 0.1, after: 0.3, color: '#123456' },
              },
            ],
          }
        : {}),
    });
    const original = structuredClone(entry);
    await putVideoProjectBackupRestore({
      operation: operation(),
      root: { assets: [], entry, exports: [] },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'replace',
    });
    expect(target.projects.put).toHaveBeenCalledWith(
      expect.objectContaining({ project: original.project })
    );
    expect(original.project.version).toBe(joins ? 26 : 25);
    expect(entry).toEqual(original);
  }
);

it('restores dormant source audio documents with exact source intent through the existing root writer', async () => {
  const target = stores();
  const entry = createVideoProjectEntryWithMediaClip({ id: 'source-audio-restore' });
  const asset = entry.project.assets[0]!;
  entry.project = applyVideoProjectMutationPatch(entry.project, {
    clips: [],
    sourceAudioDocuments: [
      {
        id: 'envelope',
        binding: { kind: 'source', assetId: asset.id, sourceInstanceId: 'dormant' },
        ranges: [{ id: 'gain', start: 0, end: 1, volume: 2 }],
        mutes: [],
      },
    ],
  });
  const before = structuredClone(entry.project);
  await putVideoProjectBackupRestore({
    operation: operation(),
    root: { assets: [], entry, exports: [] },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  expect(target.projects.put).toHaveBeenCalledWith(expect.objectContaining({ project: before }));
  expect(entry.project).toEqual(before);
  expect(before.version).toBe(28);
});

it('restores whole source voice takes and accepted replacement references without rewriting their clocks', async () => {
  const { createVideoProjectTrack } =
    await import('../../../features/video/project/factories/creation');
  const { isExportReadyVideoProject } =
    await import('../../../features/video/project/validation/root');
  const { reviewSpeechTextSignature } =
    await import('../../../features/video/review/speech-transcript');
  const target = stores();
  const entry = createVideoProjectEntryWithMediaClip({ id: 'source-voice-restore' });
  const source = entry.project.assets[0]!;
  const audio = {
    ...source,
    id: 'native-take',
    type: 'AUDIO' as const,
    source: { kind: 'project-asset' as const, projectAssetId: 'voice-private' },
  };
  const replacement = {
    ...audio,
    id: 'project-asset:replacement',
    source: { kind: 'project-asset' as const, projectAssetId: 'replacement-private' },
  };
  const track = createVideoProjectTrack('Voice', 1, 'AUDIO');
  const profile = { modelId: 'speech', voiceId: 'voice', responseFormat: 'wav' as const };
  entry.project = applyVideoProjectMutationPatch(entry.project, {
    assets: [source, audio, replacement],
    tracks: [...entry.project.tracks, track],
    clips: [],
    sourceVoiceoverDocuments: [
      {
        id: 'voice',
        trackId: track.id,
        enabled: false,
        binding: { kind: 'source', assetId: source.id, sourceInstanceId: 'dormant-source' },
        originalAudioSourceInstanceId: 'dormant-original-audio',
        reference: [
          { kind: 'speed', rate: 2, sourceStart: 0, sourceEnd: 4, resultStart: 0, resultEnd: 2 },
          { kind: 'cut', rate: 1, sourceStart: 4, sourceEnd: 6, resultStart: 2, resultEnd: 2 },
          { kind: 'keep', rate: 1, sourceStart: 6, sourceEnd: 10, resultStart: 2, resultEnd: 6 },
        ],
        take: {
          id: 'take',
          assetId: audio.id,
          timelineStart: 0,
          sourceOffset: 0.5,
          duration: 4,
          volume: 1,
          muted: true,
          dormant: true,
          fadeIn: 0.25,
          fadeOut: 0.5,
          tempo: 0.5,
          sourceAnchor: [{ start: 0, end: 8, offset: 0, duration: 4 }],
          transcript: {
            version: 1,
            phrases: [],
            replacements: [
              {
                id: 'replacement',
                assetId: replacement.id,
                start: 0,
                end: 1,
                duration: 1,
                phraseId: 'phrase',
                revision: 1,
                text: 'Accepted',
                textSignature: reviewSpeechTextSignature('Accepted', profile),
                profile,
              },
            ],
          },
        },
      },
    ],
  });
  expect(isExportReadyVideoProject(entry.project)).toBe(true);
  const before = structuredClone(entry.project);
  await putVideoProjectBackupRestore({
    operation: operation(),
    root: { assets: [], entry, exports: [] },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  expect(target.projects.put).toHaveBeenCalledWith(expect.objectContaining({ project: before }));
  expect(entry.project).toEqual(before);
  expect(before.version).toBe(31);
});

function passiveSourceSpeech(assetId: string): ReviewOriginalSpeech {
  const profile = { modelId: 'tts', voiceId: 'voice', responseFormat: 'wav' as const };
  return {
    enabled: false,
    transcript: {
      version: 1,
      profile,
      transcriptionModelId: 'recognition-model',
      phrases: [
        {
          id: 'phrase',
          start: 1,
          end: 3,
          originalText: 'Original',
          text: 'Draft',
          revision: 2,
          alignment: 'word',
          words: [{ text: 'Original', start: 1, end: 3 }],
        },
      ],
      replacements: [
        {
          id: 'historical',
          phraseId: 'removed-phrase',
          start: 1,
          end: 3,
          duration: 1,
          assetId,
          revision: 1,
          text: 'Accepted',
          profile,
          textSignature: reviewSpeechTextSignature('Accepted', profile),
          enabled: true,
          originalVolume: 0.25,
        },
      ],
    },
  };
}

it('restores passive source speech without scheduling replacement audio', async () => {
  const { isExportReadyVideoProject, parseHydratableVideoProject } =
    await import('../../../features/video/project/validation/root');
  const { getProjectAssetUses } = await import('../../../features/video/project/media-usage');
  const target = stores();
  const entry = createVideoProjectEntryWithMediaClip({ id: 'passive-speech-restore' });
  const source = entry.project.assets[0]!;
  const replacement = {
    ...structuredClone(source),
    id: 'project-asset:passive-history',
    type: 'AUDIO' as const,
    source: { kind: 'project-asset' as const, projectAssetId: 'passive-history-private' },
    metadata: { ...source.metadata, width: 0, height: 0, mimeType: 'audio/wav', hasAudio: true },
  };
  entry.project = applyVideoProjectMutationPatch(entry.project, {
    assets: [source, replacement],
    clips: [],
    sourceAudioDocuments: [
      {
        id: 'source-speech',
        binding: { kind: 'source', assetId: source.id, sourceInstanceId: 'missing-original' },
        ranges: [],
        mutes: [],
        speech: passiveSourceSpeech(replacement.id),
      },
    ],
  });
  expect(isExportReadyVideoProject(entry.project)).toBe(true);
  expect(entry.project.version).toBe(31);
  expect(getProjectAssetUses(entry.project)).toEqual([
    { kind: 'source-audio', documentId: 'source-speech', assetId: source.id },
    { kind: 'source-audio', documentId: 'source-speech', assetId: replacement.id },
  ]);
  const before = structuredClone(entry.project);
  const assets = entry.project.assets.map((asset) => {
    if (asset.source.kind !== 'project-asset') throw new Error('Expected private asset');
    return {
      entry: {
        id: asset.source.projectAssetId,
        assetId: `${asset.id}-body`,
        mimeType: asset.metadata.mimeType,
        size: asset.metadata.size,
        createdAt: 1,
      },
      filename: asset.name,
      ref: {
        ...ref,
        location: { kind: 'opfs' as const, objectKey: `objects/${asset.id}` },
        assetId: `${asset.id}-body`,
        mimeType: asset.metadata.mimeType,
        size: asset.metadata.size,
      },
      publishToLibrary: false,
    };
  });
  await putVideoProjectBackupRestore({
    operation: operation(),
    root: { assets, entry, exports: [] },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  expect(target.projects.put).toHaveBeenCalledWith(expect.objectContaining({ project: before }));
  for (const asset of assets) {
    expect(target.refs.put).toHaveBeenCalledWith(asset.ref);
    expect(target.assets.put).toHaveBeenCalledWith(asset.entry);
    expect(target.owners.put).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: asset.ref.assetId, ownerId: asset.entry.id })
    );
  }
  expect(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(entry.project)))?.sourceAudioDocuments
  ).toEqual(before.sourceAudioDocuments);
  expect(entry.project).toEqual(before);
});

it('allocates local admission independently of the archived revision and rebinds presentation', async () => {
  const target = stores();
  const current = createVideoProjectEntry({ id: 'project' }, { workspaceRevision: 7 });
  vi.spyOn(target.projects, 'get').mockResolvedValue(current);
  const archived = createVideoProjectEntry(
    { id: 'project', name: 'Archived authored content' },
    { workspaceRevision: 400 }
  );
  const presentation: AggregatePresentationEntry = {
    aggregateId: 'project',
    aggregateKind: 'video-project',
    presentationRevision: 400,
    thumbnailBlob: new Blob(['preview']),
    updatedAt: 10,
  };
  await putVideoProjectBackupRestore({
    tx: createVideoProjectRestoreTransaction(target),
    operation: operation(),
    root: { entry: archived, assets: [], exports: [], presentation },
    stores: target,
    strategy: 'replace',
  });
  expect(target.projects.put).toHaveBeenCalledWith(
    expect.objectContaining({
      project: archived.project,
      createdAt: archived.createdAt,
      updatedAt: archived.updatedAt,
      workspaceRevision: 8,
    })
  );
  expect(target.presentations.put).toHaveBeenCalledWith({
    ...presentation,
    presentationRevision: 8,
  });
});
