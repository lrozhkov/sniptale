import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from '../core/test-helpers';

it('uses the current uncommitted diff by default', async () => {
  const root = createTempRoot('qa-preflight-diff-');
  initGitRepo(root);
  writeFile(root, 'package.json', '{"name":"qa-preflight-temp"}\n');
  writeFile(
    root,
    'apps/extension/src/composition/persistence/storage/session-store.ts',
    'export const value = 1;\n'
  );
  runGit(
    root,
    'add',
    'package.json',
    'apps/extension/src/composition/persistence/storage/session-store.ts'
  );
  runGit(root, 'commit', '-m', 'init');

  writeFile(
    root,
    'apps/extension/src/composition/persistence/storage/session-store.ts',
    'export const value = 2;\n'
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./preflight.mjs')>(
      './preflight.mjs',
      import.meta.url
    );
    return module.collectPreflightReport();
  });

  expect(result.context.targetFiles).toEqual([
    'apps/extension/src/composition/persistence/storage/session-store.ts',
  ]);
  expect(result.relevantDocs).toContain('docs/architecture/repository-overview.md');
  expect(result.relevantDocs).toContain('docs/security/data-handling.md');
  expect(result.proofHints).toContain(
    'package or app-core seam changed: include transitive consumer tests'
  );
});

it('accepts explicit files for pre-edit planning', async () => {
  const root = createTempRoot('qa-preflight-files-');
  writeFile(
    root,
    'apps/extension/src/content/parser/pipelines/parser.ts',
    'export const value = 1;\n'
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./preflight.mjs')>(
      './preflight.mjs',
      import.meta.url
    );
    return module.collectPreflightReport({
      files: ['apps/extension/src/content/parser/pipelines/parser.ts'],
    });
  });

  expect(result.context.targetFiles).toEqual([
    'apps/extension/src/content/parser/pipelines/parser.ts',
  ]);
  expect(result.relevantDocs).toContain('docs/architecture/parser-architecture.md');
  expect(result.proofHints).toContain(
    'parser/snapshot contract changes need transitive consumer tests'
  );
});

it('shows security-control proof guidance without migration-state routing', async () => {
  const root = createTempRoot('qa-preflight-security-control-');
  writeFile(root, 'tooling/configs/qa/security-example.json', '{}\n');

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./preflight.mjs')>(
      './preflight.mjs',
      import.meta.url
    );
    return module.collectPreflightReport({
      files: ['tooling/configs/qa/security-example.json'],
    });
  });

  expect(result.proofHints).toContain(
    'security/dependency policy changes require compact admission and guard fixtures; route review by changed seam'
  );
});

it('filters harness files out of product preflight context with guidance', async () => {
  const root = createTempRoot('qa-preflight-harness-scope-');
  writeFile(
    root,
    'apps/extension/src/content/parser/pipelines/parser.ts',
    'export const value = 1;\n'
  );
  writeFile(root, 'tooling/qa/core/example.test.ts', 'export const testValue = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./preflight.mjs')>(
      './preflight.mjs',
      import.meta.url
    );
    return module.collectPreflightReport({
      files: [
        'apps/extension/src/content/parser/pipelines/parser.ts',
        'tooling/qa/core/example.test.ts',
      ],
    });
  });

  expect(result.context.targetFiles).toEqual([
    'apps/extension/src/content/parser/pipelines/parser.ts',
  ]);
  expect(result.context.harnessTargetFiles).toEqual(['tooling/qa/core/example.test.ts']);
});

it('renders no-product-target guidance for harness-only preflight', async () => {
  const module = await import('./preflight.mjs');
  const output = module.renderPreflightReport({
    context: {
      targetFiles: [],
      harnessTargetFiles: ['tooling/qa/core/example.test.ts'],
    },
    relevantDocs: [],
    guardrailReport: {
      clusters: [],
      hints: [],
      residualSeams: [],
      deletedInternalAggregates: [],
      thinShells: [],
      ownerLocalProof: [],
      falsePublicSeams: [],
      pathAudits: [],
    },
    budgetRisks: [],
    advisoryFindings: [],
    proofHints: [],
  });

  expect(output).toContain('No product targets detected');
  expect(output).toContain('npm run qa:release-harness');
});

it('routes UI work to the root design contract', async () => {
  const root = createTempRoot('qa-preflight-design-');
  writeFile(root, 'src/popup/App.tsx', 'export function App() { return <main />; }\n');

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./preflight.mjs')>(
      './preflight.mjs',
      import.meta.url
    );
    return module.collectPreflightReport({
      files: ['apps/extension/src/popup/App.tsx'],
    });
  });

  expect(result.relevantDocs).toContain('DESIGN.md');
  expect(result.relevantDocs).not.toContain(
    ['docs/design', 'ux-ui-concept', 'design-concept.md'].join('/')
  );
});

it('renders contract checklist, consumer hints, and typecheck blast radius for boundary targets', async () => {
  const root = createTempRoot('qa-preflight-contract-checklist-');
  writeFile(
    root,
    'apps/extension/src/contracts/messaging/contracts/runtime/actions/sample.ts',
    'export interface SampleMessage { type: string; }\n'
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./preflight.mjs')>(
      './preflight.mjs',
      import.meta.url
    );
    return module.collectPreflightReport({
      files: ['apps/extension/src/contracts/messaging/contracts/runtime/actions/sample.ts'],
    });
  });
  const output = (await import('./preflight.mjs')).renderPreflightReport(result);

  expect(output).toContain('Contract checklist:');
  expect(output).toContain('owner seam / boundary');
  expect(output).toContain('Transitive consumers:');
  expect(output).toContain('messaging contracts: check runtime route maps');
  expect(output).toContain('Likely typecheck blast radius:');
  expect(output).toContain('messaging contracts can fan out');
});

it('warns when target tests are near the file-size split threshold', async () => {
  const root = createTempRoot('qa-preflight-target-test-size-');
  writeFile(
    root,
    'apps/extension/src/editor/document/file-actions/import-session.test.ts',
    `${'it.todo("x");\n'.repeat(280)}`
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./preflight.mjs')>(
      './preflight.mjs',
      import.meta.url
    );
    return module.collectPreflightReport({
      files: ['apps/extension/src/editor/document/file-actions/import-session.test.ts'],
    });
  });

  expect(result.targetTestSizeWarnings).toEqual([
    expect.stringContaining('split boundary/roundtrip/fixture cases owner-locally'),
  ]);
});

it('does not route markdown docs through code budget risk checks', async () => {
  const root = createTempRoot('qa-preflight-docs-');
  initGitRepo(root);
  writeFile(root, 'package.json', '{"name":"qa-preflight-docs-temp"}\n');
  writeFile(root, 'AGENTS.md', `${'long documentation line '.repeat(20)}\n`);
  runGit(root, 'add', 'package.json', 'AGENTS.md');
  runGit(root, 'commit', '-m', 'init');

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./preflight.mjs')>(
      './preflight.mjs',
      import.meta.url
    );
    return module.collectPreflightReport({
      files: ['AGENTS.md'],
    });
  });

  expect(result.context.codeFiles).toEqual([]);
  expect(result.budgetRisks).toEqual([]);
});
