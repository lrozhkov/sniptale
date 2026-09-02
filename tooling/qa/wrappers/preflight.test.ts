import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from '../test-support/test-helpers';

const GIT_INTEGRATION_TIMEOUT = 15_000;

it(
  'uses the current uncommitted diff by default',
  async () => {
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
  },
  GIT_INTEGRATION_TIMEOUT
);

it(
  'does not claim that a deleted test will be executed by focused proof',
  async () => {
    const root = createTempRoot('qa-preflight-deleted-test-');
    const testFile = 'apps/extension/src/content/overlay/example/controller.test.ts';
    initGitRepo(root);
    writeFile(root, 'package.json', '{"name":"qa-preflight-temp"}\n');
    writeFile(root, testFile, "it('covers the old owner', () => {});\n");
    runGit(root, 'add', '.');
    runGit(root, 'commit', '-m', 'init');
    runGit(root, 'rm', testFile);

    const output = await withCwd(root, async () => {
      const module = await importFresh<typeof import('./preflight.mjs')>(
        './preflight.mjs',
        import.meta.url
      );
      return module.renderPreflightReport(module.collectPreflightReport());
    });

    expect(output).not.toContain('changed tests will be included by the focused wrapper');
  },
  GIT_INTEGRATION_TIMEOUT
);

it(
  'reports canonical owners for behavioral deleted paths',
  async () => {
    const root = createTempRoot('qa-preflight-deleted-owners-');
    const runtimeFile = 'apps/extension/src/content/runtime/shim/transport.ts';
    const selectionFile = 'apps/extension/src/content/selection/selection-mode/runtime/index.ts';
    const typeOnlyFile = 'apps/extension/src/settings/session/deleted-types.ts';
    initGitRepo(root);
    writeFile(root, 'package.json', '{"name":"qa-preflight-temp"}\n');
    writeFile(root, runtimeFile, 'export const runtimeTransport = true;\n');
    writeFile(root, selectionFile, 'export const selectionRuntime = true;\n');
    writeFile(root, typeOnlyFile, 'export type DeletedSettingsState = { enabled: boolean };\n');
    runGit(root, 'add', '.');
    runGit(root, 'commit', '-m', 'init');
    runGit(root, 'rm', runtimeFile, selectionFile, typeOnlyFile);

    const result = await withCwd(root, async () => {
      const module = await importFresh<typeof import('./preflight.mjs')>(
        './preflight.mjs',
        import.meta.url
      );
      return module.collectPreflightReport();
    });

    expect(result.context.codeFiles).toEqual([]);
    expect(result.ownerRuntime).toEqual([
      'extension:content:runtime',
      'extension:content:selection',
    ]);
  },
  GIT_INTEGRATION_TIMEOUT
);

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

it('keeps the terminal summary bounded while preserving complete risk context in the step log', async () => {
  const root = createTempRoot('qa-preflight-risk-output-');
  writeFile(root, 'apps/extension/manifest.json', '{"manifest_version":3}\n');

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./preflight.mjs')>(
      './preflight.mjs',
      import.meta.url
    );
    return module.runPreflightWrapper({ files: ['apps/extension/manifest.json'] });
  });
  const step = result.steps[0];

  expect(step?.consoleOutput).toContain('Likely risk areas:');
  expect(step?.consoleOutput).toContain('1 product target(s), 0 harness target(s)');
  expect(step?.consoleOutput).toContain('docs/security/manifest-permissions.md');
  expect(step?.consoleOutput).not.toContain('Contracts and consumers:');
  expect(step?.stdout).toContain('Contracts and consumers:');
  expect(step?.stdout).toContain('manifest.permissions');
});

it('does not route a local state snapshot helper to parser architecture', async () => {
  const module = await import('./preflight.mjs');
  expect(
    module.collectRelevantDocs([
      'apps/extension/src/content/selection/selection-mode/session/locals/snapshots.ts',
    ])
  ).not.toContain('docs/architecture/parser-architecture.md');
});

