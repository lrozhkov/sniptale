import { expect, it } from 'vitest';

import { collectChangeRisks } from './collector.mjs';
import {
  formatCheckpointRiskSummary,
  formatFullChangeRiskReport,
  formatPreflightRiskSummary,
} from './render.mjs';

const findings = collectChangeRisks({
  mode: 'preflight',
  targetFiles: [
    'apps/extension/manifest.json',
    'packages/runtime-contracts/src/messaging/message-types/index.ts',
  ],
});

it('renders bounded checkpoint evidence, coverage, and explicit requirements', () => {
  const output = formatCheckpointRiskSummary({
    findings,
    steps: [
      { label: 'Manifest permissions', status: 'ok' },
      { label: 'Manifest integrity', status: 'skipped' },
      { label: 'Typecheck', status: 'failed' },
    ],
  });

  expect(output).toContain('Change risk: HIGH');
  expect(output).toContain('Manifest permissions: passed');
  expect(output).toContain('Manifest integrity: not selected');
  expect(output).toContain('Typecheck: failed');
  expect(output).toContain('Required:');
  expect(output).toContain('Security review');
  expect(output).toContain('Architecture review');
  expect(output).toContain('Transitive consumer graph check');
  expect(output).not.toMatch(/pending|receipt|informational/iu);
});

it('keeps terminal risk lists bounded and preserves complete evidence in the full report', () => {
  const terminal = formatPreflightRiskSummary(findings);
  const full = formatFullChangeRiskReport({ findings, steps: [] });

  expect(terminal.length).toBeLessThan(full.length);
  expect(full).toContain('packages/runtime-contracts/src/messaging/message-types/index.ts');
  expect(full).toContain('docs/security/manifest-permissions.md');
});

it('does not present unmatched heuristics as low risk or waive review assessment', () => {
  const terminal = formatCheckpointRiskSummary({ findings: [], steps: [] });
  const full = formatFullChangeRiskReport({ findings: [], steps: [] });

  for (const output of [terminal, full]) {
    expect(output).toContain('No classified change seams detected');
    expect(output).toContain(
      'Inspect the implementation against architecture and security review triggers'
    );
    expect(output).not.toContain('LOW');
    expect(output).not.toContain('No architecture or security review indicated');
  }
});

it('requires executor assessment when a classified seam has no automatic review route', () => {
  const mutationFindings = collectChangeRisks({
    mode: 'preflight',
    targetFiles: ['apps/extension/src/composition/persistence/projects/index-mutations.ts'],
  });
  const output = formatCheckpointRiskSummary({ findings: mutationFindings, steps: [] });

  expect(output).toContain('Change risk: MEDIUM');
  expect(output).toContain('Durable mutation failure and rollback proof');
  expect(output).toContain(
    'Inspect the implementation against architecture and security review triggers'
  );
});
