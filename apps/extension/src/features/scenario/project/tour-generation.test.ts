import { expect, it } from 'vitest';
import type { TourImage } from '@sniptale/runtime-contracts/scenario/types/tour';
import { generateTourFromMaterials, generateTourFromGuide } from './tour-generation';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
  createGuideParagraphs,
} from './factories';
const image: TourImage = {
  assetId: 'asset',
  galleryAssetId: null,
  editDocumentId: null,
  width: 1000,
  height: 500,
  alt: '',
  source: { kind: 'import', filename: 'image.png' },
};
function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

it('generates occurrences in selection order without copying media or changing source evidence', () => {
  const first = { image, title: 'First', description: 'Caption' };
  const original = structuredClone(first);
  const result = generateTourFromMaterials([first, { ...first, title: 'Second' }], ids());
  expect(result.tour.slides.map((slide) => slide.title)).toEqual(['First', 'Second']);
  expect(new Set(result.tour.slides.map((slide) => slide.id)).size).toBe(2);
  expect(result.tour.slides[0]).toMatchObject({
    image: { assetId: 'asset', width: 1000 },
    annotations: [{ text: 'Caption' }],
  });
  expect(first).toEqual(original);
  expect(result.issues).toEqual([]);
});
it('uses normalized video clicks and requires placement for edited video or key actions', () => {
  const source = {
    kind: 'video-frame',
    filename: 'clip.webm',
    recordingId: 'recording',
    timeSeconds: 2,
    action: {
      id: 'action',
      kind: 'CLICK',
      time: 2,
      duration: 0,
      label: 'Click',
      point: { x: 0.25, y: 0.75 },
      target: null,
    },
  } as const;
  const material = { image: { ...image, source }, title: 'Click', description: 'Explanation' };
  const result = generateTourFromMaterials([material], ids());
  expect(result.tour.slides[0]).toMatchObject({
    hotspots: [{ point: { x: 0.25, y: 0.75 }, text: 'Explanation' }],
  });
  expect(
    generateTourFromMaterials(
      [{ ...material, image: { ...material.image, editDocumentId: 'edited' } }],
      ids()
    ).issues[0]?.kind
  ).toBe('place-hotspot');
  expect(
    generateTourFromMaterials(
      [
        {
          ...material,
          image: {
            ...material.image,
            source: { ...source, action: { ...source.action, kind: 'KEY', point: null } },
          },
        },
      ],
      ids()
    ).issues[0]?.kind
  ).toBe('place-hotspot');
});
it('preserves capture evidence while mapping only with a proven crop', () => {
  const capture: TourImage = {
    ...image,
    source: {
      kind: 'capture',
      captureSurface: 'selection',
      sourceKind: 'auto-click',
      page: {
        title: 'Page',
        url: 'https://example.com',
        viewport: { x: 0, y: 0, width: 800, height: 600 },
        scrollX: 0,
        scrollY: 500,
        devicePixelRatio: 2,
      },
      interactionPoint: { x: 150, y: 100 },
      cursorPoint: null,
      target: {
        selector: '#button',
        iframeSelector: null,
        tagName: 'button',
        role: 'button',
        text: 'Go',
        ariaLabel: null,
        title: null,
        rect: { x: 140, y: 90, width: 20, height: 20 },
        framePadding: { top: 5, left: 5, right: 5, bottom: 5 },
      },
      captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
    },
  };
  const material = { image: capture, title: 'Go', description: '' };
  expect(generateTourFromMaterials([material], ids()).issues[0]?.kind).toBe('place-hotspot');
  const mapped = generateTourFromMaterials(
    [
      {
        ...material,
        captureMapping: { sourceRect: { x: 100, y: 50, width: 100, height: 100 }, rotation: 0 },
      },
    ],
    ids()
  );
  expect(mapped.tour.slides[0]).toMatchObject({
    image: { source: capture.source },
    hotspots: [
      {
        point: { x: 0.5, y: 0.5 },
        targetRect: {
          x: 0.4,
          y: 0.4,
          width: expect.closeTo(0.2, 10),
          height: expect.closeTo(0.2, 10),
        },
      },
    ],
  });
});
it('converts sections and repeated guide images, and explicitly reports text-only and missing resources', () => {
  const project = createGuideProject('Guide', 'guide', 1);
  const step = createGuideStep('Images', 'step');
  step.blocks = ['a', 'b'].map((id) =>
    createGuideImageBlock({ id, assetId: 'asset', width: 20, height: 10, source: image.source })
  );
  const prose = createGuideStep('Only text', 'prose');
  prose.blocks = [
    { kind: 'text', id: 'text', paragraphs: createGuideParagraphs('Preserved text') },
  ];
  project.items = [
    {
      kind: 'section',
      id: 'section',
      title: 'Chapter',
      paragraphs: createGuideParagraphs('Overview'),
    },
    step,
    prose,
  ];
  const original = structuredClone(project);
  const result = generateTourFromGuide(project, () => ({ image }), 'navigation', ids());
  expect(result.tour.slides).toHaveLength(4);
  expect(result.tour.slides[0]).toMatchObject({
    kind: 'navigation',
    title: 'Chapter',
    buttons: [{ action: { kind: 'slide' } }, { action: { kind: 'slide' } }],
  });
  expect(result.tour.slides[1]).toMatchObject({
    origin: { stepId: 'step', blockId: 'a' },
    image: { width: 1000 },
  });
  expect(result.tour.slides[3]).toMatchObject({
    kind: 'navigation',
    description: 'Preserved text',
  });
  expect(result.issues).toContainEqual({ kind: 'text-only', sourceId: 'prose' });
  expect(generateTourFromGuide(project, () => null, 'report', ids()).issues).toContainEqual({
    kind: 'missing-image',
    sourceId: 'a',
  });
  expect(project).toEqual(original);
});
it('reports text overflow and rejects excessive slides without changing the input', () => {
  const material = { image, title: 'Long', description: 'x'.repeat(4001) };
  expect(generateTourFromMaterials([material], ids()).issues[0]?.kind).toBe('text-overflow');
  expect(() => generateTourFromMaterials(Array(301).fill(material), ids())).toThrow('Too many');
  expect(() =>
    generateTourFromMaterials([{ ...material, image: { ...image, width: 0 } }], ids())
  ).toThrow('invalid');
});

it('reports a valid guide alt overflow instead of aborting image conversion', () => {
  const project = createGuideProject('Guide', 'guide', 1);
  const step = createGuideStep('Image', 'step');
  const block = createGuideImageBlock({
    id: 'block',
    assetId: 'asset',
    width: 100,
    height: 50,
    source: image.source,
  });
  block.alt = 'a'.repeat(4001);
  step.blocks = [block];
  project.items = [step];
  const result = generateTourFromGuide(project, () => ({ image }), 'report', ids());
  expect(result.issues).toContainEqual({ kind: 'text-overflow', sourceId: 'block' });
  expect(result.tour.slides[0]).toMatchObject({ image: { alt: 'a'.repeat(4000) } });
  expect(block.alt).toHaveLength(4001);
});
