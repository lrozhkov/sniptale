import { beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../features/scenario/project/public';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  type EditorDocument,
} from '../../features/editor/document/public';
const io = vi.hoisted(() => ({
  source: vi.fn(),
  prepare: vi.fn(),
  commit: vi.fn(),
  reject: vi.fn(),
  discard: vi.fn(),
  changed: vi.fn(),
}));
vi.mock('./source', () => ({ loadScenarioImageEditorSource: io.source }));
vi.mock('./edits', () => ({ prepareScenarioEditedCaptureAsset: io.prepare }));
vi.mock('../../composition/persistence/scenario/aggregate-mutations', () => ({
  commitScenarioAggregateMutation: io.commit,
}));
vi.mock('../../composition/persistence/scenario/asset-staging', () => ({
  rejectScenarioMutationBeforeHandoff: io.reject,
}));
vi.mock('../../composition/persistence/scenario/projects', () => ({
  discardPreparedScenarioAsset: io.discard,
}));
vi.mock('../../features/media-hub/events', () => ({ publishMediaHubLibraryChanged: io.changed }));
import { applyTourImageEdit } from './tour-edits';
const dataUrl = 'data:image/png;base64,YQ==';
function document(): EditorDocument {
  return {
    version: 2,
    sourceImageData: dataUrl,
    sourceName: null,
    sourceWidth: 100,
    sourceHeight: 80,
    canvasWidth: 100,
    canvasHeight: 80,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 100,
    sourceDisplayHeight: 80,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"objects":[]}',
  };
}
function input() {
  const project = createGuideProject('Project', 'project', 100);
  project.tour = createTourDocument('tour');
  const slide = createTourImageSlide('slide');
  slide.image = {
    assetId: 'old-image',
    editDocumentId: null,
    galleryAssetId: null,
    width: 100,
    height: 80,
    alt: 'Image',
    source: { kind: 'import', filename: 'original.png' },
  };
  slide.hotspots = [
    {
      id: 'point',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      label: '',
      text: 'Keep text',
      appearance: null,
      action: { kind: 'next' },
      pulse: true,
    },
  ];
  project.tour.slides = [slide];
  return {
    project,
    baseUpdatedAt: 100,
    target: {
      projectId: 'project',
      slideId: 'slide',
      role: 'image' as const,
      assetId: 'old-image',
      editDocumentId: null,
    },
    dataUrl,
    document: document(),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.source.mockResolvedValue({ dataUrl, width: 100, height: 80 });
  io.prepare.mockResolvedValue({
    asset: { id: 'new-image', width: 100, height: 80 },
    entry: { assetId: 'prepared' },
  });
  io.commit.mockImplementation(async (project) => ({ project }));
  io.reject.mockImplementation(async (_children, error) => {
    throw error;
  });
});
it('applies one immutable image version with revision binding and unchanged source/guide content', async () => {
  const args = input();
  const before = structuredClone(args.project);
  const result = await applyTourImageEdit(args);
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') throw new Error('Expected applied');
  expect(args.project).toEqual(before);
  expect(result.project.items).toEqual(before.items);
  const slide = result.project.tour!.slides[0]!;
  expect(slide).toMatchObject({
    image: { assetId: 'new-image', source: { kind: 'import', filename: 'original.png' } },
    hotspots: [{ point: { x: 0.5, y: 0.5 }, text: 'Keep text' }],
  });
  expect(io.commit).toHaveBeenCalledWith(
    result.project,
    expect.objectContaining({
      expectedUpdatedAt: 100,
      children: expect.objectContaining({ assetPuts: [{ assetId: 'prepared' }] }),
    })
  );
  expect(io.changed).toHaveBeenCalledOnce();
});
it('requires positional acknowledgement before allocating an ambiguous edited image', async () => {
  const args = input();
  args.document.sourceImageData = 'data:image/png;base64,Yg==';
  expect(await applyTourImageEdit(args)).toEqual({ status: 'requires-target-review' });
  expect(io.prepare).not.toHaveBeenCalled();
  expect(io.commit).not.toHaveBeenCalled();
  const result = await applyTourImageEdit({ ...args, allowTargetReview: true });
  expect(result.status).toBe('applied');
  if (result.status === 'applied')
    expect(result.project.tour!.slides[0]).toMatchObject({ requiresTargetReview: true });
});
it('rejects changed target or invalid raster before loading or publishing resources', async () => {
  const args = input();
  args.target.assetId = 'different';
  await expect(applyTourImageEdit(args)).rejects.toThrow('target');
  await expect(
    applyTourImageEdit({ ...input(), dataUrl: 'https://foreign/image' })
  ).rejects.toThrow('Invalid');
  expect(io.source).not.toHaveBeenCalled();
  expect(io.prepare).not.toHaveBeenCalled();
});
it('leaves post-handoff rollback to the aggregate and emits no success event on conflict', async () => {
  const conflict = new Error('revision conflict');
  io.commit.mockRejectedValueOnce(conflict);
  await expect(applyTourImageEdit(input())).rejects.toBe(conflict);
  expect(io.reject).not.toHaveBeenCalled();
  expect(io.discard).not.toHaveBeenCalled();
  expect(io.changed).not.toHaveBeenCalled();
});
it('discards an unexpectedly stretched raster before requiring positional review', async () => {
  io.prepare.mockResolvedValueOnce({
    asset: { id: 'new-image', width: 100, height: 100 },
    entry: { assetId: 'prepared' },
  });
  expect(await applyTourImageEdit(input())).toEqual({ status: 'requires-target-review' });
  expect(io.discard).toHaveBeenCalledWith({ assetId: 'prepared' });
  expect(io.commit).not.toHaveBeenCalled();
});
it('cleans up a failure before aggregate handoff', async () => {
  const failure = new Error('identity unavailable');
  const args = input();
  const id = vi.spyOn(crypto, 'randomUUID').mockImplementationOnce(() => {
    throw failure;
  });
  try {
    await expect(applyTourImageEdit(args)).rejects.toBe(failure);
  } finally {
    id.mockRestore();
  }
  expect(io.reject).toHaveBeenCalledWith({ assetPuts: [{ assetId: 'prepared' }] }, failure);
  expect(io.commit).not.toHaveBeenCalled();
});

it('applies navigation backgrounds without inventing positional objects', async () => {
  const args = input();
  const image = args.project.tour!.slides[0]!;
  if (image.kind !== 'image') throw new Error('Missing image fixture');
  args.project.tour!.slides = [
    {
      kind: 'navigation',
      id: 'slide',
      title: 'Menu',
      description: 'Text',
      background: { color: '#000000', image: image.image },
      buttons: [],
      narration: null,
      timing: image.timing,
    },
  ];
  const result = await applyTourImageEdit({
    ...args,
    target: { ...args.target, role: 'background' },
    document: { ...args.document, sourceImageData: 'data:image/png;base64,Yg==' },
  });
  expect(result.status).toBe('applied');
  if (result.status === 'applied')
    expect(result.project.tour!.slides[0]).toMatchObject({
      kind: 'navigation',
      background: { image: { assetId: 'new-image' } },
      buttons: [],
      description: 'Text',
    });
});
it('propagates missing source admission before staging anything', async () => {
  const missing = new Error('missing owned source');
  io.source.mockRejectedValueOnce(missing);
  await expect(applyTourImageEdit(input())).rejects.toBe(missing);
  expect(io.prepare).not.toHaveBeenCalled();
  expect(io.commit).not.toHaveBeenCalled();
});
