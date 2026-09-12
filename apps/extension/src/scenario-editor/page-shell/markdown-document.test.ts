import { expect, it } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
  createGuideParagraphs,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { buildGuideMarkdown } from './markdown-document';

it('preserves semantic order and escapes hostile Markdown and HTML without deriving paths from input', () => {
  const project = createGuideProject('<script>');
  const step = createGuideStep('First', 'step');
  step.blocks = [
    {
      kind: 'text',
      id: 'text',
      paragraphs: [
        {
          runs: [
            {
              text: '[click]<img>!',
              bold: true,
              italic: false,
              href: 'https://example.com/a?q=<x>',
            },
          ],
        },
      ],
    },
    {
      kind: 'note',
      id: 'note',
      tone: 'warning',
      paragraphs: createGuideParagraphs('Be careful\nSecond line'),
    },
  ];
  const image = createGuideImageBlock({
    id: 'image',
    assetId: '../asset',
    width: 100,
    height: 50,
    source: { kind: 'import', filename: '../bad.png' },
  });
  image.alt = 'x](https://evil.example)';
  image.caption = 'A caption';
  step.blocks.push(image);
  project.items = [step];
  const result = buildGuideMarkdown(project, createTranslator('en'));
  expect(result.markdown).toContain('# \\<script\\>');
  expect(result.markdown).toContain('## 1 · First');
  expect(result.markdown).toContain(
    '[<strong>\\[click\\]\\<img\\>\\!</strong>](<https://example.com/a?q=%3Cx%3E>)'
  );
  expect(result.markdown).toContain('> **Warning**\n> \n> Be careful\n> \n> Second line');
  expect(result.markdown).toContain(
    '![x\\]\\(https://evil\\.example\\)](images/0001.png)\n\n*A caption*'
  );
  expect(result.images).toEqual([{ path: 'images/0001.png', block: image }]);
  expect(result.markdown).not.toContain('../');
});
it('retains section restarts, hidden numbers, optional content and adjacent styled runs', () => {
  const project = createGuideProject('Guide');
  const hidden = createGuideStep('Unnumbered', 'hidden');
  hidden.showNumber = false;
  const step = createGuideStep('Restarted', 'next');
  step.blocks = [
    { kind: 'heading', id: 'h', text: 'Details' },
    {
      kind: 'text',
      id: 't',
      paragraphs: [
        {
          runs: [
            { text: ' leading ', bold: true, italic: true, href: null },
            { text: 'next', bold: true, italic: false, href: null },
          ],
        },
      ],
    },
  ];
  project.items = [
    hidden,
    {
      kind: 'section',
      id: 'section',
      title: 'Section',
      paragraphs: createGuideParagraphs('Introduction'),
      numbering: { restartAt: 3 },
    },
    step,
  ];
  const { markdown } = buildGuideMarkdown(project, createTranslator('en'));
  expect(markdown).toContain('## Unnumbered');
  expect(markdown).toContain('## Section\n\nIntroduction\n\n## 3 · Restarted\n\n### Details');
  expect(markdown).toContain('<em><strong> leading </strong></em><strong>next</strong>');
});
it('preserves existing percent escapes in path, query and fragment destinations', () => {
  const project = createGuideProject('Guide');
  const step = createGuideStep('Links', 'links');
  const href = 'https://example.com/a%20b?q=x%2Fy&literal=%2520#part%26two';
  step.blocks = [
    {
      kind: 'text',
      id: 'text',
      paragraphs: [{ runs: [{ text: 'Open', bold: false, italic: false, href }] }],
    },
  ];
  project.items = [step];
  expect(buildGuideMarkdown(project, createTranslator('en')).markdown).toContain(
    `[Open](<${href.replace(/&/g, '&amp;')}>)`
  );
});
it('protects literal entity-like URL content from Markdown destination decoding', () => {
  const project = createGuideProject('Guide');
  const step = createGuideStep('Links', 'links');
  const href = 'https://example.com/?q=&amp;&other=&copy;#&#38;';
  step.blocks = [
    {
      kind: 'text',
      id: 'text',
      paragraphs: [{ runs: [{ text: 'Open', bold: false, italic: false, href }] }],
    },
  ];
  project.items = [step];
  expect(buildGuideMarkdown(project, createTranslator('en')).markdown).toContain(
    '[Open](<https://example.com/?q=&amp;amp;&amp;other=&amp;copy;#&amp;#38;>)'
  );
});
