import { describe, expect, it } from 'vitest';
import { composePagePackage, type ComposedPagePackage } from '../composer';
import type { PagePackageContribution } from '../paths';
import {
  PAGE_COLLECTION_README,
  planPageCollection,
  type PageCollectionPagePackagePlan,
} from './manifest';

async function createPagePackage(id: string): Promise<ComposedPagePackage<string>> {
  const entries: PagePackageContribution<string>[] = [
    {
      component: 'pageData',
      mimeType: 'application/json',
      path: 'exports/data/data.json',
      sha256: 'a'.repeat(64),
      size: 4,
      source: 'data',
    },
  ];
  return composePagePackage(
    {
      capturedAt: '2026-08-27T10:00:00.000Z',
      componentStatuses: { pageData: 'complete' },
      contributions: entries,
      diagnosticsLevel: 'none',
      failedResourceCount: 0,
      id,
      intent: 'export',
      source: {
        url: 'https://example.test',
        title: 'Example',
        faviconUrl: null,
      },
      viewport: null,
      warnings: [],
    },
    async () => 'b'.repeat(64)
  );
}

function toPlan(pagePackage: ComposedPagePackage<unknown>): PageCollectionPagePackagePlan {
  return {
    entries: pagePackage.manifest.entries.map((entry) => ({ ...entry })),
    manifestSha256: pagePackage.manifestSha256,
    manifestSize: pagePackage.manifestBytes.byteLength,
    pageId: pagePackage.manifest.id,
    title: pagePackage.manifest.source.title,
    totalBytes: pagePackage.manifestBytes.byteLength + pagePackage.manifest.stats.totalBytes,
  };
}

describe('Page Collection planner', () => {
  it('fixes root allocation, exact bytes, archive order and failed-page reporting', async () => {
    const pagePackage = await createPagePackage('page-1');
    const failedPageWithExtraField = {
      ordinal: 2,
      title: 'Failed',
      url: 'https://failed.test',
      code: 'page-capture-failed' as const,
      message: 'Capture failed',
      stack: 'must-not-leak',
    };
    const result = planPageCollection({
      createdAt: '2026-08-27T10:00:00.000Z',
      failedPages: [failedPageWithExtraField],
      id: 'collection-1',
      successfulPages: [{ ordinal: 1, pagePackage: toPlan(pagePackage), title: 'CON' }],
      warnings: [],
    });
    expect(result.pages[0]?.rootPath).toBe('pages/001-_CON');
    expect(result.manifest.pages[0]?.manifestSha256).toBe(pagePackage.manifestSha256);
    expect(result.manifest.pages[0]?.totalBytes).toBe(
      pagePackage.manifestBytes.byteLength + pagePackage.manifest.stats.totalBytes
    );
    expect(result.manifest.stats).toMatchObject({
      requestedPageCount: 2,
      pageCount: 1,
      failedPageCount: 1,
    });
    expect(result.archiveOrder).toEqual([
      'collection-manifest.json',
      'README.md',
      'pages/001-_CON/manifest.json',
      'pages/001-_CON/exports/data/data.json',
      'reports/summary.json',
      'reports/errors.json',
    ]);
    expect(new TextDecoder().decode(result.manifestBytes)).toBe(result.manifestText);
    expect(JSON.parse(result.errorsText).failures).toEqual([
      {
        ordinal: 2,
        title: 'Failed',
        url: 'https://failed.test',
        code: 'page-capture-failed',
        message: 'Capture failed',
      },
    ]);
    expect(result.errorsText).not.toContain('must-not-leak');
    expect(result.readmeBytes.byteLength).toBe(699);
    expect(new TextDecoder().decode(result.readmeBytes)).toBe(PAGE_COLLECTION_README);
  });

  it('preserves ordinal order for duplicate and long titles without suffix aliases', async () => {
    const pagePackage = await createPagePackage('page');
    const result = planPageCollection({
      createdAt: '2026-08-27T10:00:00.000Z',
      failedPages: [],
      id: 'collection-1',
      successfulPages: [
        { ordinal: 2, pagePackage: toPlan(pagePackage), title: 'A'.repeat(200) },
        { ordinal: 1, pagePackage: toPlan(pagePackage), title: 'A'.repeat(200) },
      ],
      warnings: [],
    });
    expect(result.manifest.pages.map((page) => page.ordinal)).toEqual([1, 2]);
    expect(result.manifest.pages[0]?.rootPath).not.toBe(result.manifest.pages[1]?.rootPath);
    expect(result.manifest.pages.some((page) => page.rootPath.includes(' (2)'))).toBe(false);
  });

  it('accepts 999 requested pages and rejects gaps or 1,000 pages before planning', () => {
    const failure = (ordinal: number) => ({
      ordinal,
      title: null,
      url: null,
      code: 'page-capture-failed' as const,
      message: 'failed',
    });
    expect(() =>
      planPageCollection({
        createdAt: '2026-08-27T10:00:00.000Z',
        failedPages: Array.from({ length: 999 }, (_, index) => failure(index + 1)),
        id: 'collection-999',
        successfulPages: [],
        warnings: [],
      })
    ).not.toThrow();
    expect(() =>
      planPageCollection({
        createdAt: '2026-08-27T10:00:00.000Z',
        failedPages: [failure(2)],
        id: 'collection-gap',
        successfulPages: [],
        warnings: [],
      })
    ).toThrow('complete ordered sequence');
    expect(() =>
      planPageCollection({
        createdAt: '2026-08-27T10:00:00.000Z',
        failedPages: Array.from({ length: 1_000 }, (_, index) => failure(index + 1)),
        id: 'collection-1000',
        successfulPages: [],
        warnings: [],
      })
    ).toThrow();
  });
});
