import { beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideImageBlock,
  createGuideParagraphs,
  createGuideProject,
  createGuideStep,
} from '../../../../../features/scenario/project/public';
import { applyScenarioStepTemplate } from './template-apply';
const io = vi.hoisted(() => ({
  get: vi.fn(),
  asset: vi.fn(),
  prepare: vi.fn(),
  commit: vi.fn(),
  reject: vi.fn(),
  event: vi.fn(),
}));
vi.mock('../../projects', () => ({ getScenarioProject: io.get }));
vi.mock('../../projects/assets', () => ({ getScenarioAsset: io.asset }));
vi.mock('../capture-step/asset-entry', () => ({ createScenarioAssetEntryFromBlob: io.prepare }));
vi.mock('../../aggregate-mutations', () => ({ commitScenarioAggregateMutation: io.commit }));
vi.mock('../../asset-staging', () => ({ rejectScenarioMutationBeforeHandoff: io.reject }));
vi.mock('../../../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: io.event,
}));

function fixture() {
  const project = createGuideProject('Target', 'target', 1);
  const target = createGuideStep('Captured title', 'target-step');
  target.blocks = [
    createGuideImageBlock({
      id: 'captured',
      assetId: 'target-image',
      width: 800,
      height: 600,
      source: { kind: 'import', filename: 'capture.png' },
    }),
  ];
  target.numbering = { restartAt: 3 };
  project.items = [target];
  const template = createGuideProject('Template', 'template', 1);
  template.purpose = 'step-template';
  const source = createGuideStep('Reusable title', 'template-step');
  source.layout = 'side-by-side';
  source.blocks = [
    createGuideImageBlock({
      id: 'template-image',
      assetId: 'source-image',
      width: 200,
      height: 200,
      source: { kind: 'import', filename: 'template.png' },
    }),
    { kind: 'text', id: 'body', paragraphs: createGuideParagraphs('Reusable text') },
  ];
  template.items = [source];
  return { project, target, template, source };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.get.mockResolvedValue(fixture().template);
  io.asset.mockResolvedValue({
    projectId: 'template',
    file: new Blob(['image'], { type: 'image/png' }),
    galleryAssetId: null,
  });
  io.prepare.mockImplementation(async ({ projectId }) => ({
    assetEntry: { id: 'copied-asset', projectId },
  }));
  io.commit.mockImplementation(async (project) => ({ project }));
  io.reject.mockImplementation(async (_children, error) => {
    throw error;
  });
});
function apply(mode: 'appearance' | 'replace' | 'capture', project = fixture().project) {
  return applyScenarioStepTemplate({
    project,
    baseUpdatedAt: 1,
    stepId: 'target-step',
    templateId: 'template',
    mode,
  });
}

it('applies appearance without copying or replacing media and preserves the revision guard', async () => {
  const { project } = fixture();
  const next = await apply('appearance', project);
  expect(next.items[0]).toMatchObject({
    title: 'Captured title',
    layout: 'side-by-side',
    numbering: { restartAt: 3 },
    blocks: [{ assetId: 'target-image' }],
  });
  expect(io.prepare).not.toHaveBeenCalled();
  expect(io.commit).toHaveBeenCalledWith(next, {
    expectedUpdatedAt: 1,
    children: { assetPuts: [], editorDocumentPuts: [] },
  });
  expect(project.items[0]).toMatchObject({ layout: 'stacked' });
});

it('replaces content with target-owned copied media while retaining step identity and numbering', async () => {
  const next = await apply('replace');
  expect(next.items[0]).toMatchObject({
    id: 'target-step',
    title: 'Reusable title',
    numbering: { restartAt: 3 },
    blocks: [{ assetId: 'copied-asset' }, { kind: 'text' }],
  });
  expect(io.prepare).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'target' }));
  expect(io.commit).toHaveBeenCalledWith(
    next,
    expect.objectContaining({
      children: {
        assetPuts: [{ id: 'copied-asset', projectId: 'target' }],
        editorDocumentPuts: [],
      },
    })
  );
});

it('keeps the captured image and title, skipping the replaced template image before staging', async () => {
  io.asset.mockRejectedValue(new Error('Replaced image must not be read'));
  const next = await apply('capture');
  expect(next.items[0]).toMatchObject({
    title: 'Captured title',
    blocks: [{ assetId: 'target-image', frame: { width: 800, height: 600 } }, { kind: 'text' }],
  });
  expect(io.asset).not.toHaveBeenCalled();
  expect(io.prepare).not.toHaveBeenCalled();
});

it('refuses the quick capture mode once body content is authored', async () => {
  const { project, target } = fixture();
  target.blocks.push({ kind: 'heading', id: 'authored', text: 'Keep this' });
  await expect(apply('capture', project)).rejects.toThrow();
  expect(io.prepare).not.toHaveBeenCalled();
  expect(io.commit).not.toHaveBeenCalled();
});

it('does not apply an ordinary project or missing template', async () => {
  for (const template of [undefined, fixture().project]) {
    io.get.mockResolvedValue(template);
    await expect(apply('replace')).rejects.toThrow();
  }
  expect(io.prepare).not.toHaveBeenCalled();
  expect(io.commit).not.toHaveBeenCalled();
});

it('cleans staged children when a later source child is missing and preserves the destination', async () => {
  const { template, source, project } = fixture();
  source.blocks.push(
    createGuideImageBlock({
      id: 'missing',
      assetId: 'missing-asset',
      width: 100,
      height: 100,
      source: { kind: 'import', filename: 'missing.png' },
    })
  );
  io.get.mockResolvedValue(template);
  io.asset
    .mockResolvedValueOnce({
      projectId: 'template',
      file: new Blob(['image'], { type: 'image/png' }),
      galleryAssetId: null,
    })
    .mockResolvedValueOnce(undefined);
  const before = structuredClone(project);
  await expect(apply('replace', project)).rejects.toThrow();
  expect(io.reject).toHaveBeenCalledWith(
    { assetPuts: [{ id: 'copied-asset', projectId: 'target' }] },
    expect.any(Error)
  );
  expect(io.commit).not.toHaveBeenCalled();
  expect(project).toEqual(before);
});

it('propagates stale publication and leaves post-handoff compensation with the aggregate owner', async () => {
  const error = new Error('Stale');
  error.name = 'StaleScenarioAggregateRevisionError';
  io.commit.mockRejectedValue(error);
  await expect(apply('replace')).rejects.toBe(error);
  expect(io.reject).not.toHaveBeenCalled();
  expect(io.event).not.toHaveBeenCalled();
});
