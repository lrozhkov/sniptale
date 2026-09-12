// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
  createGuideParagraphs,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideReadDocument } from './reader-document';

it('renders all images and semantic prose without edit controls or empty placeholders', () => {
  const project = createGuideProject('Reader');
  const step = createGuideStep('', 'step');
  step.numbering = { label: 'A.1' };
  step.layout = 'comparison';
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 800,
    height: 400,
    source: { kind: 'import', filename: 'image.png' },
  });
  image.contentTransform = { x: 0.1, y: -0.2, scale: 1.5 };
  image.caption = 'Caption';
  image.alt = 'Description';
  step.blocks = [
    image,
    { ...image, id: 'second', caption: '' },
    { kind: 'text', id: 'empty', paragraphs: [] },
    { kind: 'heading', id: 'heading', text: '' },
    { kind: 'heading', id: 'subheading', text: 'Subheading' },
    {
      kind: 'image-slot',
      id: 'slot',
      frame: { width: 800, height: 400 },
      fit: 'contain',
      alt: '',
      caption: '',
    },
    {
      kind: 'note',
      id: 'note',
      tone: 'warning',
      paragraphs: createGuideParagraphs('<script>plain text</script>'),
      textStyle: { size: 'large', alignment: 'center' },
    },
    {
      kind: 'text',
      id: 'formatted',
      paragraphs: [
        { runs: [{ text: 'Docs', bold: true, italic: true, href: 'https://example.com/docs' }] },
        { runs: [] },
        ...createGuideParagraphs('After'),
      ],
    },
  ];
  project.items = [step];
  const html = renderToStaticMarkup(
    <GuideReadDocument
      project={project}
      images={{ asset: 'data:image/png;base64,AA==' }}
      t={createTranslator('en')}
    />
  );
  const doc = new DOMParser().parseFromString(html, 'text/html');
  expect(doc.querySelectorAll('img')).toHaveLength(2);
  expect(doc.querySelectorAll('figcaption')).toHaveLength(1);
  expect(doc.querySelector('img')?.getAttribute('style')).toContain('scale:1.5');
  expect(doc.querySelector('img')?.getAttribute('alt')).toBe('Description');
  expect(doc.querySelector('header span')?.textContent).toBe('A.1');
  expect(doc.querySelectorAll('textarea, input, button, script')).toHaveLength(0);
  expect(doc.querySelector('[data-block-id="empty"]')).toBeNull();
  expect(doc.querySelector('[data-block-id="heading"]')).toBeNull();
  expect(doc.querySelector('[data-block-id="slot"]')).toBeNull();
  expect(doc.querySelector('h3')?.textContent).toBe('Subheading');
  expect(doc.querySelector('[role="note"]')?.getAttribute('data-tone')).toBe('warning');
  expect(doc.querySelector('[role="note"]')?.textContent).toBe('<script>plain text</script>');
  expect(doc.querySelector('a em strong')?.textContent).toBe('Docs');
  expect(doc.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  expect(doc.querySelector('[data-block-id="formatted"] br')).not.toBeNull();
  expect(doc.querySelector('[data-block-id="image"]')?.getAttribute('data-width')).toBe('50');
});

it('resolves numbering over the whole document when reading one item and reports missing media', () => {
  const project = createGuideProject('Reader');
  const hidden = createGuideStep('Hidden', 'hidden');
  hidden.showNumber = false;
  const step = createGuideStep('Visible', 'visible');
  step.blocks = [
    createGuideImageBlock({
      id: 'image',
      assetId: 'asset',
      width: 800,
      height: 400,
      source: { kind: 'import', filename: 'image.png' },
    }),
  ];
  project.items = [hidden, step];
  const html = renderToStaticMarkup(
    <GuideReadDocument
      project={project}
      itemId="visible"
      images={{ asset: null }}
      t={createTranslator('en')}
    />
  );
  const doc = new DOMParser().parseFromString(html, 'text/html');
  expect(doc.querySelectorAll('article')).toHaveLength(1);
  expect(doc.querySelector('header span')?.textContent).toBe('1');
  expect(doc.querySelector('[role="status"]')).not.toBeNull();
});

it('retains deliberate empty space and minimum height in shared HTML and print markup', () => {
  const project = createGuideProject('Spacing');
  const step = createGuideStep('Layout', 'step');
  step.blocks = [
    { kind: 'text', id: 'space', paragraphs: [], minHeight: 180, width: 'half' },
    { kind: 'heading', id: 'heading', text: 'More content may grow', minHeight: 120 },
    { kind: 'text', id: 'unused', paragraphs: [] },
  ];
  project.items = [step];
  const html = renderToStaticMarkup(
    <GuideReadDocument project={project} images={{}} t={createTranslator('en')} />
  );
  expect(html).toContain('data-block-id="space"');
  expect(html).toContain('--guide-block-min-height:180px');
  expect(html).toContain('--guide-block-min-height:120px');
  expect(html).not.toContain('data-block-id="unused"');
});

it('keeps all heading presets above ordinary body and below the step title', () => {
  const project = createGuideProject('Typography');
  const step = createGuideStep('Step title');
  step.blocks = (['small', 'normal', 'large'] as const).map((size) => ({
    kind: 'heading',
    id: size,
    text: size,
    textStyle: { size, alignment: 'center' },
  }));
  project.items = [step];
  const markup = renderToStaticMarkup(
    <GuideReadDocument project={project} images={{}} t={createTranslator('en')} />
  );
  // Parse generated React markup without introducing a product HTML sink.
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const headings = [...doc.querySelectorAll('h3')];
  expect(headings.map((heading) => heading.style.fontSize)).toEqual([
    '1.125rem',
    '1.25rem',
    '1.375rem',
  ]);
  expect(headings.every((heading) => heading.style.textAlign === 'center')).toBe(true);
  expect(doc.querySelector('h2')?.textContent).toBe('Step title');
});

it('retains local boundaries even when their empty leading block is omitted from output', () => {
  const project = createGuideProject('Rows');
  const step = createGuideStep('Step');
  step.blocks = [
    { kind: 'heading', id: 'a', text: 'First', width: 30 },
    { kind: 'heading', id: 'empty', text: '', rowStart: true },
    { kind: 'heading', id: 'b', text: 'Second', width: 40 },
    { kind: 'heading', id: 'c', text: 'Third', width: 30 },
  ];
  project.items = [step];
  const markup = renderToStaticMarkup(
    <GuideReadDocument project={project} images={{}} t={createTranslator('en')} />
  );
  const document = new DOMParser().parseFromString(markup, 'text/html');
  expect([...document.querySelectorAll('.guide-block-row')].map((row) => row.textContent)).toEqual([
    'First',
    'SecondThird',
  ]);
  expect(document.querySelectorAll('[data-block-id="empty"]')).toHaveLength(0);
});
