import { describe, expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd } from './test-helpers';

it('routes harness-owned policy and shared guidance without blind spots', async () => {
  const root = createTempRoot('qa-scope-guidance-');

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./qa-scope.mjs')>('./qa-scope.mjs');
    expect(
      module.partitionQaScopeFiles([
        'AGENTS.md',
        '.agents/skills/security-code-review/SKILL.md',
        'tooling/configs/qa/guardrail-policy.data.json',
        'src/example.ts',
      ])
    ).toEqual({
      productFiles: ['AGENTS.md', '.agents/skills/security-code-review/SKILL.md', 'src/example.ts'],
      harnessFiles: [
        'AGENTS.md',
        '.agents/skills/security-code-review/SKILL.md',
        'tooling/configs/qa/guardrail-policy.data.json',
      ],
    });
  });
});

it('separates generated inventories from executable harness changes', async () => {
  const root = createTempRoot('qa-scope-inventory-only-');

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./qa-scope.mjs')>('./qa-scope.mjs');

    expect(module.isHarnessQaFile('tooling/configs/qa/technical-debt.data.json')).toBe(true);
    expect(module.isHarnessInventoryOnlyFile('tooling/configs/qa/technical-debt.data.json')).toBe(
      true
    );
    expect(module.isHarnessVerificationQaFile('tooling/configs/qa/technical-debt.data.json')).toBe(
      false
    );
    expect(
      module.isHarnessVerificationQaFile(
        'tooling/qa/core/verify-test-coverage.rollout-files.data.mjs'
      )
    ).toBe(false);
    expect(
      module.isHarnessVerificationQaFile('tooling/qa/core/verify-test-coverage.registry.mjs')
    ).toBe(true);
    expect(module.isHarnessVerificationQaFile('tooling/configs/qa/quality-baseline.json')).toBe(
      true
    );
    expect(module.isHarnessVerificationQaFile('tooling/qa/core/qa-scope.mjs')).toBe(true);
  });
});

describe('shared QA controls', () => {
  it('classifies executable configuration, hooks, and active tooling guidance in both suites', async () => {
    const root = createTempRoot('qa-scope-shared-controls-');

    await withCwd(root, async () => {
      const module = await importFresh<typeof import('./qa-scope.mjs')>('./qa-scope.mjs');
      const controls = [
        'package.json',
        'package-lock.json',
        'eslint.config.js',
        'tsconfig.json',
        'apps/extension/tsconfig.runtime.json',
        'vitest.config.ts',
        'apps/extension/vite.config.ts',
        '.dependency-cruiser.cjs',
        '.prettierignore',
        '.prettierrc.json',
        '.github/workflows/quality-gate.yml',
        '.husky/pre-push',
        'docs/tooling/code-quality.md',
      ];

      expect(module.partitionQaScopeFiles(controls)).toEqual({
        productFiles: controls,
        harnessFiles: controls,
      });
    });
  });

  it('keeps implementation and harness-owner files exclusive where no shared control exists', async () => {
    const root = createTempRoot('qa-scope-exclusive-owners-');

    await withCwd(root, async () => {
      const module = await importFresh<typeof import('./qa-scope.mjs')>('./qa-scope.mjs');

      expect(
        module.partitionQaScopeFiles([
          'apps/extension/src/background/index.ts',
          'tooling/qa/core/verify-focused.mjs',
        ])
      ).toEqual({
        productFiles: ['apps/extension/src/background/index.ts'],
        harnessFiles: ['tooling/qa/core/verify-focused.mjs'],
      });
    });
  });
});
