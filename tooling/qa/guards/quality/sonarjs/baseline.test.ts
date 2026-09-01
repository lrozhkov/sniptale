import { expect, it } from 'vitest';

import { createTempRoot, withCwd, writeFile, writeJson } from '../../../test-support/test-helpers';
import {
  createInjectedSonarjsViolation,
  createSonarjsToolNoiseEntry,
  importSonarjsVerifier,
  writeSonarjsTsconfig,
} from './test-support';

it('suppresses exactly matching tool-noise baseline entries', async () => {
  const root = createTempRoot('verify-sonarjs-baseline-');
  writeSonarjsTsconfig(root);
  const baselinePath = writeJson(root, 'sonarjs-baseline.json', {
    schemaVersion: 1,
    entries: [
      createSonarjsToolNoiseEntry({
        column: 3,
        line: 7,
        messagePattern: '^known false positive from upstream$',
        reason: 'the type model cannot represent this generated branch shape',
        targetAction: 'remove-after-upstream-fix',
      }),
    ],
  });
  writeFile(root, 'apps/extension/src/example.ts', 'export const value = 1;\n');
  const verifier = await importSonarjsVerifier(root);

  const result = await withCwd(root, () =>
    verifier.runSonarjsCheck({
      baselinePath,
      files: ['apps/extension/src/example.ts'],
      lintFiles: async () => [
        createInjectedSonarjsViolation({
          column: 3,
          line: 7,
          message: 'known false positive from upstream',
        }),
        createInjectedSonarjsViolation({
          column: 3,
          line: 9,
          message: 'real finding',
        }),
      ],
    })
  );

  expect(result.violations).toEqual([
    expect.objectContaining({
      line: 9,
      message: 'real finding',
    }),
  ]);
});

it('fails invalid baseline metadata even when the focused scope is empty', async () => {
  const root = createTempRoot('verify-sonarjs-invalid-baseline-');
  writeSonarjsTsconfig(root);
  const baselinePath = writeJson(root, 'sonarjs-baseline.json', {
    schemaVersion: 1,
    entries: [
      {
        classification: 'accepted-debt',
        file: 'apps/extension/src/example.ts',
        reason: 'missing owner and target action',
        rule: 'sonarjs/no-all-duplicated-branches',
      },
    ],
  });
  const verifier = await importSonarjsVerifier(root);

  const result = await withCwd(root, () =>
    verifier.runSonarjsCheck({
      baselinePath,
      files: ['package.json'],
      lintFiles: async () => [],
    })
  );

  expect(result.skipped).toBe(false);
  expect(result.violations.length).toBeGreaterThanOrEqual(3);
  expect(
    result.violations.every((violation) => violation.rule === 'sonarjs-baseline-invalid')
  ).toBe(true);
});

it('does not suppress findings with the wrong rule, file, line, or message', async () => {
  const root = createTempRoot('verify-sonarjs-baseline-mismatch-');
  writeSonarjsTsconfig(root);
  const baselinePath = writeJson(root, 'sonarjs-baseline.json', {
    schemaVersion: 1,
    entries: [createSonarjsToolNoiseEntry()],
  });
  writeFile(root, 'apps/extension/src/example.ts', 'export const value = 1;\n');
  const verifier = await importSonarjsVerifier(root);

  const result = await withCwd(root, () =>
    verifier.runSonarjsCheck({
      baselinePath,
      files: ['apps/extension/src/example.ts'],
      lintFiles: async () => [
        createInjectedSonarjsViolation({ message: 'different message' }),
        createInjectedSonarjsViolation({ file: 'apps/extension/src/other.ts' }),
        createInjectedSonarjsViolation({ line: 5 }),
        createInjectedSonarjsViolation({ rule: 'sonarjs/different-types-comparison' }),
      ],
    })
  );

  expect(result.violations).toHaveLength(4);
  expect(result.advisories).toContainEqual(
    expect.objectContaining({
      message: expect.stringContaining('does not match a current SonarJS finding'),
      rule: 'sonarjs-baseline-stale',
    })
  );
});

it('rejects non-object, missing-file, broad, and duplicate baseline entries deterministically', async () => {
  const root = createTempRoot('verify-sonarjs-baseline-schema-');
  writeSonarjsTsconfig(root);
  writeFile(root, 'apps/extension/src/example.ts', 'export const value = 1;\n');
  const baselinePath = writeJson(root, 'sonarjs-baseline.json', {
    schemaVersion: 1,
    entries: [
      null,
      createSonarjsToolNoiseEntry({ file: 'apps/extension/src/missing.ts' }),
      createSonarjsToolNoiseEntry({ debtId: 'noise.sonarjs.broad', messagePattern: '.*' }),
      createSonarjsToolNoiseEntry(),
      createSonarjsToolNoiseEntry(),
    ],
  });
  const verifier = await importSonarjsVerifier(root);

  const result = await withCwd(root, () =>
    verifier.runSonarjsCheck({ baselinePath, files: ['package.json'], lintFiles: async () => [] })
  );

  expect(result.violations.map(({ message }) => message)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('must be an object'),
      expect.stringContaining('must target an existing production file'),
      expect.stringContaining('must be anchored'),
      expect.stringContaining('duplicates an existing finding identity'),
      expect.stringContaining('duplicates an existing debtId'),
    ])
  );
});

it('reports unmatched baseline findings repo-wide as maintenance advisories', async () => {
  const root = createTempRoot('verify-sonarjs-baseline-stale-');
  writeSonarjsTsconfig(root);
  writeFile(root, 'apps/extension/src/example.ts', 'export const value = 1;\n');
  writeFile(root, 'apps/extension/src/selected.ts', 'export const selected = 1;\n');
  const baselinePath = writeJson(root, 'sonarjs-baseline.json', {
    schemaVersion: 1,
    entries: [createSonarjsToolNoiseEntry()],
  });
  const verifier = await importSonarjsVerifier(root);

  const focused = await withCwd(root, () =>
    verifier.runSonarjsCheck({
      baselinePath,
      files: ['apps/extension/src/selected.ts'],
      lintFiles: async () => [],
    })
  );
  const repoWide = await withCwd(root, () =>
    verifier.runSonarjsCheck({ baselinePath, lintFiles: async () => [], scope: 'repo-wide' })
  );

  expect(focused.violations).toEqual([]);
  expect(focused.advisories).toBeUndefined();
  expect(repoWide.violations).toEqual([]);
  expect(repoWide.advisories).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('does not match a current SonarJS finding'),
      rule: 'sonarjs-baseline-stale',
    }),
  ]);
});
