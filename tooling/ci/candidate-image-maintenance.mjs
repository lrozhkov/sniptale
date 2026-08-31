import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  classifyCandidateVersionsForSweep,
  normalizeBuildxInspection,
} from './candidate-image-cache.mjs';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0 || result.error) {
    throw new Error(`${command} failed: ${String(result.stderr || result.error?.message).trim()}`);
  }
  return result.stdout;
}

function packageIdentity(repository) {
  const match = repository.match(/^ghcr\.io\/([^/]+)\/(.+)$/u);
  if (!match) throw new Error(`Unsupported GHCR repository: ${repository}`);
  return { owner: match[1], packageName: match[2] };
}

function packageEndpoint(repository) {
  const { owner, packageName } = packageIdentity(repository);
  return `/users/${owner}/packages/container/${encodeURIComponent(packageName)}/versions`;
}

function inspectVersion(repository, tags) {
  const candidateTag = tags.find((tag) => /^candidate-cache-v1-(?:qa|controller)-/u.test(tag));
  if (!candidateTag) return { digest: null, labels: {} };
  const source = run('docker', [
    'buildx',
    'imagetools',
    'inspect',
    `${repository}:${candidateTag}`,
    '--format',
    '{{json .}}',
  ]);
  const inspection = normalizeBuildxInspection(JSON.parse(source));
  return { digest: inspection.digest, labels: inspection.labels };
}

export function normalizeGhcrVersions(repository, values, inspect = inspectVersion) {
  return values.map((value) => {
    const tags = value.metadata?.container?.tags ?? [];
    const inspection = inspect(repository, tags);
    return {
      id: value.id,
      package: repository,
      digest: inspection.digest ?? value.name,
      tags,
      labels: inspection.labels,
      createdAt: Math.floor(Date.parse(value.created_at) / 1000),
    };
  });
}

function listVersions(repository) {
  const source = run('gh', [
    'api',
    '--paginate',
    '--slurp',
    `${packageEndpoint(repository)}?per_page=100`,
  ]);
  return normalizeGhcrVersions(repository, JSON.parse(source).flat());
}

function readUseReceipts(repository) {
  const artifactSource = run('gh', [
    'api',
    '--paginate',
    `/repos/${repository}/actions/artifacts?per_page=100`,
    '--jq',
    '.artifacts[] | select(.expired == false and (.name | startswith("candidate-image-use-"))) | [.id, .created_at] | @tsv',
  ]);
  const cutoff = Date.now() - 8 * 24 * 60 * 60 * 1000;
  const artifacts = artifactSource
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))
    .filter(([, createdAt]) => Date.parse(createdAt) >= cutoff);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-candidate-receipts-'));
  const receipts = [];
  try {
    for (const [artifactId] of artifacts) {
      const archive = path.join(temporary, `${artifactId}.zip`);
      const bytes = spawnSync('gh', [
        'api',
        `/repos/${repository}/actions/artifacts/${artifactId}/zip`,
      ]);
      if (bytes.status !== 0 || bytes.error)
        throw new Error(`Unable to download artifact ${artifactId}.`);
      fs.writeFileSync(archive, bytes.stdout);
      const entries = run('unzip', ['-Z1', archive])
        .trim()
        .split('\n')
        .filter((entry) => entry.endsWith('use-receipt.json'));
      for (const entry of entries) {
        receipts.push(JSON.parse(run('unzip', ['-p', archive, entry])));
      }
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return receipts;
}

export function createCandidateImageSweepReport({ authority, inventories, useReceipts, now }) {
  const images = Object.entries(authority.images).map(([imageKind, image]) => {
    const policy = { ...authority, ...image, imageKind };
    delete policy.images;
    return {
      imageKind,
      repository: image.repository,
      decisions: classifyCandidateVersionsForSweep({
        versions: inventories[imageKind],
        useReceipts,
        nowEpochSeconds: now,
        policy,
      }),
    };
  });
  return {
    schemaVersion: 1,
    artifactKind: 'sniptale-candidate-image-sweep-report',
    mode: 'seven-day-idle',
    generatedAt: now,
    images,
  };
}

export function applyCandidateImageSweep(report, remove) {
  const removed = [];
  for (const image of report.images) {
    const endpoint = packageEndpoint(image.repository);
    for (const decision of image.decisions) {
      if (!decision.delete) continue;
      if (!Number.isInteger(decision.versionId) || decision.reason !== 'eligible') {
        throw new Error('Candidate image deletion requires an exact eligible package version.');
      }
      remove(`${endpoint}/${decision.versionId}`);
      removed.push({ repository: image.repository, versionId: decision.versionId });
    }
  }
  return removed;
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(import.meta.filename)) {
  const mode = process.argv[2] ?? 'plan';
  if (!['plan', 'apply'].includes(mode))
    throw new Error('Usage: candidate-image-maintenance.mjs [plan|apply]');
  const authority = JSON.parse(
    fs.readFileSync('tooling/configs/ci/candidate-image-cache.json', 'utf8')
  );
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('Candidate maintenance requires GITHUB_REPOSITORY.');
  const inventories = Object.fromEntries(
    Object.entries(authority.images).map(([kind, image]) => [kind, listVersions(image.repository)])
  );
  const report = createCandidateImageSweepReport({
    authority,
    inventories,
    useReceipts: readUseReceipts(repository),
    now: Math.floor(Date.now() / 1000),
  });
  const removed =
    mode === 'apply'
      ? applyCandidateImageSweep(report, (endpoint) =>
          run('gh', ['api', '--method', 'DELETE', endpoint])
        )
      : [];
  fs.mkdirSync('build/candidate-image-maintenance', { recursive: true });
  fs.writeFileSync(
    'build/candidate-image-maintenance/report.json',
    `${JSON.stringify({ ...report, requestedMode: mode, removed }, null, 2)}\n`
  );
}
