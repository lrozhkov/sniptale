import { expect, it } from 'vitest';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import {
  createGuideImageBlock,
  createGuideParagraphs,
  createGuideProject,
  createGuideStep,
} from './factories';

it('creates independently editable projects with empty optional content', () => {
  const first = createGuideProject('First', 'first', 10);
  const second = createGuideProject('Second', 'second', 20);
  first.style.theme = 'graphite';
  first.items.push(createGuideStep('', 'step'));
  expect(second.items).toEqual([]);
  expect(second.style.theme).toBe('paper');
  expect(parseGuideProject(first).status).toBe('ok');
  expect(parseGuideProject(second).status).toBe('ok');
});

it('supports multiple independent images and repeated text blocks within one step', () => {
  const project = createGuideProject('Guide', 'guide', 10);
  const step = createGuideStep('', 'step');
  step.blocks.push(
    {
      kind: 'text',
      id: 'text',
      paragraphs: createGuideParagraphs('<script>literal</script>\nSecond paragraph'),
    },
    createGuideImageBlock({
      id: 'image-1',
      assetId: 'logical-asset',
      width: 800,
      height: 600,
      source: { kind: 'import', filename: 'first.png' },
    }),
    createGuideImageBlock({
      id: 'image-2',
      assetId: 'logical-asset',
      width: 400,
      height: 300,
      source: { kind: 'import', filename: 'second.png' },
    })
  );
  project.items.push(step);
  expect(parseGuideProject(project).status).toBe('ok');
  expect(step.blocks[0]).toMatchObject({
    paragraphs: [
      { runs: [{ text: '<script>literal</script>', href: null }] },
      { runs: [{ text: 'Second paragraph', href: null }] },
    ],
  });
});

it('fits tall captures into valid frames without changing their stored asset', () => {
  const project = createGuideProject('Long page', 'long-project', 1);
  const step = createGuideStep('', 'long-step');
  const image = createGuideImageBlock({
    id: 'long-image',
    assetId: 'original-tall-asset',
    width: 1000,
    height: 20000,
    source: { kind: 'import', filename: 'long.png' },
  });
  step.blocks.push(image);
  project.items.push(step);
  expect(parseGuideProject(project).status).toBe('ok');
  expect(image.frame.width / image.frame.height).toBe(0.05);
  expect(image.assetId).toBe('original-tall-asset');
});
