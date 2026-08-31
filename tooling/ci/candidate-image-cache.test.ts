import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_IMAGE_IDLE_TTL_SECONDS,
  classifyCandidateVersionsForSweep,
  createCandidateImagePlan,
  createUseReceipt,
  decideCandidateImageSelection,
  deriveImageInputClosure,
  normalizeBuildxInspection,
  verifyCandidateImageLookup,
} from './candidate-image-cache.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const authority = JSON.parse(
  fs.readFileSync(path.join(root, 'tooling/configs/ci/candidate-image-cache.json'), 'utf8')
);
const policy = { ...authority, ...authority.images.qa, imageKind: 'qa' };
const controllerPolicy = {
  ...authority,
  ...authority.images.controller,
  imageKind: 'controller',
};
const tree = 'a'.repeat(40);

function planFor(repoRoot = root) {
  return createCandidateImagePlan({
    candidateTree: tree,
    closure: deriveImageInputClosure(repoRoot, policy),
    policy,
  });
}

function validInspection(plan: ReturnType<typeof planFor>) {
  const digest = `sha256:${'b'.repeat(64)}`;
  return {
    digest,
    manifests: [
      {
        digest: `sha256:${'c'.repeat(64)}`,
        platform: { os: 'linux', architecture: 'amd64' },
      },
    ],
    labels: plan.labels,
    provenance: {
      subjects: [digest.slice(7)],
      attestedSubjects: [],
      materials: [plan.baseImageDigest.slice(7)],
    },
  };
}

