import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';

export function tourProject() {
  const project = createGuideProject('Tour', 'tour-project', 100);
  const tour = createTourDocument('tour');
  const slide = createTourImageSlide('slide');
  slide.image = {
    assetId: 'image',
    galleryAssetId: null,
    editDocumentId: 'edit',
    width: 100,
    height: 80,
    alt: 'image',
    source: { kind: 'import', filename: 'image.png' },
  };
  slide.narration = {
    assetId: 'audio',
    duration: 3,
    trimStart: 0,
    trimEnd: 3,
    gain: 1,
    transcript: 'hello',
  };
  tour.slides = [slide];
  project.tour = tour;
  return project;
}
