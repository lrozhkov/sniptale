import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript } from '../../qa/core/shared.mjs';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function verifyFiles(root, manifest) {
  for (const entry of manifest.files ?? []) {
    if (typeof entry?.file !== 'string' || !/^[a-f0-9]{64}$/u.test(entry?.sha256 ?? '')) {
      throw new Error('Malformed canonical proof file inventory.');
    }
    const absolute = path.resolve(root, entry.file);
    if (
      !absolute.startsWith(`${path.resolve(root)}${path.sep}`) ||
      sha256(absolute) !== entry.sha256
    ) {
      throw new Error('Canonical proof artifact hash mismatch.');
    }
  }
}

export function adjudicateAttempt({ artifactRoot, candidateSha, jobResult, recordFile }) {
  const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  if (
    record?.artifactKind !== 'sniptale-selectel-attempt-record' ||
    record.candidateSha !== candidateSha ||
    record.preemptible !== true ||
    record.publicIp !== false
  ) {
    throw new Error('Selectel attempt record does not bind the canonical candidate.');
  }
  const manifests = fs.existsSync(artifactRoot)
    ? fs
        .readdirSync(artifactRoot, { recursive: true })
        .filter((entry) => entry.endsWith('proof-manifest.json'))
    : [];
  if (manifests.length === 0) {
    return {
      classification: 'infrastructure-interruption',
      retry: true,
      terminal: false,
      reason: `canonical job ${jobResult} without a terminal receipt`,
    };
  }
  if (manifests.length !== 1)
    throw new Error('Attempts may not combine multiple canonical proofs.');
  const manifestPath = path.join(artifactRoot, manifests[0]);
  const manifestRoot = path.dirname(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  verifyFiles(manifestRoot, manifest);
  const usedProfile = manifest.infrastructure?.resourceProfile;
  const expectedMemoryMiB = record.resources?.ramMiB - record.resourceProfile?.memoryReserveMiB;
  if (
    manifest?.artifactKind !== 'sniptale-ci-proof' ||
    manifest.lane !== 'candidate' ||
    manifest.commit !== candidateSha ||
    manifest.infrastructure?.attempt !== record.attempt ||
    manifest.infrastructure?.serverId !== record.serverId ||
    manifest.infrastructure?.availabilityZone !== record.availabilityZone ||
    manifest.infrastructure?.imageReference !== record.qaImage ||
    usedProfile?.cpuTokens !== record.resources?.vcpus ||
    usedProfile?.memoryMiB !== expectedMemoryMiB ||
    usedProfile?.vitestWorkers !== record.resourceProfile?.vitestWorkers ||
    usedProfile?.playwrightWorkers !== record.resourceProfile?.playwrightWorkers ||
    usedProfile?.securityWorkers !== record.resourceProfile?.securityWorkers
  ) {
    throw new Error('Canonical receipt does not match its Selectel attempt authority.');
  }
  if (manifest.status === 'passed' && jobResult === 'success') {
    return {
      classification: 'success',
      retry: false,
      terminal: true,
      reason: 'canonical proof passed',
    };
  }
  if (manifest.status === 'failed') {
    return {
      classification: 'genuine-qa-failure',
      retry: false,
      terminal: true,
      reason: 'canonical QA produced a deterministic failed receipt',
    };
  }
  throw new Error('Canonical receipt has an unsupported terminal state.');
}

if (isExecutedAsScript(import.meta.url)) {
  const [artifactRoot, recordFile, candidateSha, jobResult] = process.argv.slice(2);
  try {
    process.stdout.write(
      `${JSON.stringify(adjudicateAttempt({ artifactRoot, candidateSha, jobResult, recordFile }))}\n`
    );
  } catch (error) {
    process.stderr.write(
      `Selectel adjudication failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}
