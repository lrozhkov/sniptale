import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import {
  classifyCollectorFailure,
  collectCiAdvisoryArtifacts,
  collectMutationProfile,
  sanitizeBoundedCollectorMessage,
} from './advisory-artifacts.mjs';
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
        throw Object.assign(new Error('Mutation CLI is unavailable at /tmp/private/stryker.js'), {
          exitCode: 1,
          reason: 'tool-unavailable',
        });
      }),
    }
  );

  expect(summary.blocking).toBe(false);
  expect(summary.results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'audit-evidence',
        status: 'failed',
        reason: 'runner-failed',
        exitCode: 1,
      }),
      expect.objectContaining({ id: 'topology-report', status: 'collected' }),
      expect.objectContaining({
        id: 'mutation-persistence',
        status: 'failed',
        reason: 'tool-unavailable',
        exitCode: 1,
      }),
      expect.objectContaining({
        id: 'mutation-secrets',
        status: 'failed',
        reason: 'tool-unavailable',
        exitCode: 1,
      }),
    ])
  );
  expect(summary.results.map(({ status }) => status)).not.toContain('passed');
});

it('classifies collector failures while exposing only fixed bounded messages', () => {
  const hostileDetails = [
    '/home/runner/work/sniptale/stryker.js',
    "'/tmp/a'",
    'file:///home/runner/private/file.ts',
    '{"token":"secret-value"}',
    'PASSWORD="correct horse battery staple"',
  ].join(' ');
  const error = Object.assign(new Error(`Mutation CLI is unavailable at ${hostileDetails}`), {
    exitCode: 1,
  });

  expect(classifyCollectorFailure(error)).toBe('tool-unavailable');
  expect(classifyCollectorFailure(new Error('Mutation report is missing'))).toBe('report-missing');
  expect(classifyCollectorFailure(new Error('Mutation process failed'))).toBe('runner-failed');
  const message = sanitizeBoundedCollectorMessage(error);
  expect(message).toBe('Required advisory collector tool is unavailable.');
  for (const detail of hostileDetails.split(' ')) expect(message).not.toContain(detail);
  expect(message.length).toBeLessThanOrEqual(320);
});

it('classifies a successful mutation runner without its report through the collector boundary', () => {
  const root = createTempRoot('ci-advisory-missing-mutation-report-');
  const cli = `${root}/fake-stryker.mjs`;
  const runLabel = 'collector-missing-report-fixture';
  const artifactDir = `.tmp/mutation/persistence/${runLabel}`;
  fs.writeFileSync(cli, 'process.exitCode = 0;\n');
  fs.rmSync(artifactDir, { force: true, recursive: true });

  try {
    expect(() =>
      collectMutationProfile('persistence', {
        ...process.env,
        GITHUB_RUN_ID: runLabel,
        SNIPTALE_MUTATION_CLI: cli,
      })
    ).toThrow(expect.objectContaining({ reason: 'report-missing', exitCode: 1 }));
  } finally {
    fs.rmSync(artifactDir, { force: true, recursive: true });
  }
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
  const installIndex = workflow.indexOf('npm ci --ignore-scripts --prefix tooling/test/mutation');
  const collectorIndex = workflow.indexOf('node tooling/ci/advisory-artifacts.mjs "$PROOF_LANE"');
  expect(installIndex).toBeGreaterThan(-1);
  expect(installIndex).toBeLessThan(collectorIndex);
});
