import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from '../core/test-helpers';
import { runAstGrepCheck } from './ast-grep.mjs';
import { runCodeqlCheck } from './codeql.mjs';
import { AuditExecutionError } from './execution-error.mjs';
import { runKnipCheck } from './knip.mjs';
import { runLicenseCheck } from './licenses.mjs';

function captureAuditError(run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AuditExecutionError);
    return error as AuditExecutionError;
  }
  throw new Error('Expected AuditExecutionError');
}

it('retains CodeQL analyze evidence when SARIF is malformed', () => {
  const outputRoot = createTempRoot('codeql-invalid-sarif-');
  const stdout = 'CodeQL analyze completed';
  const stderr = 'CodeQL analyze diagnostic';
  const error = captureAuditError(() =>
    runCodeqlCheck({
      baselinePath: null,
      executable: 'codeql',
      outputRoot,
      runCommandImpl: (_command, args) => {
        if (args[1] === 'create') return { status: 0, stdout: '', stderr: '' };
        fs.writeFileSync(
          path.join(outputRoot, 'results.sarif'),
          JSON.stringify({ version: '2.1.0', runs: [{}] })
        );
        return { status: 0, stdout, stderr };
      },
    })
  );

  expect(error).toMatchObject({
    kind: 'invalid-output',
    exitCode: 0,
    stdout,
    stderr,
  });
});

it('retains Knip command evidence for an unsupported issue category', () => {
  const stdout = JSON.stringify({
    issues: [{ file: 'package.json', futureCategory: [{ name: 'future' }] }],
  });
  const stderr = 'Knip semantic diagnostic';
  const error = captureAuditError(() =>
    runKnipCheck({
      executable: 'knip',
      runCommandImpl: () => ({ status: 0, stdout, stderr }),
    })
  );

  expect(error).toMatchObject({
    kind: 'invalid-output',
    exitCode: 0,
    stdout,
    stderr,
  });
});

it('retains ast-grep command evidence for an unexpected rule identity', () => {
  const stdout = JSON.stringify([
    {
      file: 'apps/extension/src/example.ts',
      ruleId: 'unexpected-rule',
      range: { start: { line: 0 } },
    },
  ]);
  const stderr = 'ast-grep semantic diagnostic';
  const error = captureAuditError(() =>
    runAstGrepCheck({
      files: ['apps/extension/src/example.ts'],
      runCommandImpl: () => ({ status: 0, stdout, stderr }),
    })
  );

  expect(error).toMatchObject({
    kind: 'invalid-output',
    exitCode: 0,
    stdout: expect.stringContaining('unexpected-rule'),
    stderr: expect.stringContaining(stderr),
  });
});

it.each([
  ['EACCES', 'bootstrap-failed'],
  ['ENOENT', 'tool-unavailable'],
])('classifies npm SBOM startup %s as %s', (code, kind) => {
  const spawnError = Object.assign(new Error(`spawn npm ${code}`), { code });
  const root = createTempRoot('license-command-start-');
  const error = captureAuditError(() =>
    runLicenseCheck({
      reportPath: path.join(root, 'summary.json'),
      sbomPath: path.join(root, 'sbom.json'),
      runNpmImpl: () => {
        throw spawnError;
      },
    })
  );

  expect(error).toMatchObject({ kind, exitCode: null });
});

it('keeps integer-status EPERM evidence for npm SBOM output validation', () => {
  const spawnError = Object.assign(new Error('spawnSync npm EPERM'), { code: 'EPERM' });
  const root = createTempRoot('license-command-eperm-');
  const error = captureAuditError(() =>
    runLicenseCheck({
      reportPath: path.join(root, 'summary.json'),
      sbomPath: path.join(root, 'sbom.json'),
      runNpmImpl: () => ({
        error: spawnError,
        status: 0,
        stdout: '{',
        stderr: 'npm SBOM parser diagnostic',
      }),
    })
  );

  expect(error).toMatchObject({
    kind: 'invalid-output',
    exitCode: 0,
    stdout: '{',
    stderr: 'npm SBOM parser diagnostic',
  });
});
