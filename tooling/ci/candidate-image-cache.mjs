import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const LOWER_HEX = /^[a-f0-9]+$/u;
const CACHE_TAG = /^candidate-cache-v1-(?:qa|controller)-[a-f0-9]{64}$/u;
const DAY_SECONDS = 24 * 60 * 60;
export const CANDIDATE_IMAGE_IDLE_TTL_SECONDS = 7 * DAY_SECONDS;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function repositoryEntry(root, relativePath) {
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Docker build input escapes the repository: ${relativePath}`);
  }
  try {
    const value = fs.readlinkSync(absolute);
    return [
      {
        path: relative.split(path.sep).join('/'),
        kind: 'symlink',
        value,
      },
    ];
  } catch (error) {
    if (error?.code !== 'EINVAL') throw error;
  }
  const descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let isDirectory = false;
  try {
    const stat = fs.fstatSync(descriptor);
    if (stat.isFile()) {
      return [
        {
          path: relative.split(path.sep).join('/'),
          kind: 'file',
          digest: hash(fs.readFileSync(descriptor)),
        },
      ];
    }
    isDirectory = stat.isDirectory();
  } finally {
    fs.closeSync(descriptor);
  }
  if (!isDirectory) throw new Error(`Unsupported Docker build input: ${relativePath}`);
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap(({ name }) => repositoryEntry(root, path.join(relative, name)));
}

function dockerCopySources(source) {
  const logicalLines = source.replace(/\\\r?\n[ \t]*/gu, ' ');
  const sources = [];
  for (const match of logicalLines.matchAll(/^\s*(?:COPY|ADD)\s+(.+)$/gimu)) {
    let body = match[1].trim();
    while (body.startsWith('--')) body = body.replace(/^--[^\s]+\s+/u, '');
    if (body.startsWith('[')) {
      const entries = JSON.parse(body);
      sources.push(...entries.slice(0, -1));
      continue;
    }
    const entries = body.split(/\s+/u);
    sources.push(...entries.slice(0, -1));
  }
  return [...new Set(sources)];
}

function baseImageDigest(source) {
  const from = source.match(/^\s*FROM\s+[^\s@]+@(sha256:[a-f0-9]{64})(?:\s|$)/imu);
  if (!from) throw new Error('QA Dockerfile must pin its base image by sha256 digest.');
  return from[1];
}

export function deriveImageInputClosure(
  root,
  {
    dockerfile = 'tooling/ci/Dockerfile',
    buildArgs = {},
    platform = 'linux/amd64',
    builderFrontend = 'dockerfile.v1/buildkit',
    provenanceMode = 'max',
    sbom = true,
    contextControlFiles = ['.dockerignore'],
  } = {}
) {
  const dockerfileSource = fs.readFileSync(path.resolve(root, dockerfile), 'utf8');
  const copySources = [
    ...new Set([dockerfile, ...contextControlFiles, ...dockerCopySources(dockerfileSource)]),
  ];
  const entries = copySources
    .flatMap((entry) => repositoryEntry(root, entry))
    .sort((left, right) => left.path.localeCompare(right.path));
  const duplicate = entries.find((entry, index) => entries[index - 1]?.path === entry.path);
  if (duplicate) throw new Error(`Docker build input appears more than once: ${duplicate.path}`);
  const closure = {
    schemaVersion: 1,
    dockerfile,
    baseImageDigest: baseImageDigest(dockerfileSource),
    buildArgs,
    platform,
    builderFrontend,
    provenanceMode,
    sbom,
    contextControlFiles,
    entries,
  };
  return { ...closure, imageInputDigest: hash(canonicalJson(closure)) };
}

export function createCandidateImagePlan({
  candidateTree,
  candidateCommit = candidateTree,
  closure,
  policy,
  forceReason = '',
}) {
  if (!LOWER_HEX.test(candidateTree ?? '') || ![40, 64].includes(candidateTree?.length ?? 0))
    throw new Error('Candidate Git tree identity is invalid.');
  if (!/^[a-f0-9]{40}$/u.test(candidateCommit ?? ''))
    throw new Error('Candidate commit identity is invalid.');
  if (policy.idleTtlSeconds !== CANDIDATE_IMAGE_IDLE_TTL_SECONDS) {
    throw new Error('Candidate image idle TTL must remain exactly seven days.');
  }
  const candidateTreeDigest = hash(`git-tree:${candidateTree}`);
  const candidateCommitDigest = hash(`git-commit:${candidateCommit}`);
  const identity = {
    schemaVersion: policy.schemaVersion,
    imageKind: policy.imageKind,
    candidateTreeDigest,
    candidateCommitDigest,
    imageInputDigest: closure.imageInputDigest,
    platform: policy.platform,
  };
  const cacheKey = hash(canonicalJson(identity));
  const canonicalTag = `${policy.tagPrefix}-${cacheKey}`;
  if (!CACHE_TAG.test(canonicalTag))
    throw new Error('Candidate image cache tag schema is invalid.');
  const forced = forceReason.trim().length > 0;
  return {
    ...identity,
    cacheKey,
    candidateTree,
    candidateCommit,
    repository: policy.repository,
    canonicalTag,
    reference: `${policy.repository}:${canonicalTag}`,
    forceReason: forceReason.trim(),
    forced,
    quarantined: policy.quarantinedKeys.includes(cacheKey),
    labels: {
      'dev.sniptale.candidate-cache.schema': String(policy.schemaVersion),
      'dev.sniptale.candidate-cache.key': cacheKey,
      'dev.sniptale.candidate-tree': candidateTreeDigest,
      'dev.sniptale.image-inputs': closure.imageInputDigest,
      'dev.sniptale.platform': policy.platform,
      'org.opencontainers.image.revision': candidateCommit,
      'org.opencontainers.image.source': 'https://github.com/lrozhkov/sniptale',
    },
    baseImageDigest: closure.baseImageDigest,
  };
}

function platformName(platform) {
  return `${platform?.os ?? ''}/${platform?.architecture ?? ''}${platform?.variant ? `/${platform.variant}` : ''}`;
}

export function normalizeBuildxInspection(value) {
  const manifest = value.Manifest ?? value.manifest ?? value;
  const image = value.Image ?? value.image ?? {};
  const provenance = value.Provenance?.SLSA ?? value.provenance ?? {};
  return {
    digest: manifest.Digest ?? manifest.digest,
    manifests: (manifest.Manifests ?? manifest.manifests ?? [])
      .filter((entry) => {
        const platform = entry.Platform ?? entry.platform;
        const annotations = entry.Annotations ?? entry.annotations ?? {};
        return !(
          platform?.os === 'unknown' &&
          platform?.architecture === 'unknown' &&
          annotations['vnd.docker.reference.type'] === 'attestation-manifest'
        );
      })
      .map((entry) => ({
        digest: entry.Digest ?? entry.digest,
        platform: entry.Platform ?? entry.platform,
      })),
    labels: image.Config?.Labels ?? image.config?.Labels ?? image.config?.labels ?? {},
    provenance: {
      subjects: (provenance.subject ?? provenance.subjects ?? []).map(
        (entry) => entry.digest?.sha256 ?? entry.digest ?? entry
      ),
      materials: (
        provenance.predicate?.buildDefinition?.resolvedDependencies ??
        provenance.materials ??
        []
      ).map((entry) => entry.digest?.sha256 ?? entry.digest ?? entry),
    },
  };
}

export function verifyCandidateImageLookup(plan, inspection) {
  if (!SHA256.test(inspection.digest ?? ''))
    throw new Error('Candidate image OCI digest is invalid.');
  if (
    inspection.manifests.length !== 1 ||
    platformName(inspection.manifests[0].platform) !== plan.platform ||
    !SHA256.test(inspection.manifests[0].digest ?? '')
  ) {
    throw new Error('Candidate image must contain exactly one expected platform manifest.');
  }
  for (const [name, expected] of Object.entries(plan.labels)) {
    if (inspection.labels[name] !== expected)
      throw new Error(`Candidate image label mismatch: ${name}`);
  }
  const subjectDigests = [inspection.digest, inspection.manifests[0].digest].map((digest) =>
    digest.slice('sha256:'.length)
  );
  if (!subjectDigests.some((digest) => inspection.provenance.subjects.includes(digest))) {
    throw new Error('Candidate image provenance does not bind the selected OCI digest.');
  }
  if (!inspection.provenance.materials.includes(plan.baseImageDigest.slice('sha256:'.length))) {
    throw new Error('Candidate image provenance does not bind the Docker base image.');
  }
  if (plan.quarantined) throw new Error('Candidate image cache key is quarantined.');
  return {
    action: 'reuse',
    digest: inspection.digest,
    reference: `${plan.repository}@${inspection.digest}`,
  };
}

export function decideCandidateImageSelection(plan, inspection = null) {
  if (plan.forced) {
    return {
      action: 'force-build',
      tag: `forced-${plan.cacheKey}-${hash(plan.forceReason).slice(0, 12)}`,
    };
  }
  if (plan.quarantined) throw new Error('Candidate image cache key is quarantined.');
  if (!inspection) return { action: 'build', tag: plan.canonicalTag };
  return verifyCandidateImageLookup(plan, inspection);
}

export function classifyCandidateVersionsForSweep({
  versions,
  useReceipts,
  nowEpochSeconds,
  policy,
}) {
  if (policy.idleTtlSeconds !== CANDIDATE_IMAGE_IDLE_TTL_SECONDS) {
    throw new Error('Candidate image idle TTL must remain exactly seven days.');
  }
  const lastUse = new Map();
  for (const receipt of useReceipts) {
    if (
      !receipt.verified ||
      !SHA256.test(receipt.digest ?? '') ||
      !Number.isInteger(receipt.usedAt)
    )
      continue;
    lastUse.set(receipt.digest, Math.max(lastUse.get(receipt.digest) ?? 0, receipt.usedAt));
  }
  return versions.map((version) => {
    const tags = version.tags ?? [];
    const candidateTags = tags.filter((tag) => CACHE_TAG.test(tag));
    const foreignTags = tags.filter((tag) => !CACHE_TAG.test(tag));
    let reason = 'eligible';
    if (version.package !== policy.repository) reason = 'foreign-package';
    else if (!SHA256.test(version.digest ?? '')) reason = 'invalid-digest';
    else if (candidateTags.length !== 1) reason = 'missing-or-ambiguous-candidate-tag';
    else if (foreignTags.length > 0) reason = 'shared-or-stable-tag';
    else if (version.labels?.['dev.sniptale.candidate-cache.key'] !== candidateTags[0].slice(-64))
      reason = 'foreign-labels';
    else if (version.labels?.['dev.sniptale.quarantined'] === 'true') reason = 'quarantined';
    const liveness = lastUse.get(version.digest) ?? version.createdAt;
    if (
      reason === 'eligible' &&
      (!Number.isInteger(liveness) || nowEpochSeconds - liveness < policy.idleTtlSeconds)
    ) {
      reason = 'live';
    }
    return {
      versionId: version.id,
      digest: version.digest,
      delete: reason === 'eligible',
      reason,
      liveness,
    };
  });
}

export function createUseReceipt(plan, digest, { runId, runAttempt, usedAt }) {
  if (
    !SHA256.test(digest ?? '') ||
    !/^\d+$/u.test(String(runId)) ||
    !/^\d+$/u.test(String(runAttempt))
  ) {
    throw new Error('Candidate image use receipt identity is invalid.');
  }
  return {
    schemaVersion: 1,
    artifactKind: 'sniptale-candidate-image-use',
    cacheKey: plan.cacheKey,
    candidateTreeDigest: plan.candidateTreeDigest,
    candidateCommitDigest: plan.candidateCommitDigest,
    imageInputDigest: plan.imageInputDigest,
    platform: plan.platform,
    forced: plan.forced,
    forceReasonDigest: plan.forced ? hash(plan.forceReason) : null,
    digest,
    workflowRunId: String(runId),
    workflowRunAttempt: String(runAttempt),
    usedAt,
    verified: true,
  };
}

function output(name, value) {
  const destination = process.env.GITHUB_OUTPUT;
  if (destination) fs.appendFileSync(destination, `${name}=${value}\n`);
}

function inspect(reference) {
  const result = spawnSync(
    'docker',
    ['buildx', 'imagetools', 'inspect', reference, '--format', '{{json .}}'],
    {
      encoding: 'utf8',
    }
  );
  if (result.status !== 0) {
    if (/manifest unknown|not found|no such manifest/iu.test(result.stderr)) return null;
    throw new Error(`Unable to inspect candidate image cache binding: ${result.stderr.trim()}`);
  }
  return normalizeBuildxInspection(JSON.parse(result.stdout));
}

if (isExecutedAsScript(import.meta.url)) {
  const [mode, rootValue = '.', planPath = 'build/candidate-image/plan.json'] =
    process.argv.slice(2);
  const root = path.resolve(rootValue);
  if (mode === 'derive') {
    const policyRoot = path.resolve(process.env.SNIPTALE_POLICY_ROOT ?? root);
    const policyAuthority = JSON.parse(
      fs.readFileSync(
        path.join(policyRoot, 'tooling/configs/ci/candidate-image-cache.json'),
        'utf8'
      )
    );
    const imageKind = process.env.SNIPTALE_IMAGE_KIND ?? 'qa';
    const imagePolicy = policyAuthority.images?.[imageKind];
    if (!imagePolicy) throw new Error(`Unknown candidate image kind: ${imageKind}`);
    const policy = { ...policyAuthority, ...imagePolicy, imageKind };
    delete policy.images;
    const closure = deriveImageInputClosure(root, policy);
    const tree = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD^{tree}'], {
      encoding: 'utf8',
    }).stdout.trim();
    const commit = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).stdout.trim();
    const forceRequested = process.env.SNIPTALE_FORCE_REBUILD === 'true';
    const forceReason = process.env.SNIPTALE_FORCE_REBUILD_REASON ?? '';
    if (forceRequested && !forceReason.trim())
      throw new Error('Force rebuild requires a non-empty operator reason.');
    const plan = createCandidateImagePlan({
      candidateTree: tree,
      candidateCommit: commit,
      closure,
      policy,
      forceReason: forceRequested ? forceReason : '',
    });
    fs.mkdirSync(path.dirname(path.resolve(planPath)), { recursive: true });
    fs.writeFileSync(path.resolve(planPath), `${JSON.stringify(plan, null, 2)}\n`);
    output('plan', path.resolve(planPath));
    output(
      'tag',
      plan.forced
        ? `forced-${plan.cacheKey}-${hash(plan.forceReason).slice(0, 12)}`
        : plan.canonicalTag
    );
    output(
      'labels',
      Object.entries(plan.labels)
        .map(([key, value]) => `${key}=${value}`)
        .join(',')
    );
    output('cache-key', plan.cacheKey);
    output('candidate-tree-digest', plan.candidateTreeDigest);
    output('image-input-digest', plan.imageInputDigest);
  } else if (mode === 'lookup') {
    const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), 'utf8'));
    const selection = decideCandidateImageSelection(
      plan,
      plan.forced ? null : inspect(plan.reference)
    );
    output(`${plan.imageKind}-build`, selection.action.endsWith('build') ? 'true' : 'false');
    output(`${plan.imageKind}-digest`, selection.digest ?? '');
    output(`${plan.imageKind}-tag`, selection.tag ?? plan.canonicalTag);
  } else if (mode === 'verify-receipt') {
    const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), 'utf8'));
    const digest = process.env.SNIPTALE_IMAGE_DIGEST;
    const tag = process.env.SNIPTALE_IMAGE_TAG;
    const inspection = inspect(`${plan.repository}:${tag}`);
    if (!inspection) throw new Error('Built candidate image tag is missing from GHCR.');
    const verified = verifyCandidateImageLookup({ ...plan, quarantined: false }, inspection);
    if (verified.digest !== digest)
      throw new Error('Candidate image tag collided with a different OCI digest.');
    const receipt = createUseReceipt(plan, digest, {
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      usedAt: Math.floor(Date.now() / 1000),
    });
    const destination = path.join(path.dirname(path.resolve(planPath)), 'use-receipt.json');
    fs.writeFileSync(destination, `${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    throw new Error(
      'Usage: candidate-image-cache.mjs <derive|lookup|verify-receipt> <root> [plan-path]'
    );
  }
}
