import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from './test-helpers';

it('parses jscpd report output', async () => {
  const module = await import('../audits/jscpd.mjs');
  const root = createTempRoot('verify-jscpd-');
  const reportPath = path.join(root, 'jscpd-report.json');

  const result = module.runJscpdCheck({
    baselinePath: null,
    executable: 'jscpd',
    reportPath,
    runCommandImpl: () => {
      fs.writeFileSync(
        reportPath,
        JSON.stringify({
          duplicates: [
            {
              lines: 8,
              firstFile: { name: 'apps/extension/src/editor/controller/a.ts', start: 10 },
              secondFile: { name: 'apps/extension/src/editor/controller/b.ts' },
            },
          ],
        })
      );
      return {
        status: 1,
        stdout: '',
        stderr: '',
      };
    },
  });

  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'jscpd-duplicate',
      file: 'apps/extension/src/editor/controller/a.ts',
      line: 10,
    }),
  ]);
  expect(result.familySummary).toEqual([
    expect.objectContaining({
      family: 'apps/extension/src/editor/controller',
      count: 1,
      lines: 8,
      samplePairs: [
        'apps/extension/src/editor/controller/a.ts <-> apps/extension/src/editor/controller/b.ts',
      ],
    }),
  ]);
  expect(result.summaryText).toContain('Family summary:');
});

it('fails when jscpd does not write a fresh report', async () => {
  const module = await import('../audits/jscpd.mjs');
  const root = createTempRoot('verify-jscpd-missing-report-');
  const reportPath = path.join(root, 'jscpd-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ duplicates: [] }));

  expect(() =>
    module.runJscpdCheck({
      baselinePath: null,
      executable: 'jscpd',
      reportPath,
      runCommandImpl: () => ({
        status: 0,
        stdout: '',
        stderr: '',
      }),
    })
  ).toThrow(`jscpd report ${reportPath} is required and must contain JSON`);
});

function createFamilySummaryDuplicates() {
  return [
    {
      lines: 10,
      firstFile: {
        name: 'apps/extension/src/offscreen/project-export/media-playback/index.test.ts',
      },
      secondFile: {
        name: 'apps/extension/src/offscreen/project-export/media-playback/playback.test.ts',
      },
    },
    {
      lines: 6,
      firstFile: {
        name: 'apps/extension/src/offscreen/project-export/render-loop/index.test.ts',
      },
      secondFile: {
        name: 'apps/extension/src/offscreen/project-export/render-loop/frame.test.ts',
      },
    },
    {
      lines: 5,
      firstFile: { name: 'apps/extension/src/editor/inspector/types.ts' },
      secondFile: { name: 'apps/extension/src/editor/inspector/content/types.ts' },
    },
  ];
}

it('summarizes jscpd duplicates by family with sample pairs', async () => {
  const module = await import('../audits/jscpd.mjs');
  const mediaPlaybackPair =
    'apps/extension/src/offscreen/project-export/media-playback/index.test.ts <-> ' +
    'apps/extension/src/offscreen/project-export/media-playback/playback.test.ts';
  const renderLoopPair =
    'apps/extension/src/offscreen/project-export/render-loop/index.test.ts <-> ' +
    'apps/extension/src/offscreen/project-export/render-loop/frame.test.ts';
  const inspectorPair =
    'apps/extension/src/editor/inspector/types.ts <-> ' +
    'apps/extension/src/editor/inspector/content/types.ts';

  expect(module.summarizeJscpdFamilies(createFamilySummaryDuplicates())).toEqual([
    expect.objectContaining({
      family: 'apps/extension/src/offscreen/project-export',
      count: 2,
      lines: 16,
      samplePairs: [mediaPlaybackPair, renderLoopPair],
    }),
    expect.objectContaining({
      family: 'apps/extension/src/editor/inspector',
      count: 1,
      lines: 5,
      samplePairs: [inspectorPair],
    }),
  ]);
});
