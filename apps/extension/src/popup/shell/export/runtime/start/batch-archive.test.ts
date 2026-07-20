import { expect, it, vi } from 'vitest';
import JSZip from 'jszip';

import {
  createBatchArchiveBlob,
  createBatchArchiveFilename,
  createBatchExportResult,
  type PopupBatchArchiveLayout,
} from './batch-archive';

function createBatchPackage(args: {
  archiveBaseName: string;
  entries: Array<{ binaryBase64?: string; path: string; textContent?: string }>;
  stats?: {
    filesCount: number;
    filesFailed: number;
    rowsCount: number;
    sectionsCount: number;
  };
}) {
  return {
    pagePackage: {
      archiveBaseName: args.archiveBaseName,
      entries: args.entries,
      errors: [],
      stats: args.stats ?? {
        filesCount: 0,
        filesFailed: 0,
        rowsCount: 0,
        sectionsCount: 0,
      },
    },
    tabId: 1,
    tabTitle: args.archiveBaseName,
  };
}

async function openBatchArchive(
  packages: Parameters<typeof createBatchArchiveBlob>[0],
  layout: PopupBatchArchiveLayout
) {
  const archiveBlob = await createBatchArchiveBlob(packages, layout);
  return JSZip.loadAsync(await archiveBlob.arrayBuffer());
}

it('creates a timestamped batch archive filename', () => {
  expect(createBatchArchiveFilename()).toMatch(
    /^pages_export_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/
  );
});

it('formats batch archive filenames in Moscow time', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-22T10:11:12.000Z'));

  expect(createBatchArchiveFilename()).toBe('pages_export_2026-03-22_13-11-12.zip');

  vi.useRealTimers();
});

it('aggregates per-page stats and error state into the batch export result', () => {
  expect(
    createBatchExportResult({
      errors: ['tab failed'],
      filename: 'pages_export_2026-04-09_12-00-00.zip',
      packages: [
        createBatchPackage({
          archiveBaseName: 'first',
          entries: [],
          stats: {
            sectionsCount: 1,
            rowsCount: 2,
            filesCount: 3,
            filesFailed: 1,
          },
        }),
        createBatchPackage({
          archiveBaseName: 'second',
          entries: [],
          stats: {
            sectionsCount: 4,
            rowsCount: 5,
            filesCount: 6,
            filesFailed: 0,
          },
        }),
      ],
    })
  ).toEqual({
    success: false,
    filename: 'pages_export_2026-04-09_12-00-00.zip',
    errors: ['tab failed'],
    stats: {
      sectionsCount: 5,
      rowsCount: 7,
      filesCount: 9,
      filesFailed: 1,
    },
  });
});

it('writes text and binary entries into unique top-level folders for grouped layout', async () => {
  const zip = await openBatchArchive(
    [
      createBatchPackage({
        archiveBaseName: 'page',
        entries: [
          { path: 'page.json', textContent: '{}' },
          { path: 'files/image.png', binaryBase64: 'ZmFrZQ==' },
        ],
      }),
      createBatchPackage({
        archiveBaseName: 'page',
        entries: [{ path: 'page.md', textContent: '# page' }],
      }),
    ],
    'grouped'
  );
  const fileNames = Object.keys(zip.files).sort();

  expect(fileNames).toEqual([
    'page/',
    'page/files/',
    'page/files/image.png',
    'page/page.json',
    'page_1/',
    'page_1/page.md',
  ]);
  await expect(zip.file('page/page.json')?.async('string')).resolves.toBe('{}');
  await expect(zip.file('page/files/image.png')?.async('base64')).resolves.toBe('ZmFrZQ==');
  await expect(zip.file('page_1/page.md')?.async('string')).resolves.toBe('# page');
});

it('writes json files into the archive root for flat layout', async () => {
  const zip = await openBatchArchive(
    [
      createBatchPackage({
        archiveBaseName: 'first_page_2026-04-23_12-00-00',
        entries: [{ path: 'first_page_2026-04-23_12-00-00.json', textContent: '{}' }],
      }),
      createBatchPackage({
        archiveBaseName: 'second_page_2026-04-23_12-00-01',
        entries: [{ path: 'second_page_2026-04-23_12-00-01.json', textContent: '{"ok":true}' }],
      }),
    ],
    'flat'
  );

  expect(Object.keys(zip.files).sort()).toEqual([
    'first_page_2026-04-23_12-00-00.json',
    'second_page_2026-04-23_12-00-01.json',
  ]);
});

