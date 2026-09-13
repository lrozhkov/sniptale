import { beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../features/scenario/project/public';
const io = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock('./source', () => ({ findScenarioImageEditorSource: io.find }));
import { prepareTourFromGuide } from './tour-materials';
function input() {
  const project = createGuideProject('Guide', 'project');
  const step = createGuideStep('Click', 'step');
  step.blocks = [
    createGuideImageBlock({
      id: 'image',
      assetId: 'asset',
      width: 30,
      height: 20,
      source: {
        kind: 'capture',
        captureSurface: 'visible',
        sourceKind: 'auto-click',
        page: {
          title: 'Page',
          url: 'https://example.com',
          viewport: { x: 0, y: 0, width: 800, height: 600 },
          scrollX: 0,
          scrollY: 400,
          devicePixelRatio: 2,
        },
        interactionPoint: { x: 200, y: 300 },
        cursorPoint: null,
        target: null,
        captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
      },
    }),
  ];
  project.items = [step];
  return { project, textOnly: 'report' as const, signal: new AbortController().signal };
}
beforeEach(() => {
  io.find.mockReset();
  io.find.mockResolvedValue({ dataUrl: 'data:image/png;base64,YQ==', width: 1600, height: 1200 });
});
it.each([1, 2])(
  'uses intrinsic dimensions and visible CSS coordinate evidence at DPR%d',
  async (dpr) => {
    const args = input();
    const block = args.project.items[0];
    if (
      block?.kind !== 'step' ||
      block.blocks[0]?.kind !== 'image' ||
      block.blocks[0].source.kind !== 'capture'
    )
      throw new Error('Missing capture');
    block.blocks[0].source.page.devicePixelRatio = dpr;
    io.find.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,YQ==',
      width: 800 * dpr,
      height: 600 * dpr,
    });
    const before = structuredClone(args.project);
    const proposal = await prepareTourFromGuide(args);
    expect(proposal.issues).toEqual([]);
    expect(proposal.tour.slides[0]).toMatchObject({
      image: { width: 800 * dpr, height: 600 * dpr },
      hotspots: [{ point: { x: 0.25, y: 0.5 } }],
      origin: { stepId: 'step', blockId: 'image' },
    });
    expect(args.project).toEqual(before);
  }
);
it('reports absent resources and never hides storage failures', async () => {
  io.find.mockResolvedValueOnce(undefined);
  expect((await prepareTourFromGuide(input())).issues).toEqual([
    { kind: 'missing-image', sourceId: 'image' },
  ]);
  const failure = new Error('storage unavailable');
  io.find.mockRejectedValueOnce(failure);
  await expect(prepareTourFromGuide(input())).rejects.toBe(failure);
});
it('reports selection capture without a known crop instead of inventing a target', async () => {
  const args = input();
  const step = args.project.items[0];
  if (
    step?.kind !== 'step' ||
    step.blocks[0]?.kind !== 'image' ||
    step.blocks[0].source.kind !== 'capture'
  )
    throw new Error('Missing capture');
  step.blocks[0].source.captureSurface = 'selection';
  const proposal = await prepareTourFromGuide(args);
  expect(proposal.issues).toEqual([{ kind: 'place-hotspot', sourceId: 'image' }]);
  expect(proposal.tour.slides[0]).toMatchObject({ hotspots: [] });
});
it('honors cancellation without allocating or modifying a project', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(prepareTourFromGuide({ ...input(), signal: controller.signal })).rejects.toThrow();
  expect(io.find).not.toHaveBeenCalled();
});
