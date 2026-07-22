import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

import { QA_WRAPPER_CLI_CONTRACTS } from './cli-contracts.mjs';
import { STRUCTURAL_AUDIT_STEPS } from '../core/qa-steps/definitions.data.mjs';
import { createTempRoot } from '../core/test-helpers';
import { STRUCTURAL_AUDIT_MAX_BYTES, writeStructuralAuditArtifact } from './structural-audit.mjs';

it('registers structural audit as a distinct manual report-only wrapper', () => {
  expect(QA_WRAPPER_CLI_CONTRACTS['qa:structural-audit']).toBeDefined();
  expect(STRUCTURAL_AUDIT_STEPS).toEqual([
    expect.arrayContaining(['structural-audit', 'Structural audit', 'verify-structural-risk.mjs']),
  ]);
  expect(fs.readFileSync('tooling/qa/wrappers/structural-audit.mjs', 'utf8')).not.toContain(
    'blocking: true'
  );
});

it('writes parseable private byte-bounded artifacts after deep sanitization', () => {
  const root = createTempRoot('structural-audit-artifact-');
  const outputPath = path.join(root, 'report.json');
  const secret = 'bare-structural-private-value';
  const functions = Array.from({ length: 300 }, (_, index) => ({
    file: `/home/alice/${secret}-${index}.ts`,
    symbol: `run${index}`,
    score: 5,
    lines: 80,
    stateAuthorityNames: Array.from({ length: 100 }, (__, state) => `state-${state}`),
  }));
  writeStructuralAuditArtifact(
    {
      scope: 'repo-wide-audit',
      files: [
        {
          file: `/home/alice/${secret}.ts`,
          score: 5,
          lines: 500,
          functions,
        },
      ],
      functions,
      advisories: functions.map((metric) => ({ ...metric, reason: secret })),
    },
    {
      outputPath,
      maximumBytes: STRUCTURAL_AUDIT_MAX_BYTES,
      sanitizerOptions: { repositoryRoot: root, sensitiveValues: [secret] },
    }
  );

  const text = fs.readFileSync(outputPath, 'utf8');
  const artifact = JSON.parse(text);
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(STRUCTURAL_AUDIT_MAX_BYTES);
  expect(text).not.toMatch(/bare-structural-private-value|alice/u);
  expect(artifact.functions[0].stateAuthorityNames).toHaveLength(50);
  expect(fs.statSync(outputPath).mode & 0o777).toBe(0o600);
});