it('writes markdown files into the archive root for flat layout', async () => {
  const zip = await openBatchArchive(
    [
      createBatchPackage({
        archiveBaseName: 'first_page_2026-04-23_12-00-00',
        entries: [{ path: 'first_page_2026-04-23_12-00-00.md', textContent: '# First' }],
      }),
      createBatchPackage({
        archiveBaseName: 'second_page_2026-04-23_12-00-01',
        entries: [{ path: 'second_page_2026-04-23_12-00-01.md', textContent: '# Second' }],
      }),
    ],
    'flat'
  );

  expect(Object.keys(zip.files).sort()).toEqual([
    'first_page_2026-04-23_12-00-00.md',
    'second_page_2026-04-23_12-00-01.md',
  ]);
});

it('renames screenshot and warning log files into unique archive-root names for flat layout', async () => {
  const zip = await openBatchArchive(
    [
      createBatchPackage({
        archiveBaseName: 'first_page_2026-04-23_12-00-00',
        entries: [
          { path: 'page-screenshot.png', binaryBase64: 'Zmlyc3Q=' },
          { path: 'logs/errors.log', textContent: 'first warning' },
        ],
      }),
      createBatchPackage({
        archiveBaseName: 'second_page_2026-04-23_12-00-01',
        entries: [
          { path: 'page-screenshot.png', binaryBase64: 'c2Vjb25k' },
          { path: 'logs/errors.log', textContent: 'second warning' },
        ],
      }),
    ],
    'flat'
  );

  expect(Object.keys(zip.files).sort()).toEqual([
    'first_page_2026-04-23_12-00-00_errors.log',
    'first_page_2026-04-23_12-00-00_screenshot.png',
    'second_page_2026-04-23_12-00-01_errors.log',
    'second_page_2026-04-23_12-00-01_screenshot.png',
  ]);
  await expect(
    zip.file('first_page_2026-04-23_12-00-00_errors.log')?.async('string')
  ).resolves.toBe('first warning');
  await expect(
    zip.file('second_page_2026-04-23_12-00-01_screenshot.png')?.async('base64')
  ).resolves.toBe('c2Vjb25k');
});

it('rejects unsafe batch package paths before writing ZIP entries', async () => {
  for (const path of [
    '../evil.txt',
    '/absolute.txt',
    'C:\\evil.txt',
    'files/CON',
    'files/name.',
    'files/name ',
    'files/report.txt:evil',
    'logs/../evil.txt',
  ]) {
    await expect(
      createBatchArchiveBlob(
        [
          createBatchPackage({
            archiveBaseName: 'page',
            entries: [{ path, textContent: 'evil' }],
          }),
        ],
        'grouped'
      )
    ).rejects.toThrow('Unsafe popup export package entry path');
  }
});

it('rejects unsafe batch archive base names before writing ZIP entries', async () => {
  for (const archiveBaseName of ['CON', 'name.', 'name ', 'report.txt:evil']) {
    await expect(
      createBatchArchiveBlob(
        [
          createBatchPackage({
            archiveBaseName,
            entries: [{ path: 'page.json', textContent: '{}' }],
          }),
        ],
        'grouped'
      )
    ).rejects.toThrow('Unsafe popup export package archive base name');
  }
});

it('rejects duplicate batch package paths before writing ZIP entries', async () => {
  await expect(
    createBatchArchiveBlob(
      [
        createBatchPackage({
          archiveBaseName: 'page',
          entries: [
            { path: 'page.json', textContent: '{}' },
            { path: 'page.json', textContent: '{"second":true}' },
          ],
        }),
      ],
      'grouped'
    )
  ).rejects.toThrow('Duplicate popup export package entry path');
});

it('rejects malformed and oversized base64 before writing ZIP entries', async () => {
  await expect(
    createBatchArchiveBlob(
      [
        createBatchPackage({
          archiveBaseName: 'page',
          entries: [{ path: 'files/image.png', binaryBase64: 'not valid!' }],
        }),
      ],
      'grouped'
    )
  ).rejects.toThrow('Invalid popup export package base64 entry');

  await expect(
    createBatchArchiveBlob(
      [
        createBatchPackage({
          archiveBaseName: 'page',
          entries: [{ path: 'files/huge.bin', binaryBase64: 'a'.repeat(90_000_000) }],
        }),
      ],
      'grouped'
    )
  ).rejects.toThrow('Popup export package entry exceeds');
});
