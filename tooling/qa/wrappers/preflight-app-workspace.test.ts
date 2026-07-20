import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd, writeFile } from '../core/test-helpers';

it('routes app-workspace UI work through the same architecture and design guidance', async () => {
  const root = createTempRoot('qa-preflight-app-workspace-');
  writeFile(
    root,
    'apps/extension/src/camera-recorder/index.tsx',
    'export function App() { return <main />; }\n'
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./preflight.mjs')>(
      './preflight.mjs',
      import.meta.url
    );
    return module.collectPreflightReport({
      files: ['apps/extension/src/camera-recorder/index.tsx'],
    });
  });

  expect(result.relevantDocs).toContain('docs/architecture/code-organization.md');
  expect(result.relevantDocs).toContain('docs/architecture/runtime-contexts.md');
  expect(result.relevantDocs).toContain('DESIGN.md');
});
