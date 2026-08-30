import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { verifySnapshotDiagnostics } from './diagnostics-verification.mjs';

async function createArchive(overrides = {}) {
  const files = {
    'diagnostics/extended/assets.json': JSON.stringify({ entries: [], omitted: 0, total: 0 }),
    'diagnostics/extended/frames.json': JSON.stringify({ frames: [], openShadowRoots: [] }),
    'diagnostics/extended/page/live-dom.html.txt': '<main>live</main>',
    'diagnostics/extended/page/prepared-dom.html.txt': '<main>prepared</main>',
    'diagnostics/extended/page/published-dom.html.txt': '<main>published</main>',
    'diagnostics/index.json': JSON.stringify({
      authority: { archiveInventory: 'manifest.json' },
      representations: [
        { available: true, path: 'diagnostics/extended/page/live-dom.html.txt', stage: 'live' },
        {
          available: true,
          path: 'diagnostics/extended/page/prepared-dom.html.txt',
          stage: 'prepared',
        },
        {
          available: true,
          path: 'diagnostics/extended/page/published-dom.html.txt',
          stage: 'published',
        },
      ],
      safety: { diagnosticsAreInert: true },
      schemaVersion: 1,
      sections: [],
    }),
    'diagnostics/export/logs/capture-timeline.json': JSON.stringify({
      events: [{ elapsedMs: 0, phase: 'scanning', step: 'exportRun' }],
    }),
    'diagnostics/export/logs/issues.json': JSON.stringify({ issues: [] }),
    'diagnostics/export/logs/css/computed-styles.json': JSON.stringify({
      totalTargets: 1,
      targets: [{}],
    }),
    'diagnostics/export/logs/css/fonts.json': JSON.stringify({
      declaredFaces: [],
      loadedFonts: [],
      usage: [{}],
    }),
    'diagnostics/runtime/application-map.json': JSON.stringify({
      controls: [],
      customElements: [],
      opaqueSurfaces: [],
    }),
    'diagnostics/runtime/page-state.json': JSON.stringify({
      counts: {},
      document: {},
      fonts: {},
      geometry: {},
    }),
    'diagnostics/runtime/resource-timing.json': JSON.stringify({
      entries: [],
      omitted: 0,
      total: 0,
    }),
    'snapshot/index.html': '<main>published</main>',
    ...overrides,
  };
  const entries = Object.entries(files).map(([path, content]) => ({
    component: path.startsWith('snapshot/') ? 'webCopy' : 'diagnostics',
    mimeType: path.endsWith('.json')
      ? 'application/json'
      : path.endsWith('.html')
        ? 'text/html'
        : 'text/plain',
    path,
    sha256: createHash('sha256').update(content).digest('hex'),
    size: Buffer.byteLength(content),
  }));
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  zip.file('manifest.json', JSON.stringify({ entries }));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Web Snapshot smoke diagnostic verification', () => {
  it('accepts a coherent inert diagnostic package', async () => {
    await expect(verifySnapshotDiagnostics(await createArchive())).resolves.toMatchObject({
      status: 'passed',
      violations: [],
    });
  });

  it('reports published DOM drift without weakening visual comparison', async () => {
    const result = await verifySnapshotDiagnostics(
      await createArchive({
        'diagnostics/extended/page/published-dom.html.txt': '<main>drift</main>',
      })
    );
    expect(result.status).toBe('failed');
    expect(result.violations).toContain('published-dom-parity');
  });
});
