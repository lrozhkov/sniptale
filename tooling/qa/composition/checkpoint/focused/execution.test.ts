import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from '../../../test-support/test-helpers';

it.each([false, true])(
  'preserves empty behavioral scope with unrelated harness changes: %s',
  async (importOnly) => {
    const root = createTempRoot('qa-structural-scope-');
    initGitRepo(root);
    const product = 'apps/extension/src/features/example.ts';
    const harness = 'tooling/qa/example.mjs';
    writeFile(root, product, "import { alpha } from './alpha';\nexport const value = 1;\n");
    writeFile(root, harness, 'export function other(value) { return value; }\n');
    runGit(root, 'add', '.');
    runGit(root, 'commit', '-m', 'initial');
    writeFile(root, product, "import { beta } from './beta';\nexport const value = 1;\n");
    writeFile(
      root,
      harness,
      'export function other(value) {\n' +
        Array.from({ length: 150 }, (_, index) => `if (value) { value += ${index}; }`).join('\n') +
        '\nreturn value;\n}\n'
    );
    await withCwd(root, async () => {
      const module = await importFresh<typeof import('./execution.mjs')>(
        './execution.mjs',
        import.meta.url
      );
      const { collectAdvisoryFindings } = await importFresh<
        typeof import('../../advisory/execution/collectors.mjs')
      >('../../advisory/execution/collectors.mjs', import.meta.url);
      const codeFiles = importOnly ? [product] : [];
      const step = module.runStructuralRiskStep(codeFiles, { allowances: [] });
      expect(step.status).toBe('skipped');
      expect(step.structuralReport).toEqual({ violations: [], advisories: [] });
      expect(
        collectAdvisoryFindings({
          codeFiles,
          targetFiles: codeFiles,
          structuralReport: step.structuralReport,
        })
      ).toEqual(collectAdvisoryFindings({ codeFiles, targetFiles: codeFiles }));
    });
  }
);
