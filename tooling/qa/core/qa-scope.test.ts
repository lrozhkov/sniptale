import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd } from './test-helpers';
import { collectFocusedCoverageOwnerMapInventoryViolations } from './focused-coverage-owner-map.mjs';

it('routes harness-owned policy and shared guidance without blind spots', async () => {
  const root = createTempRoot('qa-scope-guidance-');

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./qa-scope.mjs')>('./qa-scope.mjs');
    expect(
      module.partitionQaScopeFiles([
        'docs/agent-tooling/AGENTS.md',
        'docs/agent-tooling/.agents/skills/security-code-review/SKILL.md',
        'tooling/configs/qa/guardrail-policy.data.json',
        'src/example.ts',
      ])
    ).toEqual({
      productFiles: [
        'docs/agent-tooling/AGENTS.md',
        'docs/agent-tooling/.agents/skills/security-code-review/SKILL.md',
        'src/example.ts',
      ],
      harnessFiles: [
        'docs/agent-tooling/AGENTS.md',
        'docs/agent-tooling/.agents/skills/security-code-review/SKILL.md',
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
      module.isHarnessInventoryOnlyFile('tooling/configs/qa/instance-ownership.data.json')
    ).toBe(true);
    expect(
      module.isHarnessVerificationQaFile('tooling/qa/core/verify-instance-ownership.data.mjs')
    ).toBe(true);
    expect(
      module.isHarnessVerificationQaFile(
        'tooling/qa/core/focused-coverage/maps/cast-cleanup-content.mjs'
      )
    ).toBe(false);
    expect(
      module.isFocusedCoverageOwnerMapInventoryFile(
        'tooling/qa/core/focused-coverage/maps/cast-cleanup-content.mjs'
      )
    ).toBe(true);
    expect(
      module.isHarnessVerificationQaFile(
        'tooling/qa/core/focused-coverage/maps/popup-recording.mjs'
      )
    ).toBe(false);
    expect(
      module.isHarnessVerificationQaFile(
        'tooling/qa/core/focused-coverage/maps/popup-page-access.mjs'
      )
    ).toBe(false);
    expect(
      module.isHarnessVerificationQaFile(
        'tooling/qa/core/focused-coverage/maps/content-selection.mjs'
      )
    ).toBe(false);
    expect(
      module.isHarnessVerificationQaFile('tooling/qa/core/focused-coverage/maps/local.mjs')
    ).toBe(false);
    expect(
      module.isFocusedCoverageOwnerMapInventoryFile(
        'tooling/qa/core/focused-coverage/maps/cast-cleanup.mjs'
      )
    ).toBe(false);
    expect(
      module.isFocusedCoverageOwnerMapInventoryFile(
        'tooling/qa/core/focused-coverage/maps/index.mjs'
      )
    ).toBe(false);
    expect(
      module.isFocusedCoverageOwnerMapInventoryFile(
        'tooling/qa/core/focused-coverage/maps/unregistered-owner-map.mjs'
      )
    ).toBe(false);
    expect(
      module.isHarnessVerificationQaFile(
        'tooling/qa/core/focused-coverage/maps/unregistered-owner-map.mjs'
      )
    ).toBe(true);
    expect(
      module.isHarnessInventoryOnlyFile('tooling/qa/core/focused-coverage/maps/shared-facade.mjs')
    ).toBe(true);
    expect(
      module.isHarnessInventoryOnlyFile('tooling/qa/core/focused-coverage/maps/settings.mjs')
    ).toBe(true);
    expect(
      module.isHarnessVerificationQaFile('tooling/qa/core/verify-test-coverage.registry.mjs')
    ).toBe(true);
    expect(module.isHarnessVerificationQaFile('tooling/configs/qa/quality-baseline.json')).toBe(
      true
    );
    expect(module.isHarnessVerificationQaFile('tooling/qa/core/qa-scope.mjs')).toBe(true);
  });
});

it('registers exactly the current leaf focused owner maps as inventory-only', async () => {
  const module = await importFresh<typeof import('./qa-scope.mjs')>('./qa-scope.mjs');
  const mapRoot = 'tooling/qa/core/focused-coverage/maps';
  const mapFiles = fs
    .readdirSync(mapRoot)
    .filter((file) => file.endsWith('.mjs'))
    .sort();

  for (const file of mapFiles) {
    const relativePath = `${mapRoot}/${file}`;
    const composesOtherMaps =
      collectFocusedCoverageOwnerMapInventoryViolations([relativePath]).length > 0;
    expect(module.isFocusedCoverageOwnerMapInventoryFile(relativePath)).toBe(!composesOtherMaps);
  }
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
        'docs/agent-tooling/AGENTS.md',
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
