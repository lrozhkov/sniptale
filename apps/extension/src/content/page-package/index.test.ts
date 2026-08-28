import { expect, it, vi } from 'vitest';
import { createArchiveArtifact } from '../parser/export-manager/archive';
import { buildExportPagePackage } from '.';

it('requests the existing producer in Blob mode and composes its result', async () => {
  const buildBlobPackage = vi.fn().mockResolvedValue(
    createArchiveArtifact({
      archiveBaseName: 'page',
      entries: [{ path: 'page.json', textContent: '{}' }],
      errors: [],
      stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
    })
  );

  const result = await buildExportPagePackage({
    exportProducer: { buildBlobPackage },
    options: {
      includeAnnotations: false,
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: false,
      includeImages: false,
      includeJson: true,
      includeMarkdown: false,
      includePageDiagnostics: false,
    },
    source: { faviconUrl: null, title: 'Page', url: null, viewport: null },
  });

  expect(buildBlobPackage).toHaveBeenCalledOnce();
  expect(result.manifest.intent).toBe('export');
  expect(result.entries[0]?.source).toBeInstanceOf(Blob);
});
