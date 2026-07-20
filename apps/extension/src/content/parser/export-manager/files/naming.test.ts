// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { getMoscowFilenameTimestamp } from '@sniptale/foundation/utils/export-timestamp';
import {
  buildExportArchiveBaseName,
  createEmptyExportPagePackage,
  getMoscowTimestamp,
  sanitizeFilename,
} from './naming';

function withMockedDate(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

function createTreeWithCanonicalMeta(): ParsedDOMTree {
  return {
    context: 'Portal',
    title: 'Project 7',
    structure: [],
    meta: {
      profile: {
        vendor: 'generic',
        appFamily: 'generic-web',
        pageKind: 'content',
        pipelineId: 'generic-structured',
        confidence: 0.8,
        matchedSignals: [],
        preferredRoots: ['body'],
      },
      title: 'Canonical Export Title',
      url: 'https://example.test/canonical-export',
      warnings: [],
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

it('formats timestamps in Moscow time and sanitizes filenames', () => {
  withMockedDate('2026-03-22T10:11:12.000Z');

  expect(getMoscowTimestamp()).toBe('2026-03-22_13-11-12');
  expect(getMoscowTimestamp()).toBe(getMoscowFilenameTimestamp());
  expect(sanitizeFilename('  bad:/name*with   spaces?.zip  ')).toBe('badnamewith_spaces.zip');
  expect(sanitizeFilename('x'.repeat(80), 10)).toBe('xxxxxxxxxx');
});

it('builds export archive names and empty page packages from canonical metadata', () => {
  const tree = createTreeWithCanonicalMeta();

  expect(
    buildExportArchiveBaseName(
      tree,
      {
        meta: {
          url: 'https://example.test/canonical-export',
          title: 'Canonical Export Title',
          date: '2026-03-22_13-11-12',
          userAgent: 'VitestAgent/1.0',
        },
        sections: [],
      },
      '2026-03-22_13-11-12'
    )
  ).toBe('Canonical_Export_Title_2026-03-22_13-11-12');

  expect(createEmptyExportPagePackage('canonical-export')).toEqual({
    archiveBaseName: 'canonical-export',
    entries: [],
  });
});
