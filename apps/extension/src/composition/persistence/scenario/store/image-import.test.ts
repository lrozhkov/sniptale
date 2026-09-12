import { beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
} from '../../../../features/scenario/project/public';
import { createScenarioCaptureEditorDocument } from '../../../../features/scenario/capture-step/editor-document';
const io = vi.hoisted(() => ({
  entry: vi.fn<typeof import('../../media-library').getMediaLibraryEntry>(),
  presentation: vi.fn<typeof import('../../aggregate-presentations').getAggregatePresentation>(),
  workspace: vi.fn<typeof import('../../image-workspaces').recoverAndGetImageWorkspace>(),
  commit: vi.fn<typeof import('../aggregate-mutations').commitScenarioAggregateMutation>(),
  write: vi.fn(),
  discard: vi.fn(),
  decode: vi.fn(),
  event: vi.fn(),
  release: vi.fn(),
}));
vi.mock('../../media-library', () => ({ getMediaLibraryEntry: io.entry }));
vi.mock('../../aggregate-presentations', () => ({ getAggregatePresentation: io.presentation }));
vi.mock('../../image-workspaces', () => ({ recoverAndGetImageWorkspace: io.workspace }));
vi.mock('../aggregate-mutations', () => ({ commitScenarioAggregateMutation: io.commit }));
vi.mock('../../assets', async (original) => ({
  ...(await original<typeof import('../../assets')>()),
  assertAssetWriteAdmission: vi.fn(async () => undefined),
  writeBlobToAsset: io.write,
  discardPreparedAsset: io.discard,
}));
vi.mock('@sniptale/platform/browser/media/image-dimensions', () => ({
  measureImageBlob: io.decode,
}));
vi.mock('../../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: io.event,
}));
import { importScenarioImages } from './image-import';
function png(name = 'image.png') {
  return new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], name, {
    type: 'image/png',
  });
}
function input() {
  return {
    project: createGuideProject('Guide', 'guide', 100),
    baseUpdatedAt: 100,
    sources: [{ kind: 'file' as const, file: png() }],
    placement: { kind: 'steps' as const },
    signal: new AbortController().signal,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  io.commit.mockImplementation(async (project) => ({ project, workspaceRevision: 2 }));
  io.decode.mockResolvedValue({ width: 120, height: 80 });
  io.write.mockImplementation(async (blob: Blob) => ({
    ref: {
      assetId: crypto.randomUUID(),
      createdAt: 200,
      location: { kind: 'opfs', objectKey: 'objects/imported' },
      mimeType: blob.type,
      sha256: null,
      size: blob.size,
    },
  }));
});
it('publishes ordered independent images as one aggregate and preserves the source buffer', async () => {
  const args = input();
  args.sources.push({ kind: 'file', file: png('second.png') });
  const progress = vi.fn();
  const result = await importScenarioImages({ ...args, onProgress: progress });
  expect(result.items.map((item) => item.title)).toEqual(['image.png', 'second.png']);
  expect(args.project.items).toEqual([]);
  expect(io.commit).toHaveBeenCalledTimes(1);
  const options = io.commit.mock.calls[0]?.[1];
  expect(options?.expectedUpdatedAt).toBe(100);
  expect(options?.children?.assetPuts).toHaveLength(2);
  expect(new Set(options?.children?.assetPuts?.map((asset) => asset.assetId)).size).toBe(2);
  expect(progress).toHaveBeenLastCalledWith(2, 2);
  expect(io.discard).not.toHaveBeenCalled();
});
it('appends blocks only to the selected step and rejects missing targets before staging', async () => {
  const args = input();
  args.project.items.push(createGuideStep('Selected', 'step'));
  const result = await importScenarioImages({
    ...args,
    placement: { kind: 'blocks', stepId: 'step' },
  });
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({ blocks: [{ kind: 'image' }] });
  await expect(
    importScenarioImages({ ...args, placement: { kind: 'blocks', stepId: 'missing' } })
  ).rejects.toThrow();
  expect(io.write).toHaveBeenCalledTimes(1);
});
it('compensates a partially prepared batch on cancellation', async () => {
  const args = input();
  args.sources.push({ kind: 'file', file: png('second.png') });
  const controller = new AbortController();
  await expect(
    importScenarioImages({
      ...args,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    })
  ).rejects.toThrow();
  expect(io.discard).toHaveBeenCalledTimes(1);
  expect(io.commit).not.toHaveBeenCalled();
});
it('compensates prepared images when a later decode or quota write fails', async () => {
  for (const failure of ['decode', 'write']) {
    vi.clearAllMocks();
    const args = input();
    args.sources.push({ kind: 'file', file: png('broken.png') });
    if (failure === 'decode')
      io.decode
        .mockResolvedValueOnce({ width: 120, height: 80 })
        .mockRejectedValueOnce(new Error('decode'));
    else
      io.write
        .mockResolvedValueOnce({
          ref: {
            assetId: 'prepared',
            createdAt: 200,
            location: { kind: 'opfs', objectKey: 'objects/prepared' },
            mimeType: 'image/png',
            sha256: null,
            size: 9,
          },
        })
        .mockRejectedValueOnce(new Error('quota'));
    await expect(importScenarioImages(args)).rejects.toThrow(
      failure === 'decode' ? 'decode' : 'quota'
    );
    expect(io.discard).toHaveBeenCalledTimes(1);
    expect(io.commit).not.toHaveBeenCalled();
  }
});
it('leaves post-handoff conflict cleanup to the publication owner', async () => {
  io.commit.mockRejectedValue(new Error('stale project'));
  await expect(importScenarioImages(input())).rejects.toThrow('stale project');
  expect(io.discard).not.toHaveBeenCalled();
  expect(io.event).not.toHaveBeenCalled();
});
it('rejects unsupported files and invalid batches without writes', async () => {
  await expect(importScenarioImages({ ...input(), sources: [] })).rejects.toThrow();
  await expect(
    importScenarioImages({
      ...input(),
      sources: [{ kind: 'file', file: new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }) }],
    })
  ).rejects.toThrow();
  expect(io.write).not.toHaveBeenCalled();
});
it('requires a current library raster and independent editable document', async () => {
  io.entry.mockResolvedValue({
    id: 'library',
    kind: 'image',
    source: { kind: 'screenshot' },
    filename: 'Edited.png',
    originalFilename: 'Original.png',
    createdAt: 1,
    updatedAt: 2,
    size: 9,
    mimeType: 'image/png',
    width: 120,
    height: 80,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
    workspaceRevision: 3,
  });
  io.presentation.mockResolvedValue({
    aggregateId: 'library',
    aggregateKind: 'image',
    presentationRevision: 3,
    previewBlob: png(),
    thumbnailBlob: png(),
    updatedAt: 2,
  });
  io.workspace.mockResolvedValue({
    aggregateId: 'library',
    createdAt: 1,
    updatedAt: 2,
    revision: 3,
    sourceTitle: null,
    sourceUrl: null,
    releaseDocumentAssets: io.release,
    document: createScenarioCaptureEditorDocument({
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      sourceWidth: 120,
      sourceHeight: 80,
      overlays: [],
    }),
  });
  const sources = [{ kind: 'library' as const, mediaId: 'library' }];
  await importScenarioImages({ ...input(), sources });
  expect(io.commit.mock.calls[0]?.[1]?.children?.editorDocumentPuts).toHaveLength(1);
  expect(io.release).toHaveBeenCalledTimes(1);
  io.workspace.mockResolvedValue(undefined);
  await expect(importScenarioImages({ ...input(), sources })).rejects.toThrow('changed');
  expect(io.commit).toHaveBeenCalledTimes(1);
});

