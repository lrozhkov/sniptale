import { expect, it } from 'vitest';

import { createTempRoot, withCwd, writeFile, writeJson } from './test-helpers';
import {
  createInjectedSonarjsViolation,
  createSonarjsToolNoiseEntry,
  importSonarjsVerifier,
  writeSonarjsTsconfig,
} from './verify-sonarjs.test-support';

it('suppresses exactly matching tool-noise baseline entries', async () => {
  const root = createTempRoot('verify-sonarjs-baseline-');
  writeSonarjsTsconfig(root);
  const baselinePath = writeJson(root, 'sonarjs-baseline.json', {
    schemaVersion: 1,
    entries: [
      createSonarjsToolNoiseEntry({
        line: 7,
        messagePattern: 'known false positive',
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
        createInjectedSonarjsViolation({ rule: 'sonarjs/no-duplicated-branches' }),
      ],
    })
  );

  expect(result.violations).toHaveLength(4);
});
