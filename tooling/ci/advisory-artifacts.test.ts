import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import { collectCiAdvisoryArtifacts } from './advisory-artifacts.mjs';
import { createTempRoot } from '../qa/test-support/test-helpers';

it('records collector failures without throwing or presenting them as passed controls', () => {
  const rootDir = createTempRoot('ci-advisory-artifacts-');
  const summary = collectCiAdvisoryArtifacts(
    { lane: 'release', rootDir },
    {
      evidenceCollector: () => {
        throw new Error('evidence unavailable');
      },
      topologyCollector: () => ({ violations: [] }),
      topologyPersister: () => ({ artifactPath: '.tmp/repo-audit/topology.json' }),
      mutationCollector: vi.fn(() => {
        throw new Error('mutation unavailable');
      }),
    }
  );

  expect(summary.blocking).toBe(false);
  expect(summary.results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'audit-evidence', status: 'failed' }),
      expect.objectContaining({ id: 'topology-report', status: 'collected' }),
      expect.objectContaining({ id: 'mutation-persistence', status: 'failed' }),
      expect.objectContaining({ id: 'mutation-secrets', status: 'failed' }),
    ])
  );
  expect(summary.results.map(({ status }) => status)).not.toContain('passed');
});

it('keeps advisory execution outside canonical wrappers and artifact sealing', () => {
  const workflow = fs.readFileSync('.github/workflows/_canonical-proof.yml', 'utf8');
  for (const file of ['tooling/ci/proof-wrapper.mjs', 'tooling/ci/release-wrapper.mjs']) {
    expect(fs.readFileSync(file, 'utf8')).not.toContain('collectCiAdvisoryArtifacts');
  }
  expect(workflow).toContain('  advisory-artifacts:');
  expect(workflow).toContain('needs: canonical-qa');
  expect(workflow).toContain("needs.canonical-qa.result == 'success'");
  expect(workflow).toContain('continue-on-error: true');
  expect(workflow).toContain('node tooling/ci/advisory-artifacts.mjs "$PROOF_LANE"');
});
