import type { TourPlayerLabels } from './document';
import { createTourDocument, createTourImageSlide } from '../project/factories';
const labels: TourPlayerLabels = {
  expand: 'Expand explanation',
  collapse: 'Collapse explanation',
  previous: 'Back',
  next: 'Next',
  contents: 'Contents',
  close: 'Close',
  restart: 'Restart',
  finished: 'Finished',
  empty: 'Empty',
  point: 'Point',
  details: 'Details',
  play: 'Play',
  pause: 'Pause',
  seek: 'Playback position',
  retry: 'Retry',
  loading: 'Loading',
  mediaError: 'Image failed',
  choose: 'Choose a destination',
};
export const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=';
export function fixture(binding: 'slides' | 'stage' = 'slides') {
  const tour = createTourDocument('tour');
  const slide = createTourImageSlide('one');
  slide.title = 'First';
  slide.image = {
    assetId: 'image',
    editDocumentId: null,
    galleryAssetId: 'private-library',
    width: 640,
    height: 360,
    alt: 'Screenshot',
    source: { kind: 'import', filename: 'private-file.png' },
  };
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'hotspot'),
    ...[
      {
        id: 'point',
        point: { x: 0.25, y: 0.5 },
        targetRect: null,
        label: 'Continue',
        text: 'Explanation',
        appearance: null,
        visual: { kind: 'point' as const, pulse: true },
      },
    ].map((object) => ({ type: 'hotspot' as const, object })),
  ];
  tour.slides = [
    slide,
    {
      ...createTourImageSlide('two'),
      title: 'Second',
      image: slide.image,
      actions: [
        {
          type: 'annotation',
          object: { id: 'second-action', text: 'Second', anchor: null, appearance: null },
        },
      ],
    },
  ];
  if (binding === 'stage') {
    tour.stage.image = slide.image;
    tour.slides = tour.slides.map((item) =>
      item.kind === 'image'
        ? {
            ...item,
            image: null,
            actions: [
              {
                type: 'annotation',
                object: { id: `${item.id}-text`, text: item.title, anchor: null, appearance: null },
              },
            ],
          }
        : item
    );
  }
  tour.endScreen.title = 'Done';
  return {
    tour,
    assets: [{ id: 'image', mime: 'image/png', base64: png }],
    title: 'Tour',
    labels: { ...labels },
  };
}
export function open(html: string) {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const window = frame.contentWindow;
  if (!window) throw new Error('Missing test frame');
  const dialog = window.document.createElement('dialog');
  const prototype = Object.getPrototypeOf(dialog);
  prototype.showModal = function () {
    this.open = true;
  };
  prototype.close = function () {
    this.open = false;
  };
  window.document.open();
  window.document.write(html);
  window.document.close();
  return { window, close: () => frame.remove() };
}