describe('candidate image cache identity', () => {
  it('derives every Docker COPY input and all semantic build settings', () => {
    const closure = deriveImageInputClosure(root, policy);
    const paths = closure.entries.map((entry) => entry.path);
    expect(paths).toContain('tooling/ci/Dockerfile');
    expect(paths).toContain('.dockerignore');
    expect(paths).toContain('tooling/ci/install-toolchain.mjs');
    expect(paths).toContain('tooling/ci/runtime-parity.mjs');
    expect(paths).toContain('tooling/configs/ci/toolchain.lock.json');
    expect(paths).toContain('tooling/configs/ci/npm/package-lock.json');
    expect(paths).toContain('tooling/configs/ci/playwright/package-lock.json');
    expect(paths).toContain('tooling/test/mutation/package-lock.json');
    expect(paths.some((entry) => entry.includes('semgrep'))).toBe(false);
    expect(closure).toMatchObject({
      platform: 'linux/amd64',
      builderFrontend: 'dockerfile.v1/buildkit',
      provenanceMode: 'max',
      sbom: true,
    });
  });

  it('derives a separate trusted-controller tree and complete Docker closure', () => {
    const closure = deriveImageInputClosure(root, controllerPolicy);
    const entries = closure.entries.map((entry) => entry.path);
    expect(entries).toHaveLength(5);
    expect(entries).toEqual(
      expect.arrayContaining([
        'tooling/ci/selectel/Dockerfile.controller',
        'tooling/ci/selectel/sdk-controller.py',
        'tooling/configs/ci/openstack-controller-requirements.lock',
        'tooling/configs/ci/toolchain.lock.json',
        '.dockerignore',
      ])
    );
    const controller = createCandidateImagePlan({
      candidateTree: tree,
      closure,
      policy: controllerPolicy,
    });
    expect(controller.canonicalTag).toMatch(/^candidate-cache-v1-controller-[a-f0-9]{64}$/u);
    expect(controller.cacheKey).not.toBe(planFor().cacheKey);
  });

  it('invalidates the image digest for copied bytes, tree, build args, platform, and provenance settings', () => {
    const original = deriveImageInputClosure(root, policy);
    for (const change of [
      { buildArgs: { FEATURE: '1' } },
      { platform: 'linux/arm64' },
      { builderFrontend: 'dockerfile.v2/buildkit' },
      { provenanceMode: 'min' },
      { sbom: false },
    ]) {
      expect(deriveImageInputClosure(root, { ...policy, ...change }).imageInputDigest).not.toBe(
        original.imageInputDigest
      );
    }
    expect(planFor().cacheKey).not.toBe(
      createCandidateImagePlan({
        candidateTree: 'd'.repeat(40),
        closure: original,
        policy,
      }).cacheKey
    );
    expect(planFor().cacheKey).not.toBe(
      createCandidateImagePlan({
        candidateTree: tree,
        candidateCommit: 'e'.repeat(40),
        closure: original,
        policy,
      }).cacheKey
    );

    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-image-input-'));
    fs.mkdirSync(path.join(fixture, 'tooling/ci'), { recursive: true });
    fs.writeFileSync(
      path.join(fixture, 'tooling/ci/Dockerfile'),
      `FROM image@sha256:${'1'.repeat(64)}\nCOPY tooling/ci/input.txt /tmp/input.txt\nCOPY tooling/ci/Dockerfile /tmp/Dockerfile\n`
    );
    fs.writeFileSync(path.join(fixture, 'tooling/ci/input.txt'), 'before\n');
    fs.writeFileSync(path.join(fixture, '.dockerignore'), 'ignored\n');
    const before = deriveImageInputClosure(fixture, policy).imageInputDigest;
    fs.writeFileSync(path.join(fixture, 'tooling/ci/input.txt'), 'after\n');
    expect(deriveImageInputClosure(fixture, policy).imageInputDigest).not.toBe(before);
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  it('binds checksum-pinned remote ADD sources through the Dockerfile, not the local closure', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-image-remote-add-'));
    fs.mkdirSync(path.join(fixture, 'tooling/ci'), { recursive: true });
    const dockerfile = path.join(fixture, 'tooling/ci/Dockerfile');
    const checksum = '2'.repeat(64);
    fs.writeFileSync(
      dockerfile,
      `FROM image@sha256:${'1'.repeat(64)}\nADD --checksum=sha256:${checksum} https://example.test/tool.deb /tmp/tool.deb\n`
    );
    fs.writeFileSync(path.join(fixture, '.dockerignore'), 'ignored\n');
    const before = deriveImageInputClosure(fixture, policy);
    expect(before.entries.map((entry) => entry.path)).toEqual([
      '.dockerignore',
      'tooling/ci/Dockerfile',
    ]);
    fs.writeFileSync(
      dockerfile,
      `FROM image@sha256:${'1'.repeat(64)}\nADD --checksum=sha256:${'3'.repeat(64)} https://example.test/tool.deb /tmp/tool.deb\n`
    );
    expect(deriveImageInputClosure(fixture, policy).imageInputDigest).not.toBe(
      before.imageInputDigest
    );
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  it('uses one schema tag across attempts and requires a reason for a separate forced build', () => {
    const plan = planFor();
    expect(plan.canonicalTag).toMatch(/^candidate-cache-v1-qa-[a-f0-9]{64}$/u);
    expect(decideCandidateImageSelection(plan)).toEqual({
      action: 'build',
      tag: plan.canonicalTag,
    });
    const forced = createCandidateImagePlan({
      candidateTree: tree,
      closure: deriveImageInputClosure(root, policy),
      policy,
      forceReason: 'suspected corrupt browser layer',
    });
    expect(decideCandidateImageSelection(forced)).toMatchObject({
      action: 'force-build',
    });
    expect(decideCandidateImageSelection(forced).tag).not.toBe(plan.canonicalTag);
    expect(
      createUseReceipt(forced, `sha256:${'9'.repeat(64)}`, {
        runId: 1,
        runAttempt: 2,
        usedAt: 3,
      })
    ).toMatchObject({
      forced: true,
      forceReasonDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
  });
});

describe('candidate image lookup verification', () => {
  it('reuses only the exact immutable digest, platform, labels, and provenance', () => {
    const plan = planFor();
    const inspection = validInspection(plan);
    expect(verifyCandidateImageLookup(plan, inspection)).toEqual({
      action: 'reuse',
      digest: inspection.digest,
      reference: `${plan.repository}@${inspection.digest}`,
    });
    for (const invalid of [
      { ...inspection, digest: 'latest' },
      {
        ...inspection,
        manifests: [...inspection.manifests, inspection.manifests[0]],
      },
      {
        ...inspection,
        manifests: [
          {
            ...inspection.manifests[0],
            platform: { os: 'linux', architecture: 'arm64' },
          },
        ],
      },
      {
        ...inspection,
        labels: { ...inspection.labels, 'dev.sniptale.image-inputs': 'wrong' },
      },
      { ...inspection, provenance: { ...inspection.provenance, subjects: [] } },
      {
        ...inspection,
        provenance: { ...inspection.provenance, materials: [] },
      },
    ]) {
      expect(() => verifyCandidateImageLookup(plan, invalid)).toThrow();
    }
  });

  it('binds Buildx predicate-only provenance through its attestation descriptor', () => {
    const plan = planFor();
    const platformDigest = `sha256:${'b'.repeat(64)}`;
    const normalized = normalizeBuildxInspection([
      {
        Manifest: {
          Digest: `sha256:${'a'.repeat(64)}`,
          Manifests: [
            {
              Digest: platformDigest,
              Platform: { os: 'linux', architecture: 'amd64' },
            },
            {
              Digest: `sha256:${'c'.repeat(64)}`,
              Platform: { os: 'unknown', architecture: 'unknown' },
              Annotations: {
                'vnd.docker.reference.type': 'attestation-manifest',
                'vnd.docker.reference.digest': platformDigest,
              },
            },
          ],
        },
        Image: { Config: { Labels: plan.labels } },
      },
      {
        SLSA: {
          buildDefinition: {
            resolvedDependencies: [{ digest: { sha256: plan.baseImageDigest.slice(7) } }],
          },
        },
      },
    ]);
    expect(normalized.manifests).toHaveLength(1);
    expect(normalized.provenance.subjects).toEqual([]);
    expect(normalized.provenance.attestedSubjects).toEqual([platformDigest]);
    expect(verifyCandidateImageLookup(plan, normalized)).toMatchObject({ action: 'reuse' });

    expect(() =>
      verifyCandidateImageLookup(plan, {
        ...normalized,
        provenance: {
          ...normalized.provenance,
          attestedSubjects: [`sha256:${'d'.repeat(64)}`],
        },
      })
    ).toThrow('does not bind');
  });

  it('blocks repository-owned quarantine keys instead of silently rebuilding or reusing', () => {
    const base = planFor();
    const quarantined = createCandidateImagePlan({
      candidateTree: tree,
      closure: deriveImageInputClosure(root, policy),
      policy: { ...policy, quarantinedKeys: [base.cacheKey] },
    });
    expect(() => decideCandidateImageSelection(quarantined, validInspection(quarantined))).toThrow(
      'quarantined'
    );
  });
});

describe('candidate image liveness and safe sweep', () => {
  it('uses an exact seven-day idle boundary and verified use receipts refresh it', () => {
    expect(CANDIDATE_IMAGE_IDLE_TTL_SECONDS).toBe(604800);
    const plan = planFor();
    const digest = `sha256:${'e'.repeat(64)}`;
    const now = 2_000_000;
    const version = {
      id: 7,
      package: policy.repository,
      digest,
      tags: [plan.canonicalTag],
      labels: { 'dev.sniptale.candidate-cache.key': plan.cacheKey },
      createdAt: now - CANDIDATE_IMAGE_IDLE_TTL_SECONDS,
    };
    expect(
      classifyCandidateVersionsForSweep({
        versions: [version],
        useReceipts: [],
        nowEpochSeconds: now,
        policy,
      })[0].delete
    ).toBe(true);
    const receipt = createUseReceipt(plan, digest, {
      runId: 4,
      runAttempt: 2,
      usedAt: now - 1,
    });
    expect(
      classifyCandidateVersionsForSweep({
        versions: [version],
        useReceipts: [receipt],
        nowEpochSeconds: now,
        policy,
      })[0]
    ).toMatchObject({ delete: false, reason: 'live' });
  });

  it('preserves stable/shared, foreign, ambiguous, quarantined, and malformed versions', () => {
    const plan = planFor();
    const base = {
      id: 1,
      package: policy.repository,
      digest: `sha256:${'f'.repeat(64)}`,
      tags: [plan.canonicalTag],
      labels: { 'dev.sniptale.candidate-cache.key': plan.cacheKey },
      createdAt: 1,
    };
    const versions = [
      { ...base, id: 2, tags: [...base.tags, 'main'] },
      { ...base, id: 3, package: 'ghcr.io/other/package' },
      { ...base, id: 4, tags: [] },
      {
        ...base,
        id: 5,
        labels: { ...base.labels, 'dev.sniptale.quarantined': 'true' },
      },
      {
        ...base,
        id: 6,
        labels: { 'dev.sniptale.candidate-cache.key': '0'.repeat(64) },
      },
    ];
    const result = classifyCandidateVersionsForSweep({
      versions,
      useReceipts: [],
      nowEpochSeconds: CANDIDATE_IMAGE_IDLE_TTL_SECONDS + 2,
      policy,
    });
    expect(result.every((entry) => !entry.delete)).toBe(true);
    expect(result.map((entry) => entry.reason)).toEqual([
      'shared-or-stable-tag',
      'foreign-package',
      'missing-or-ambiguous-candidate-tag',
      'quarantined',
      'foreign-labels',
    ]);
  });
});
