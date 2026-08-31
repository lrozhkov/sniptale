import { describe, expect, it } from 'vitest';
import { createExportContributions } from './export';

const digest = async () => 'b'.repeat(64);

describe('Export Manager Page Package contributions', () => {
  it('classifies retained Blob-mode producer entries under disjoint component roots', async () => {
    const contributions = await createExportContributions(
      [
        { path: 'README.md', textContent: 'Read me' },
        {
          path: 'report.json',
          textContent: '{}',
          mimeType: 'application/json; charset=utf-8',
        },
        {
          path: 'files/photo.png',
          binaryContent: new Blob(['png'], { type: 'image/png' }),
        },
        {
          path: 'files/manual.pdf',
          binaryContent: new Blob(['pdf'], { type: 'application/pdf' }),
        },
        { path: 'logs/errors.log', textContent: 'failed' },
        { path: 'logs/dom.html', textContent: '<html>diagnostic</html>' },
      ],
      digest
    );
    expect(
      contributions.map(({ component, path, mimeType }) => ({
        component,
        path,
        mimeType,
      }))
    ).toEqual([
      {
        component: 'pageData',
        path: 'exports/data/README.md',
        mimeType: 'text/markdown',
      },
      {
        component: 'pageData',
        path: 'exports/data/report.json',
        mimeType: 'application/json',
      },
      {
        component: 'images',
        path: 'exports/images/photo.png',
        mimeType: 'image/png',
      },
      {
        component: 'attachments',
        path: 'attachments/manual.pdf',
        mimeType: 'application/pdf',
      },
      {
        component: 'diagnostics',
        path: 'diagnostics/export/logs/errors.log',
        mimeType: 'text/plain',
      },
      {
        component: 'diagnostics',
        path: 'diagnostics/export/logs/dom.html.txt',
        mimeType: 'text/plain',
      },
    ]);
    expect(contributions.every((entry) => entry.source instanceof Blob)).toBe(true);
  });

  it('allocates normalization/case collisions deterministically and rejects base64 or ambiguous entries', async () => {
    const collisions = await createExportContributions(
      [
        { path: 'A?.json', textContent: '{}' },
        { path: 'a*.json', textContent: '{}' },
      ],
      digest
    );
    expect(collisions.map((entry) => entry.path)).toEqual([
      'exports/data/A-.json',
      'exports/data/a- (2).json',
    ]);
    await expect(
      createExportContributions([{ path: 'file.bin', binaryBase64: 'YQ==' }], digest)
    ).rejects.toThrow('Blob binary mode');
    await expect(
      createExportContributions(
        [
          {
            path: 'file.txt',
            textContent: 'a',
            binaryContent: new Blob(['a']),
          },
        ],
        digest
      )
    ).rejects.toThrow('exactly one');
  });

  it('preserves the mature full-page screenshot at its canonical archive path', async () => {
    const [screenshot] = await createExportContributions(
      [
        {
          binaryContent: new Blob(['png'], { type: 'image/png' }),
          path: 'page-screenshot.png',
        },
      ],
      digest
    );

    expect(screenshot).toMatchObject({
      component: 'images',
      mimeType: 'image/png',
      path: 'page-screenshot.png',
    });
  });

  it('rejects oversized entry inventories before invoking the digest', async () => {
    let digestCalls = 0;
    const entry = { path: 'page.json', textContent: '{}' };
    await expect(
      createExportContributions(
        Array.from({ length: 25_001 }, () => entry),
        async () => {
          digestCalls += 1;
          return 'a'.repeat(64);
        }
      )
    ).rejects.toThrow('count exceeds');
    expect(digestCalls).toBe(0);
  });
});
