import type { TourDocument } from '@sniptale/runtime-contracts/scenario/types/tour';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import { buildTourPlayerHtml, type TourPlayerLabels } from './document';

/** One explicit action makes each controller fixture a stop in the viewer sequence. */
export function createTourActionSlide(id: string = crypto.randomUUID()) {
  const slide = createTourImageSlide(id);
  slide.actions = [
    {
      type: 'annotation',
      object: { id: `${id}-action`, text: '', anchor: null, appearance: null },
    },
  ];
  return slide;
}

/** Builds the real shell independently from incomplete editor inputs under controller test. */
export function buildTourPlayerTestHtml(input: {
  tour: TourDocument;
  labels: TourPlayerLabels;
  title: string;
  assets: readonly { id: string; mime: string; base64: string }[];
}) {
  const tour = createTourDocument('shell-tour');
  const slide = createTourImageSlide('shell-slide');
  slide.image = {
    assetId: 'shell-image',
    galleryAssetId: null,
    editDocumentId: null,
    width: 1,
    height: 1,
    alt: '',
    source: { kind: 'import', filename: 'shell.png' },
  };
  slide.actions = [
    {
      type: 'annotation',
      object: { id: 'shell-action', text: '', anchor: null, appearance: null },
    },
  ];
  tour.slides = [slide];
  return buildTourPlayerHtml({
    tour,
    title: input.title,
    labels: input.labels,
    assets: [
      {
        id: 'shell-image',
        mime: 'image/png',
        base64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=',
      },
    ],
  });
}
