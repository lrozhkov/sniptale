import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { adjudicateAttempt } from './adjudication.mjs';

function fixture(status: 'passed' | 'failed') {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp/selectel-adjudication-'));
  const candidateSha = 'a'.repeat(40);
  const serverId = '11111111-1111-4111-8111-111111111111';
  const qaImage = `ghcr.io/lrozhkov/sniptale-qa@sha256:${'b'.repeat(64)}`;
  fs.writeFileSync(path.join(root, 'report.json'), '{}\n');
  const digest = crypto.createHash('sha256').update('{}\n').digest('hex');
  fs.writeFileSync(
    path.join(root, 'proof-manifest.json'),
    `${JSON.stringify({
      artifactKind: 'sniptale-ci-proof',
      lane: 'candidate',
      status,
      commit: candidateSha,
      containerDigest: `sha256:${'c'.repeat(64)}`,
      infrastructure: {
        attempt: 1,
        serverId,
        availabilityZone: 'ru-3a',
        imageReference: qaImage,
        resourceProfile: {
          cpuTokens: 24,
          memoryMiB: 36864,
          vitestWorkers: 16,
          playwrightWorkers: 4,
          securityWorkers: 8,
        },
      },
      files: [{ file: 'report.json', sha256: digest }],
    })}\n`
  );
  const recordFile = path.join(root, 'attempt-1.json');
  fs.writeFileSync(
    recordFile,
    `${JSON.stringify({
      artifactKind: 'sniptale-selectel-attempt-record',
      candidateSha,
      attempt: 1,
      serverId,
      availabilityZone: 'ru-3a',
      qaImage,
      resourceProfile: {
        vitestWorkers: 16,
        playwrightWorkers: 4,
        securityWorkers: 8,
        memoryReserveMiB: 12288,
      },
      resources: { vcpus: 24, ramMiB: 49152, bootVolumeGiB: 80 },
      preemptible: true,
      publicIp: false,
    })}\n`
  );
  return { candidateSha, recordFile, root };
}

it('accepts a candidate-bound successful terminal receipt', () => {
  const input = fixture('passed');
  expect(
    adjudicateAttempt({ ...input, artifactRoot: input.root, jobResult: 'success' })
  ).toMatchObject({
    classification: 'success',
    retry: false,
  });
});

it('does not retry a deterministic QA failure', () => {
  const input = fixture('failed');
  expect(
    adjudicateAttempt({ ...input, artifactRoot: input.root, jobResult: 'failure' })
  ).toMatchObject({
    classification: 'genuine-qa-failure',
    retry: false,
  });
});

it('retries an interrupted attempt only when no terminal receipt exists', () => {
  const input = fixture('passed');
  fs.rmSync(path.join(input.root, 'proof-manifest.json'));
  expect(
    adjudicateAttempt({ ...input, artifactRoot: input.root, jobResult: 'cancelled' })
  ).toMatchObject({
    classification: 'infrastructure-interruption',
    retry: true,
  });
});
