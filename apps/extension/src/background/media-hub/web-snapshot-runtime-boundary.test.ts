import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const SERVICE_WORKER_WEB_SNAPSHOT_ZIP_FILES = [
  new URL('./web-snapshot-validation.ts', import.meta.url),
  new URL('../../features/web-snapshot/provenance.ts', import.meta.url),
];

it('keeps service-worker web snapshot ZIP imports off the Vite preload helper path', () => {
  for (const fileUrl of SERVICE_WORKER_WEB_SNAPSHOT_ZIP_FILES) {
    const source = readFileSync(fileUrl, 'utf8');

    expect(source, fileUrl.pathname).not.toMatch(/import\s*\(\s*['"]jszip['"]\s*\)/u);
  }
});
