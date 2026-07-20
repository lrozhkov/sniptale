import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  AuditExecutionError,
  auditResultError,
  normalizeAuditCommandResult,
} from './execution-error.mjs';
import { createTempRoot } from '../core/test-helpers';
import { runAudit } from './npm-audit.mjs';
import { runOsvCheck } from './osv.mjs';
import { runSemgrepCheck } from './semgrep.mjs';

function expectAuditError(run: () => unknown, kind: string) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AuditExecutionError);
    expect(error).toMatchObject({ kind });
    return error as AuditExecutionError;
  }
  throw new Error(`Expected ${kind} AuditExecutionError`);
}

it('preserves false EPERM status and output as authoritative evidence', () => {
  const error = Object.assign(new Error('spawnSync npm EPERM'), { code: 'EPERM' });
  expect(
    normalizeAuditCommandResult(
      {
        error,
        status: 1,
        stdout: '{"error":"registry unavailable"}',
        stderr: 'registry failure',
      },
      { tool: 'npm audit' }
    )
  ).toEqual({
    error: undefined,
    status: 1,
    stdout: '{"error":"registry unavailable"}',
    stderr: 'registry failure',
  });
});

it('classifies a spawn failure without status as bootstrap-failed', () => {
  const error = Object.assign(new Error('spawn failed'), { code: 'EACCES' });
  const failure = expectAuditError(
    () =>
      normalizeAuditCommandResult(
        { error, status: null, stdout: '', stderr: '' },
        { tool: 'audit tool' }
      ),
    'bootstrap-failed'
  );

  expect(failure.exitCode).toBeNull();
});

it('classifies npm DNS output as an environment-network failure', () => {
  const root = createTempRoot('npm-audit-network-');
  const stdout = '{"error":{"code":"EAI_AGAIN","summary":"registry request failed"}}';
  const stderr = 'request failed: getaddrinfo EAI_AGAIN registry.npmjs.org';
  const error = expectAuditError(
    () =>
      runAudit({
        reportPath: 'results.json',
        reportRoot: root,
        runNpmImpl: () => ({ status: 1, stdout, stderr }),
      }),
    'environment-network'
  );

  expect(error).toMatchObject({ exitCode: 1, stdout, stderr });
});

it('preserves stderr-only unexpected exits', () => {
  const root = createTempRoot('semgrep-unexpected-exit-');
  const stderr = 'Semgrep bootstrap rejected its configuration';
  const error = expectAuditError(
    () =>
      runSemgrepCheck({
        commandSpec: {
          command: 'semgrep',
          args: [],
          env: { SEMGREP_SETTINGS_FILE: path.resolve('.tmp/semgrep/settings.yml') },
        },
        files: ['apps/extension/src/example.ts'],
        reportPath: 'results.json',
        reportRoot: root,
        runCommandImpl: () => ({ status: 2, stdout: '', stderr }),
      }),
    'unexpected-exit'
  );

  expect(error).toMatchObject({ exitCode: 2, stdout: '', stderr });
});

it('classifies malformed required JSON without discarding process evidence', () => {
  const root = createTempRoot('npm-audit-invalid-output-');
  const reportPath = path.join(root, 'results.json');
  fs.writeFileSync(reportPath, '{"stale":true}\n');
  const error = expectAuditError(
    () =>
      runAudit({
        reportPath: 'results.json',
        reportRoot: root,
        runNpmImpl: () => ({ status: 0, stdout: '{', stderr: 'parser context' }),
      }),
    'invalid-output'
  );

  expect(error).toMatchObject({ exitCode: 0, stdout: '{', stderr: 'parser context' });
  expect(fs.existsSync(reportPath)).toBe(false);
});

it('uses the tool-unavailable type for an absent required executable', () => {
  expectAuditError(() => runOsvCheck({ executable: null }), 'tool-unavailable');
});

it('bounds captured stdout and stderr', () => {
  const output = 'x'.repeat(100_000);
  const error = auditResultError('invalid-output', 'invalid output', {
    status: 0,
    stdout: output,
    stderr: output,
  });

  expect(error.stdout.length).toBeLessThanOrEqual(16 * 1024);
  expect(error.stderr.length).toBeLessThanOrEqual(16 * 1024);
  expect(error.stdout).toContain('characters omitted');
});
