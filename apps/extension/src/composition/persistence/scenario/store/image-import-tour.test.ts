import { expect, it } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../../../features/scenario/project/public';
import { admitTourImageImport, placeTourImportedImage } from './image-import-tour';
const image = {
  assetId: 'image',
  editDocumentId: null,
  galleryAssetId: null,
  width: 120,
  height: 80,
  alt: '',
  source: { kind: 'import' as const, filename: 'image.png' },
};
it('admits ordered insertion and keeps surrounding authored slides', () => {
  const project = createGuideProject('Project');
  project.tour = createTourDocument();
  project.tour.slides = [createTourImageSlide('last')];
  const placement = { kind: 'tour-slides' as const, beforeSlideId: 'last' };
  admitTourImageImport(project, placement, 2);
  for (const title of ['A', 'B'])
    placeTourImportedImage(project, placement, { image, title, description: '' });
  expect(project.tour.slides.map((slide) => slide.title)).toEqual(['A', 'B', '']);
});
it('rejects capacity and step-template destination before any placement', () => {
  const project = createGuideProject('Project');
  expect(() => admitTourImageImport(project, { kind: 'tour-slides' }, 301)).toThrow('limit');
  expect(project.tour).toBeUndefined();
  project.purpose = 'step-template';
  expect(() => admitTourImageImport(project, { kind: 'tour-slides' }, 1)).toThrow('templates');
});
it('updates navigation background without changing its buttons or text', () => {
  const project = createGuideProject('Project');
  project.tour = createTourDocument();
  project.tour.slides = [
    {
      kind: 'navigation',
      id: 'nav',
      title: 'Menu',
      description: 'Keep',
      background: { image: null, color: '#000000' },
      buttons: [],
      narration: null,
      timing: createTourImageSlide().timing,
    },
  ];
  const placement = { kind: 'tour-background' as const, slideId: 'nav' };
  admitTourImageImport(project, placement, 1);
  placeTourImportedImage(project, placement, { image, title: 'Ignored', description: 'Ignored' });
  expect(project.tour.slides[0]).toMatchObject({
    title: 'Menu',
    description: 'Keep',
    buttons: [],
    background: { image },
  });
});
