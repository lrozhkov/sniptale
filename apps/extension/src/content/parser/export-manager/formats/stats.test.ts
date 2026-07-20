import { expect, it } from 'vitest';

import { createExportStats } from './stats';

it('builds export stats for populated and empty payloads', () => {
  expect(
    createExportStats(
      {
        meta: {
          url: 'https://example.test',
          title: 'Export',
          date: '2026-03-22',
          userAgent: 'VitestAgent/1.0',
        },
        sections: [
          {
            title: 'Section',
            tables: [
              {
                title: 'Files',
                headers: ['Name'],
                rows: [
                  { data: { Name: 'A' }, attachments: [] },
                  { data: { Name: 'B' }, attachments: [] },
                ],
              },
            ],
          },
        ],
      },
      5,
      1
    )
  ).toEqual({
    sectionsCount: 1,
    rowsCount: 2,
    filesCount: 5,
    filesFailed: 1,
  });

  expect(createExportStats(null, 0, 0)).toEqual({
    sectionsCount: 0,
    rowsCount: 0,
    filesCount: 0,
    filesFailed: 0,
  });
});
