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

it('renders bounded checkpoint evidence, actual coverage states, and untracked review guidance', () => {
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
  expect(output).toContain('Security review required: manifest.permissions');
  expect(output).toContain('Architecture review required:');
  expect(output).not.toMatch(/pending|receipt|informational/iu);
});

it('keeps terminal risk lists bounded and preserves complete evidence in the full report', () => {
  const terminal = formatPreflightRiskSummary(findings);
  const full = formatFullChangeRiskReport({ findings, steps: [] });

  expect(terminal.length).toBeLessThan(full.length);
  expect(full).toContain('packages/runtime-contracts/src/messaging/message-types/index.ts');
  expect(full).toContain('docs/security/manifest-permissions.md');
});