it('rejects absent library entries and stale previews before staging', async () => {
  await expect(
    importScenarioImages({ ...input(), sources: [{ kind: 'library', mediaId: 'missing' }] })
  ).rejects.toThrow('unavailable');
  expect(io.write).not.toHaveBeenCalled();
});
it('rejects already cancelled and over-limit batches before staging', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(importScenarioImages({ ...input(), signal: controller.signal })).rejects.toThrow();
  await expect(
    importScenarioImages({
      ...input(),
      sources: Array.from({ length: 51 }, () => ({ kind: 'file', file: png() })),
    })
  ).rejects.toThrow();
  const args = input();
  args.project.items = Array.from({ length: 300 }, () => createGuideStep());
  await expect(importScenarioImages(args)).rejects.toThrow('limit');
  expect(io.write).not.toHaveBeenCalled();
});

function replacementInput() {
  const args = input();
  const step = createGuideStep('Selected', 'step');
  const image = createGuideImageBlock({
    id: 'target',
    assetId: 'old-asset',
    width: 640,
    height: 360,
    editDocumentId: 'old-document',
    galleryAssetId: 'old-gallery',
    source: { kind: 'import', filename: 'old.png' },
  });
  image.htmlExport = {
    content: 'frame',
    optimize: true,
    maxEdge: 1920,
    quality: 0.85,
    viewer: false,
  };
  image.caption = 'Keep caption';
  image.width = 'half';
  image.alt = 'Keep description';
  image.fit = 'cover';
  image.contentTransform = { x: 0.3, y: -0.2, scale: 2 };
  step.blocks = [
    { kind: 'heading', id: 'heading', text: 'Before' },
    image,
    { ...image, id: 'other', assetId: 'other-asset' },
  ];
  args.project.items = [step];
  return {
    ...args,
    placement: { kind: 'replace-image' as const, stepId: 'step', blockId: 'target' },
  };
}
it('replaces exactly one image with fresh resources while retaining its layout and identity', async () => {
  const args = replacementInput();
  const original = structuredClone(args.project);
  const result = await importScenarioImages(args);
  expect(result.items).toHaveLength(1);
  const step = result.items[0];
  if (step?.kind !== 'step') throw new Error('Missing step');
  expect(step.blocks).toHaveLength(3);
  expect(step.blocks[0]).toEqual(
    original.items[0]?.kind === 'step' ? original.items[0].blocks[0] : null
  );
  expect(step.blocks[2]).toEqual(
    original.items[0]?.kind === 'step' ? original.items[0].blocks[2] : null
  );
  expect(step.blocks[1]).toMatchObject({
    kind: 'image',
    id: 'target',
    htmlExport: { content: 'frame', optimize: true, maxEdge: 1920, quality: 0.85, viewer: false },
    caption: 'Keep caption',
    width: 'half',
    alt: 'Keep description',
    frame: { width: 640, height: 360 },
    fit: 'cover',
    contentTransform: { x: 0, y: 0, scale: 1 },
    galleryAssetId: null,
    editDocumentId: null,
    source: { kind: 'import', filename: 'image.png' },
  });
  expect(step.blocks[1]?.kind === 'image' && step.blocks[1].assetId).not.toBe('old-asset');
  expect(args.project).toEqual(original);
  expect(io.commit).toHaveBeenCalledTimes(1);
  expect(io.commit.mock.calls[0]?.[1]).toMatchObject({ expectedUpdatedAt: 100 });
});
it('rejects missing, non-image and multi-source replacement targets before staging', async () => {
  const args = replacementInput();
  for (const blockId of ['missing', 'heading'])
    await expect(
      importScenarioImages({ ...args, placement: { ...args.placement, blockId } })
    ).rejects.toThrow();
  await expect(
    importScenarioImages({ ...args, placement: { ...args.placement, stepId: 'missing' } })
  ).rejects.toThrow();
  await expect(
    importScenarioImages({ ...args, sources: [...args.sources, ...args.sources] })
  ).rejects.toThrow();
  expect(io.write).not.toHaveBeenCalled();
  expect(io.commit).not.toHaveBeenCalled();
});
it('replaces at block capacity and preserves the original on cancellation or conflict', async () => {
  const args = replacementInput();
  const step = args.project.items[0];
  if (step?.kind !== 'step') throw new Error('Missing step');
  while (step.blocks.length < 200)
    step.blocks.push({ kind: 'heading', id: `extra-${step.blocks.length}`, text: '' });
  const original = structuredClone(args.project);
  const result = await importScenarioImages(args);
  expect(result.items[0]?.kind === 'step' && result.items[0].blocks.length).toBe(200);
  vi.clearAllMocks();
  const controller = new AbortController();
  await expect(
    importScenarioImages({
      ...args,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    })
  ).rejects.toThrow();
  expect(io.commit).not.toHaveBeenCalled();
  expect(io.discard).toHaveBeenCalledTimes(1);
  vi.clearAllMocks();
  io.commit.mockRejectedValue(new Error('stale project'));
  await expect(importScenarioImages(args)).rejects.toThrow('stale project');
  expect(io.discard).not.toHaveBeenCalled();
  expect(io.event).not.toHaveBeenCalled();
  expect(args.project).toEqual(original);
});
it('fills a resource-free slot without adding a second block', async () => {
  const args = replacementInput();
  const step = args.project.items[0];
  if (step?.kind !== 'step') throw new Error('Missing step');
  step.blocks = [
    {
      kind: 'image-slot',
      id: 'target',
      frame: { width: 960, height: 540 },
      fit: 'contain',
      alt: '',
      caption: '',
    },
  ];
  const result = await importScenarioImages(args);
  expect(result.items[0]).toMatchObject({
    blocks: [{ kind: 'image', id: 'target', frame: { width: 960, height: 540 } }],
  });
  expect(step.blocks[0]?.kind).toBe('image-slot');
  expect(io.commit).toHaveBeenCalledTimes(1);
});
it('publishes independent video-frame bytes with user text and source provenance', async () => {
  const frame = {
    kind: 'video-frame' as const,
    blob: png(),
    source: {
      kind: 'video-frame' as const,
      recordingId: 'recording',
      filename: 'source.webm',
      timeSeconds: 1.25,
      action: {
        id: 'click',
        kind: 'CLICK' as const,
        time: 1,
        duration: 0.5,
        label: 'Open',
        point: { x: 0.2, y: 0.3 },
        target: { name: 'Open', tag: 'button', role: '' },
      },
    },
    title: 'Open the menu',
    description: 'Choose the settings item.',
  };
  const result = await importScenarioImages({ ...input(), sources: [frame] });
  expect(result.items[0]).toMatchObject({
    title: frame.title,
    blocks: [
      { kind: 'text', paragraphs: [{ runs: [{ text: frame.description }] }] },
      { kind: 'image', source: frame.source, galleryAssetId: null },
    ],
  });
  expect(io.entry).not.toHaveBeenCalled();
  expect(io.workspace).not.toHaveBeenCalled();
  expect(io.commit.mock.calls[0]?.[1]?.children?.assetPuts).toHaveLength(1);
  expect(io.commit.mock.calls[0]?.[1]?.children?.editorDocumentPuts).toEqual([]);
});
it('rejects invalid video provenance before preparing any part of a batch', async () => {
  await expect(
    importScenarioImages({
      ...input(),
      sources: [
        { kind: 'file', file: png() },
        {
          kind: 'video-frame',
          blob: png(),
          source: { kind: 'video-frame', recordingId: null, filename: 'video', timeSeconds: NaN },
          title: '',
          description: '',
        },
      ],
    })
  ).rejects.toThrow();
  expect(io.write).not.toHaveBeenCalled();
  expect(io.commit).not.toHaveBeenCalled();
});

it('inserts an ordered batch before an existing item in a single publication', async () => {
  const args = input();
  args.project.items = [createGuideStep('First', 'first'), createGuideStep('Last', 'last')];
  const result = await importScenarioImages({
    ...args,
    sources: [
      { kind: 'file', file: png('A.png') },
      { kind: 'file', file: png('B.png') },
    ],
    placement: { kind: 'steps', beforeItemId: 'last' },
  });
  expect(result.items.map((item) => item.title)).toEqual(['First', 'A.png', 'B.png', 'Last']);
  expect(io.commit).toHaveBeenCalledTimes(1);
  expect(args.project.items).toHaveLength(2);
});
it('rejects a vanished insertion anchor before acquiring assets', async () => {
  await expect(
    importScenarioImages({ ...input(), placement: { kind: 'steps', beforeItemId: 'gone' } })
  ).rejects.toThrow();
  expect(io.write).not.toHaveBeenCalled();
  expect(io.commit).not.toHaveBeenCalled();
});
