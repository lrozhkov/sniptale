import { describe, expect, it, vi } from 'vitest';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import { openArchiveReader } from '../../../composition/archive-transfer/reader';
import { createArchiveWriter } from '../../../composition/archive-transfer/writer';
import { composePagePackage, type ComposedPagePackage } from '../composer';
import { writePageCollectionArchive } from './archive';
import { planPageCollection, type PageCollectionPagePackagePlan } from './manifest';

async function createPagePackage(id: string, value: string): Promise<ComposedPagePackage<Blob>> {
  const source = new Blob([value], { type: 'application/json' });
  return composePagePackage(
    {
      capturedAt: '2026-08-27T10:00:00.000Z',
      componentStatuses: { pageData: 'complete' },
      contributions: [
        {
          component: 'pageData',
          mimeType: 'application/json',
          path: 'exports/data/data.json',
          sha256: 'a'.repeat(64),
          size: source.size,
          source,
        },
      ],
      diagnosticsLevel: 'none',
      failedResourceCount: 0,
      id,
      intent: 'export',
      source: { faviconUrl: null, title: id, url: `https://${id}.test/` },
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

async function createPlan() {
  const first = await createPagePackage('first', '{"first":true}');
  const third = await createPagePackage('third', '{"third":true}');
  const packages = new Map<number, ComposedPagePackage<Blob>>([
    [1, first],
    [3, third],
  ]);
  const plan = planPageCollection({
    createdAt: '2026-08-27T10:00:00.000Z',
    failedPages: [
      {
        code: 'page-capture-failed' as const,
        message: 'Unavailable',
        ordinal: 2,
        title: 'Unavailable',
        url: 'https://unavailable.test/',
      },
    ],
    id: 'collection-1',
    successfulPages: [
      {
        ordinal: 1,
        pagePackage: toPlan(first),
        title: 'First',
      },
      {
        ordinal: 3,
        pagePackage: toPlan(third),
        title: 'Third',
      },
    ],
    warnings: [],
  });
  const resolvePagePackage = async (page: (typeof plan.pages)[number]) => ({
    pagePackage: packages.get(page.ordinal)!,
    release: async () => undefined,
  });
  return { packages, plan, resolvePagePackage };
}

describe('Page Collection archive writer', () => {
  it('streams the exact flat plan order and reports logical progress', async () => {
    const { packages, plan, resolvePagePackage } = await createPlan();
    const output = createArchiveMemorySink();
    const onProgress = vi.fn();

    await writePageCollectionArchive({ onProgress, plan, resolvePagePackage, sink: output.sink });

    const reader = await openArchiveReader(output.blob());
    expect(reader.entries().map((entry) => entry.path)).toEqual(plan.archiveOrder);
    await expect(reader.entry('pages/001-First/exports/data/data.json')?.text()).resolves.toBe(
      '{"first":true}'
    );
    await expect(reader.entry('pages/003-Third/manifest.json')?.text()).resolves.toBe(
      packages.get(3)?.manifestText
    );
    await expect(reader.entry('reports/errors.json')?.text()).resolves.toBe(plan.errorsText);
    expect(onProgress).toHaveBeenCalledTimes(plan.archiveOrder.length);
    expect(onProgress).toHaveBeenLastCalledWith({
      bytesComplete:
        plan.manifestBytes.byteLength +
        plan.readmeBytes.byteLength +
        plan.summaryBytes.byteLength +
        plan.errorsBytes.byteLength +
        plan.pages.reduce(
          (total, page) =>
            total +
            page.pagePackage.manifestSize +
            page.pagePackage.entries.reduce((pageTotal, entry) => pageTotal + entry.size, 0),
          0
        ),
      entriesComplete: plan.archiveOrder.length,
      entriesTotal: plan.archiveOrder.length,
      path: 'reports/errors.json',
    });
    await reader.close();
  });

  it('flattens an archive entry source without nesting its source archive', async () => {
    const { packages, plan, resolvePagePackage } = await createPlan();
    const firstPage = plan.pages[0]!;
    const firstPackage = packages.get(1)!;
    const firstEntry = firstPackage.entries[0]!;
    const stagedOutput = createArchiveMemorySink();
    const stagedWriter = createArchiveWriter(stagedOutput.sink);
    await stagedWriter.addBlob(firstEntry.path, firstEntry.source);
    await stagedWriter.close();
    const stagedReader = await openArchiveReader(stagedOutput.blob());
    const stagedSource = stagedReader.entry(firstEntry.path);
    expect(stagedSource).not.toBeNull();
    const resolveStreamedPage = async (page: (typeof plan.pages)[number]) => {
      if (page.ordinal !== 1) return resolvePagePackage(page);
      return {
        pagePackage: {
          ...firstPackage,
          entries: [{ ...firstEntry, source: stagedSource! }],
        },
        release: async () => undefined,
      };
    };
    const output = createArchiveMemorySink();

    await writePageCollectionArchive({
      plan,
      resolvePagePackage: resolveStreamedPage,
      sink: output.sink,
    });

    const reader = await openArchiveReader(output.blob());
    expect(reader.entries().map((entry) => entry.path)).toEqual(plan.archiveOrder);
    expect(reader.entry(firstEntry.path)).toBeNull();
    await expect(reader.entry(`${firstPage.rootPath}/${firstEntry.path}`)?.text()).resolves.toBe(
      '{"first":true}'
    );
    await reader.close();
    await stagedReader.close();
  });

  it('aborts partial output when a source no longer matches its manifest', async () => {
    const { packages, plan, resolvePagePackage } = await createPlan();
    const firstPage = plan.pages[0]!;
    const firstPackage = packages.get(1)!;
    const resolveInvalidPage = async (page: (typeof plan.pages)[number]) => {
      if (page.ordinal !== firstPage.ordinal) return resolvePagePackage(page);
      return {
        pagePackage: {
          ...firstPackage,
          entries: [{ ...firstPackage.entries[0]!, source: new Blob([]) }],
        },
        release: async () => undefined,
      };
    };
    const output = createArchiveMemorySink();

    await expect(
      writePageCollectionArchive({
        plan,
        resolvePagePackage: resolveInvalidPage,
        sink: output.sink,
      })
    ).rejects.toThrow('source does not match');
    expect(output.aborted).toBe(true);
  });

  it('rejects a diverged plan and pre-aborted capture before emitting an archive', async () => {
    const { plan, resolvePagePackage } = await createPlan();
    const divergedOutput = createArchiveMemorySink();
    await expect(
      writePageCollectionArchive({
        plan: { ...plan, archiveOrder: [...plan.archiveOrder].reverse() },
        resolvePagePackage,
        sink: divergedOutput.sink,
      })
    ).rejects.toThrow('diverged');
    expect(divergedOutput.aborted).toBe(true);

    const controller = new AbortController();
    controller.abort(new DOMException('Stopped', 'AbortError'));
    const cancelledOutput = createArchiveMemorySink();
    await expect(
      writePageCollectionArchive({
        plan,
        resolvePagePackage,
        signal: controller.signal,
        sink: cancelledOutput.sink,
      })
    ).rejects.toThrow('Stopped');
    expect(cancelledOutput.aborted).toBe(true);
  });
});
