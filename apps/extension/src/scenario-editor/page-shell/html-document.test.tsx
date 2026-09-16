// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { DEFAULT_HTML_IMAGES } from './html-image-settings';
import { expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
  createGuideParagraphs,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { buildGuideHtml } from './html-document';

it('serializes canonical content safely with local styles, fonts and private image markers', async () => {
  vi.stubGlobal('crypto', webcrypto);
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
  const result = await buildGuideHtml(project, createTranslator('en'), 'dark', {
    rasters: [
      {
        block: image,
        settings: DEFAULT_HTML_IMAGES,
        width: 100,
        height: 50,
        size: 10,
        mime: 'image/png',
      },
    ],
    blocks: new Map([
      ['image', 0],
      ['image2', 0],
    ]),
  });
  const document = new DOMParser().parseFromString(result.html, 'text/html');
  expect(result.rasters).toHaveLength(1);
  expect(document.querySelectorAll('script')).toHaveLength(1);
  expect(document.querySelector('script')?.textContent).not.toContain(project.name);
  expect(document.querySelector('title')?.textContent).toBe(project.name);
  expect(document.querySelectorAll('use')).toHaveLength(2);
  expect(document.querySelector('svg[role=img]')?.getAttribute('aria-label')).toBe('Alt <script>');
  expect([...result.html.matchAll(/href="data:image\/png;base64,SNIPTALE_ASSET_0"/g)]).toHaveLength(
    1
  );
  expect(document.querySelector('meta[http-equiv]')?.getAttribute('content')).toMatch(
    /script-src 'sha256-[A-Za-z0-9+/=]+'/
  );
  vi.unstubAllGlobals();
  expect(document.querySelector('style')?.textContent?.includes('font-family:Guide0')).toBe(true);
  expect(document.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain(
    "default-src 'none'"
  );
});

it('projects grouped step navigation without hiding content from script-free readers', async () => {
  vi.stubGlobal('crypto', webcrypto);
  try {
    const project = createGuideProject('Guide');
    project.items = [
      { kind: 'section', id: 'intro', title: '<Introduction>', paragraphs: [] },
      createGuideStep('One', 'one'),
      createGuideStep('Two', 'two'),
    ];
    const result = await buildGuideHtml(
      project,
      createTranslator('en'),
      'light',
      { rasters: [], blocks: new Map() },
      { mode: 'steps', navigation: 'side' }
    );
    const document = new DOMParser().parseFromString(result.html, 'text/html');
    expect(document.querySelector('.guide-reading-layout')?.getAttribute('data-reading-mode')).toBe(
      'steps'
    );
    expect(document.querySelector('.guide-reading-layout')?.getAttribute('data-navigation')).toBe(
      'side'
    );
    expect(document.querySelectorAll('[data-guide-target]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-guide-page="guide-item-one"]')).toHaveLength(2);
    expect(document.querySelectorAll('.guide-read-document > [hidden]')).toHaveLength(0);
    expect(document.querySelectorAll('script')).toHaveLength(1);
    expect(document.querySelector('script')?.textContent).not.toContain('<Introduction>');
  } finally {
    vi.unstubAllGlobals();
  }
});
