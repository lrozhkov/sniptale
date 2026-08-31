import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { verifyContentExports } from './content-export-verification.mjs';

async function createArchive(overrides = {}) {
  const zip = new JSZip();
  const inlineContent = [
    { kind: 'text', text: 'Read ' },
    { kind: 'link', text: 'the guide', url: 'https://example.test/guide' },
    {
      alt: 'Diagram',
      kind: 'image',
      sourceUrl: 'https://cdn.example.test/diagram.png',
    },
  ];
  zip.file(
    'exports/data/page.json',
    JSON.stringify({
      meta: { title: 'Page', url: 'https://example.test/page' },
      sections: [
        {
          fields: [{ inlineContent, label: 'Paragraph', value: 'Read' }],
          title: 'Main',
        },
      ],
      ...overrides,
    })
  );
  zip.file(
    'exports/data/page.md',
    '# Page\n\n## Main\n\nRead [the guide](<https://example.test/guide>)' +
      '![Diagram](<https://cdn.example.test/diagram.png>)\n'
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Web Snapshot smoke content export verification', () => {
  it('accepts structured Markdown and JSON with matching safe original URLs', async () => {
    await expect(
      verifyContentExports(await createArchive(), {
        expectedUrl: 'https://example.test/page',
        minimumImages: 1,
        minimumLinks: 1,
      })
    ).resolves.toMatchObject({
      metrics: { images: 1, links: 1, sections: 1 },
      status: 'passed',
      violations: [],
    });
  });

  it('rejects active URLs even when JSON is otherwise readable', async () => {
    const result = await verifyContentExports(
      await createArchive({
        sections: [
          {
            fields: [
              {
                inlineContent: [{ kind: 'link', text: 'Unsafe', url: 'javascript:alert(1)' }],
              },
            ],
            title: 'Main',
          },
        ],
      })
    );
    expect(result.violations).toContain('safe-inline-urls');
  });
});
