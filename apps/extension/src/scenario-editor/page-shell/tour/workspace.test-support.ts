import {
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';

export function fixture() {
  const project = createGuideProject('Project');
  project.items = [createGuideStep('Keep guide')];
  project.tour = createTourDocument();
  const first = createTourImageSlide('first');
  first.title = 'First';
  first.image = {
    assetId: 'image',
    width: 100,
    height: 100,
    alt: 'Image',
    galleryAssetId: null,
    editDocumentId: null,
    source: { kind: 'import', filename: 'test.png' },
  };
  const second = { ...createTourImageSlide('second'), title: 'Second', image: first.image };
  second.actions.push({
    type: 'hotspot',
    object: {
      id: 'link',
      label: 'Go first',
      text: '',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      appearance: null,
      visual: { kind: 'point', pulse: false },
    },
  });
  project.tour.slides = [first, second];
  return project;
}
