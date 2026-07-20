import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const CONTENT_WEB_SNAPSHOT_RUNTIME_FILES = [
  new URL('./asset-fetch.ts', import.meta.url),
  new URL('./asset-targets.ts', import.meta.url),
  new URL('./injected-runner.ts', import.meta.url),
  new URL('./package.ts', import.meta.url),
  new URL('./save.ts', import.meta.url),
  new URL('./service.ts', import.meta.url),
  new URL('../../../features/web-snapshot/asset-manifest.ts', import.meta.url),
  new URL('../../../features/web-snapshot/manifest.ts', import.meta.url),
  new URL('../../../features/web-snapshot/sanitize-css.ts', import.meta.url),
  new URL('../../../features/web-snapshot/sanitize.ts', import.meta.url),
];

it('keeps content web snapshot runtime off ZIP provenance imports', () => {
  for (const fileUrl of CONTENT_WEB_SNAPSHOT_RUNTIME_FILES) {
    const source = readFileSync(fileUrl, 'utf8');

    expect(source, fileUrl.pathname).not.toMatch(
      /^import\s+(?!type\b)[\s\S]*?from\s+['"][^'"]*\/provenance['"]/mu
    );
    expect(source, fileUrl.pathname).not.toMatch(
      /^import\s+(?!type\b)[\s\S]*?from\s+['"]jszip['"]/mu
    );
    expect(source, fileUrl.pathname).not.toMatch(/^export\s+\*\s+from\s+['"]\.\/provenance['"]/mu);
  }
});
