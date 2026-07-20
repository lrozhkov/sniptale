import { describe, expect, it } from 'vitest';

import { resolvePopupBatchArchiveLayout } from './batch-layout';

const baseSelection = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: false,
  includeFullPageScreenshot: false,
  includeHarDomLogs: false,
  includeImages: false,
  includeJson: false,
  includeMarkdown: false,
};

function createSelection(
  overrides: Partial<Parameters<typeof resolvePopupBatchArchiveLayout>[0]> = {}
) {
  return {
    pageCount: 2,
    selection: baseSelection,
    ...overrides,
  };
}

function expectFlatSelection(
  selection: Partial<Parameters<typeof resolvePopupBatchArchiveLayout>[0]['selection']>
) {
  expect(
    resolvePopupBatchArchiveLayout(
      createSelection({
        selection: {
          ...baseSelection,
          ...selection,
        },
      })
    )
  ).toBe('flat');
}

function expectGroupedSelection(
  selection: Partial<Parameters<typeof resolvePopupBatchArchiveLayout>[0]['selection']>
) {
  expect(
    resolvePopupBatchArchiveLayout(
      createSelection({
        selection: {
          ...baseSelection,
          ...selection,
        },
      })
    )
  ).toBe('grouped');
}

describe('resolvePopupBatchArchiveLayout', () => {
  it('returns flat for each single eligible export option with 2+ pages', () => {
    expectFlatSelection({ includeJson: true });
    expectFlatSelection({ includeMarkdown: true });
    expectFlatSelection({ includeFullPageScreenshot: true });
  });

  it('returns flat for each paired eligible export option combination with 2+ pages', () => {
    expectFlatSelection({ includeJson: true, includeMarkdown: true });
    expectFlatSelection({ includeJson: true, includeFullPageScreenshot: true });
    expectFlatSelection({ includeMarkdown: true, includeFullPageScreenshot: true });
  });

  it('returns flat for the three-way eligible export option combination with 2+ pages', () => {
    expectFlatSelection({
      includeJson: true,
      includeMarkdown: true,
      includeFullPageScreenshot: true,
    });
  });

  it('returns grouped when fewer than 2 pages are selected', () => {
    expect(
      resolvePopupBatchArchiveLayout(
        createSelection({
          pageCount: 1,
          selection: {
            ...baseSelection,
            includeJson: true,
            includeMarkdown: true,
            includeFullPageScreenshot: true,
          },
        })
      )
    ).toBe('grouped');
  });

  it('returns grouped when any non-eligible option is enabled', () => {
    expectGroupedSelection({ includeJson: true, includeFiles: true });
    expectGroupedSelection({ includeMarkdown: true, includeImages: true });
    expectGroupedSelection({ includeFullPageScreenshot: true, includeBasicLogs: true });
    expectGroupedSelection({ includeJson: true, includeHarDomLogs: true });
    expectGroupedSelection({ includeMarkdown: true, includeCssDiagnostics: true });
  });
});