it(
  'does not request UI proof for a current-diff type-only rename',
  async () => {
    const root = createTempRoot('qa-preflight-type-only-ui-');
    const file = 'apps/extension/src/content/selection/selection-mode/ui/size-panel/runtime.ts';
    initGitRepo(root);
    writeFile(root, 'package.json', '{"name":"qa-preflight-temp"}\n');
    writeFile(
      root,
      file,
      "import type { OldSession } from '../../session/state';\nexport type Value = OldSession['dom'];\n"
    );
    runGit(root, 'add', 'package.json', file);
    runGit(root, 'commit', '-m', 'init');
    writeFile(
      root,
      file,
      "import type { SelectionModeSession } from '../../session';\nexport type Value = SelectionModeSession['dom'];\n"
    );

    const result = await withCwd(root, async () => {
      const module = await importFresh<typeof import('./preflight.mjs')>(
        './preflight.mjs',
        import.meta.url
      );
      return module.collectPreflightReport();
    });

    expect(result.context.qualityCodeFiles).toEqual([]);
    expect(result.context.targetFiles).toEqual([]);
    expect(result.proofHints).not.toContain(
      'UI seams need ownership proof for visibility, i18n, focus, and restore behavior'
    );
    expect(result.guardrailReport.hints.join('\n')).not.toMatch(/UI|state owner/iu);
    expect(result.advisoryFindings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'advisory.ui-proof-gap' })])
    );
  },
  GIT_INTEGRATION_TIMEOUT
);

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

it(
  'does not request security proof for a current-diff import-only control change',
  async () => {
    const root = createTempRoot('qa-preflight-import-only-security-');
    const file = 'tooling/qa/security-policy.mjs';
    initGitRepo(root);
    writeFile(root, 'package.json', '{"name":"qa-preflight-temp"}\n');
    writeFile(root, file, "export { value } from './old-owner.mjs';\n");
    runGit(root, 'add', 'package.json', file);
    runGit(root, 'commit', '-m', 'init');
    writeFile(root, file, "export { value } from './new-owner.mjs';\n");

    const result = await withCwd(root, async () => {
      const module = await importFresh<typeof import('./preflight.mjs')>(
        './preflight.mjs',
        import.meta.url
      );
      return module.collectPreflightReport();
    });

    expect(result.context.allQualityTargetFiles).toEqual([]);
    expect(result.proofHints).not.toContain(
      'security/dependency policy changes require compact admission and guard fixtures; route review by changed seam'
    );
  },
  GIT_INTEGRATION_TIMEOUT
);

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
      deletedInternalAggregates: [],
      thinShells: [],
      ownerLocalProof: [],
      falsePublicSeams: [],
      pathAudits: [],
    },
    ownerRuntime: [],
    structuralPressure: [],
    contractChecklist: [],
    transitiveConsumerHints: [],
    typecheckBlastRadius: [],
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

  expect(result.relevantDocs).toContain('docs/agent-tooling/DESIGN.md');
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

  expect(output).toContain('Contracts and consumers:');
  expect(output).toContain('owner seam / boundary');
  expect(output).toContain('messaging contracts: check runtime route maps');
  expect(output).toContain('messaging contracts can fan out');
});

it('uses the test structural profile instead of file-size warnings', async () => {
  const root = createTempRoot('qa-preflight-target-test-size-');
  writeFile(
    root,
    'apps/extension/src/editor/document/file-actions/import-session.test.ts',
    `it('covers a cohesive fixture', () => {\n${'expect(true).toBe(true);\n'.repeat(135)}});\n`
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

  expect(result.structuralReport.functions[0]).toEqual(
    expect.objectContaining({ profile: 'test' })
  );
  expect(result).not.toHaveProperty('targetTestSizeWarnings');
});

it('renders a structural finding as advisory without duplicating it as pressure', async () => {
  const root = createTempRoot('qa-preflight-structural-dedup-');
  const file = 'apps/extension/src/content/selection/selection-mode/controller/deep.ts';
  writeFile(
    root,
    file,
    `export function handle(a, b, c, d, e, f, g) {
      if (a) { if (b) { if (c) { if (d) { if (e) { return f ?? g; } } } } }
      return null;
    }\n`
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./preflight.mjs')>(
      './preflight.mjs',
      import.meta.url
    );
    return module.collectPreflightReport({ files: [file] });
  });

  expect(result.advisoryFindings).toEqual(
    expect.arrayContaining([expect.objectContaining({ file, id: 'advisory.structural-function' })])
  );
  expect(result.structuralPressure).toEqual([]);
});

it('does not route markdown docs through structural analysis', async () => {
  const root = createTempRoot('qa-preflight-docs-');
  initGitRepo(root);
  writeFile(root, 'package.json', '{"name":"qa-preflight-docs-temp"}\n');
  writeFile(root, 'docs/agent-tooling/AGENTS.md', `${'long documentation line '.repeat(20)}\n`);
  runGit(root, 'add', 'package.json', 'docs/agent-tooling/AGENTS.md');
  runGit(root, 'commit', '-m', 'init');

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./preflight.mjs')>(
      './preflight.mjs',
      import.meta.url
    );
    return module.collectPreflightReport({
      files: ['docs/agent-tooling/AGENTS.md'],
    });
  });

  expect(result.context.codeFiles).toEqual([]);
  expect(result.structuralPressure).toEqual([]);
  expect(result.structuralReport.files).toEqual([]);
});
