// @vitest-environment jsdom
import { expect, it } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
  createGuideParagraphs,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { buildGuideHtml } from './html-document';

it('serializes canonical content safely with local styles, fonts and private image markers', () => {
  const project = createGuideProject('</title><script>alert(1)</script>');
  const step = createGuideStep('Safe <heading>', 'step');
  step.blocks.push({
    kind: 'text',
    id: 'text',
    paragraphs: createGuideParagraphs(
      'src="data:image/png;base64,SNIPTALE_ASSET_0" <img onerror=alert(1)>'
    ),
  });
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 100,
    height: 50,
    source: { kind: 'import', filename: 'image.png' },
  });
  image.alt = 'Alt <script>';
  image.caption = 'Caption';
  step.blocks.push(image, { ...image, id: 'image2' });
  project.items = [step];
  const result = buildGuideHtml(project, createTranslator('en'), 'dark');
  const document = new DOMParser().parseFromString(result.html, 'text/html');
  expect(result.assets).toEqual(['asset']);
  expect(document.querySelectorAll('script, link')).toHaveLength(0);
  expect(document.querySelector('title')?.textContent).toBe(project.name);
  expect(document.querySelectorAll('img')).toHaveLength(2);
  expect(document.querySelector('img')?.alt).toBe('Alt <script>');
  expect([...result.html.matchAll(/src="data:image\/png;base64,SNIPTALE_ASSET_0"/g)]).toHaveLength(
    2
  );
  expect(document.querySelector('style')?.textContent?.includes('font-family:Guide0')).toBe(true);
  expect(document.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain(
    "default-src 'none'"
  );
});
