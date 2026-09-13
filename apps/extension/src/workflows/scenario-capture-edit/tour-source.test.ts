import { beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../features/scenario/project/public';
const io = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('./source', () => ({ loadScenarioImageEditorSource: io.load }));
import { prepareTourImageEditorPayload } from './tour-source';
function fixture() {
  const project = createGuideProject('Project', 'project');
  const slide = createTourImageSlide('slide');
  slide.image = {
    assetId: 'image',
    editDocumentId: 'edit',
    galleryAssetId: null,
    width: 100,
    height: 80,
    alt: 'Image',
    source: { kind: 'import', filename: 'image.png' },
  };
  project.tour = createTourDocument('tour');
  project.tour.slides = [slide];
  return project;
}
beforeEach(() => {
  io.load.mockReset();
  io.load.mockResolvedValue({ dataUrl: 'data:image/png;base64,YQ==', width: 100, height: 80 });
});
it('binds the selected tour image without changing guide content', async () => {
  const project = fixture();
  const before = structuredClone(project);
  const result = await prepareTourImageEditorPayload(project, 'slide');
  expect(result.target).toEqual({
    projectId: 'project',
    slideId: 'slide',
    role: 'image',
    assetId: 'image',
    editDocumentId: 'edit',
  });
  expect(result.payload.title).toBe('Image');
  expect(project).toEqual(before);
});
it('binds navigation backgrounds and rejects missing slides before loading bytes', async () => {
  const project = fixture();
  const image = project.tour!.slides[0]!;
  if (image.kind !== 'image') throw new Error('Missing fixture');
  project.tour!.slides = [
    {
      kind: 'navigation',
      id: 'nav',
      title: 'Menu',
      description: '',
      background: { color: '#000000', image: image.image },
      buttons: [],
      narration: null,
      timing: image.timing,
    },
  ];
  expect((await prepareTourImageEditorPayload(project, 'nav')).target.role).toBe('background');
  io.load.mockClear();
  await expect(prepareTourImageEditorPayload(project, 'missing')).rejects.toThrow('unavailable');
  expect(io.load).not.toHaveBeenCalled();
});
