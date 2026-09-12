import { expect, it } from 'vitest';
import {
  createGuideImageBlock,
  createGuideParagraphs,
  createGuideProject,
  createGuideStep,
} from './factories';
import { applyGuideTemplateAppearance, classifyGuideStepContent } from './templates';

it('distinguishes empty content and a captured title from authored body content', () => {
  const step = createGuideStep();
  expect(classifyGuideStepContent(step)).toBe('empty');
  step.title = 'Written title';
  expect(classifyGuideStepContent(step)).toBe('authored');
  step.blocks = [
    createGuideImageBlock({
      id: 'image',
      assetId: 'asset',
      width: 800,
      height: 600,
      source: { kind: 'import', filename: 'capture.png' },
    }),
  ];
  expect(classifyGuideStepContent(step)).toBe('image');
  step.blocks.push({ kind: 'text', id: 'empty', paragraphs: createGuideParagraphs('  ') });
  expect(classifyGuideStepContent(step)).toBe('image');
  step.blocks.push({
    kind: 'note',
    id: 'note',
    tone: 'warning',
    paragraphs: createGuideParagraphs('Keep this'),
  });
  expect(classifyGuideStepContent(step)).toBe('authored');
});

it('matches composition by block kind and occurrence without replacing content, framing or numbering', () => {
  const step = createGuideStep('Authored', 'target');
  step.numbering = { label: 'A' };
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 800,
    height: 600,
    source: { kind: 'import', filename: 'capture.png' },
  });
  image.contentTransform = { x: 0.1, y: 0.2, scale: 2 };
  step.blocks = [
    image,
    {
      kind: 'heading',
      id: 'heading',
      text: 'Keep heading',
      width: 37,
      textStyle: { size: 'small', alignment: 'end' },
    },
    { kind: 'heading', id: 'second', text: 'Keep second' },
  ];
  const template = createGuideStep('Template');
  template.layout = 'side-by-side';
  template.blocks = [
    {
      kind: 'heading',
      id: 'a',
      text: 'Discard this',
      width: 33,
      textStyle: { size: 'large', alignment: 'center' },
    },
    { kind: 'heading', id: 'b', text: 'Discard too', width: 67 },
    {
      kind: 'image-slot',
      id: 'slot',
      frame: { width: 200, height: 200 },
      fit: 'cover',
      alt: '',
      caption: '',
      width: 'full',
    },
  ];
  const before = structuredClone(step);
  const style = createGuideProject('Guide').style;
  const result = applyGuideTemplateAppearance(step, template, style, 'template-id');
  expect(result.blocks).toEqual([
    { ...image, width: 'full' },
    { ...step.blocks[1], width: 33, textStyle: { size: 'large', alignment: 'center' } },
    { ...step.blocks[2], width: 67 },
  ]);
  expect(result.title).toBe('Authored');
  expect(result.numbering).toEqual({ label: 'A' });
  expect(step).toEqual(before);
});
