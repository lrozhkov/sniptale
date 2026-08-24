import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { afterEach, expect, it } from 'vitest';

import { admitCandidateProof } from './admit-candidate-proof.mjs';
import { createProofSemanticDigest } from './artifacts.mjs';
import { createCandidateControlDigest } from './control-digest.mjs';
import { createFastGateInputDigest } from './fast-gate-inputs.mjs';
import { createTrustedControlMatrix } from './trusted-control-matrix.mjs';

const roots: string[] = [];
const sha256 = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

function write(root: string, relative: string, contents: string) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function sealReceipt(value: Record<string, unknown>) {
  return { ...value, proofDigest: sha256(stable(value)) };
}

function resealArtifact(root: string, manifest: Record<string, any>) {
  write(root, 'proof-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const sums = [
    ...manifest.files.map(({ file, sha256: digest }: any) => `${digest}  ${file}`),
    `${sha256(fs.readFileSync(path.join(root, 'proof-manifest.json')))}  proof-manifest.json`,
  ];
  write(root, 'SHA256SUMS', `${sums.join('\n')}\n`);
}

function fixture({ candidateControl = 'export {};\n' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-admission-'));
  roots.push(root);
  const trusted = path.join(root, 'trusted');
  const candidate = path.join(root, 'candidate');
  const artifact = path.join(root, 'artifact');
  fs.mkdirSync(artifact);
  for (const relative of [
    'tooling/configs/ci/trusted-admission-policy.json',
    'tooling/configs/ci/proof-semantics.json',
    'tooling/configs/qa/audit-profiles.data.json',
  ])
    write(trusted, relative, fs.readFileSync(relative, 'utf8'));
  const fastPolicy = JSON.parse(
    fs.readFileSync('tooling/configs/ci/fast-gate-inputs.json', 'utf8')
  );
  fastPolicy.roots = ['tooling'];
  fastPolicy.files = ['package.json'];
  fastPolicy.ownerClosures = [];
  write(trusted, 'tooling/configs/ci/fast-gate-inputs.json', `${JSON.stringify(fastPolicy)}\n`);
  write(candidate, 'tooling/configs/ci/fast-gate-inputs.json', `${JSON.stringify(fastPolicy)}\n`);
  write(candidate, 'tooling/qa/check.mjs', candidateControl);
  write(candidate, 'package.json', '{}\n');
  write(trusted, 'tooling/qa/check.mjs', 'export {};\n');
  write(trusted, 'package.json', '{}\n');
  for (const relative of [
    'tooling/configs/ci/trusted-admission-policy.json',
    'tooling/configs/ci/proof-semantics.json',
    'tooling/configs/qa/audit-profiles.data.json',
  ]) {
    write(candidate, relative, fs.readFileSync(path.join(trusted, relative), 'utf8'));
  }
  execFileSync('git', ['-C', candidate, 'init', '--quiet']);
  execFileSync('git', ['-C', candidate, 'config', 'user.email', 'qa@example.invalid']);
  execFileSync('git', ['-C', candidate, 'config', 'user.name', 'QA']);
  execFileSync('git', ['-C', candidate, 'add', '.']);
  execFileSync('git', ['-C', candidate, 'commit', '--quiet', '-m', 'candidate']);
  const commit = execFileSync('git', ['-C', candidate, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const tree = execFileSync('git', ['-C', candidate, 'rev-parse', 'HEAD^{tree}'], {
    encoding: 'utf8',
  }).trim();
  const controlDigest = createCandidateControlDigest({ cwd: candidate });
  const trustedControlDigest = createCandidateControlDigest({ cwd: trusted });
  const baseSha = '1'.repeat(40);
  const archive = 'build/sniptale_0.3.3_test.zip';
  write(artifact, archive, 'zip');
  const build = sealReceipt({
    schemaVersion: 1,
    artifactKind: 'sniptale-build-zip-proof',
    outcome: 'passed',
    inputDigest: '2'.repeat(64),
    archive: { file: path.basename(archive), sha256: sha256('zip') },
    producer: { id: 'qa-release-archive-owner', controlDigest },
  });
  write(artifact, '.tmp/qa/build-proof.json', `${JSON.stringify(build)}\n`);
  for (const file of [
    '.tmp/semgrep/results.json',
    '.tmp/semgrep/results.sarif',
    '.tmp/osv/results.json',
    '.tmp/gitleaks/report.json',
    '.tmp/npm-audit/results.json',
    '.tmp/npm-audit/signatures.json',
  ])
    write(artifact, file, '{}\n');
  const log = '.tmp/qa-logs/2026-08-23/run.log';
  write(artifact, log, 'passed\n');
  const record = '.tmp/qa-observability/runs/2026-08-23/run.json';
  const controlMatrix = createTrustedControlMatrix('proof');
  write(
    artifact,
    record,
    `${JSON.stringify({
      schemaVersion: 3,
      wrapperId: 'ci:proof',
      status: 'all-passed',
      exitCode: 0,
      parentRunId: null,
      repository: { head: commit },
      log: { path: log },
      steps: [
        ...controlMatrix.requiredPassed.map((stepId) => ({ stepId, outcome: 'passed' })),
        ...controlMatrix.allowedSkipped.map((stepId) => ({ stepId, outcome: 'skipped' })),
      ],
      timeline: { events: [], activities: [] },
    })}\n`
  );
  const files = [] as Array<{ file: string; sha256: string }>;
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else {
        const file = path.relative(artifact, absolute).replaceAll(path.sep, '/');
        files.push({ file, sha256: sha256(fs.readFileSync(absolute)) });
      }
    }
  };
  visit(artifact);
  files.sort((a, b) => a.file.localeCompare(b.file));
  const gateInputDigest = createFastGateInputDigest({ cwd: candidate, policyRoot: trusted });
  const executionEnvironment = { kind: 'locked-container', digest: `sha256:${'3'.repeat(64)}` };
  const semantics = JSON.parse(fs.readFileSync('tooling/configs/ci/proof-semantics.json', 'utf8'));
  const executionProfile = {
    cpuTokens: 12,
    memoryMiB: 18432,
    vitestWorkers: 1,
    playwrightWorkers: 1,
    securityWorkers: 1,
  };
  const manifest: Record<string, any> = {
    schemaVersion: 1,
    artifactKind: 'sniptale-ci-proof',
    lane: 'proof',
    status: 'passed',
    evidenceDisposition: 'executed',
    commit,
    baseSha,
    candidateTree: tree,
    workspaceMode: 'committed',
    trustedControlSha: commit,
    controlAuthority: 'trusted-base',
    trustedControlDigest,
    controlsChanged: controlDigest !== trustedControlDigest,
    controlDisposition:
      controlDigest === trustedControlDigest ? 'trusted-controls' : 'candidate-controls',
    gateClaim: 'fast-pr-gate',
    fullVitest: false,
    releaseReady: false,
    controlDigest,
    gateInputDigest,
    executionEnvironment,
    containerDigest: executionEnvironment.digest,
    executionProfile,
    reuseCompatibility: {
      outcome: 'compatible',
      authority: semantics.reuseCompatibility.authority,
    },
    proofSemanticDigest: createProofSemanticDigest({
      lane: 'proof',
      commit,
      candidateTree: tree,
      trustedControlSha: commit,
      trustedControlDigest,
      controlDigest,
      gateInputDigest,
      executionEnvironment,
    }),
    phases: [
      'install',
      'verify-project-toolchain',
      'provision-canvas',
      'verify-canvas',
      'provision-ast-grep',
      'verify-ast-grep',
      'proof',
    ].map((id) => ({ id, status: 'passed' })),
    proofReuse: {
      build: 'fresh',
      unit: 'unavailable',
      codeql: 'unavailable',
      coverage: 'unavailable',
    },
    files,
  };
  resealArtifact(artifact, manifest);
  return { artifact, baseSha, candidate, commit, manifest, trusted };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it('admits a complete candidate proof only through trusted-base policy', () => {
  const value = fixture();
  expect(
    admitCandidateProof({
      artifactRoot: value.artifact,
      baseSha: value.baseSha,
      candidateRoot: value.candidate,
      commit: value.commit,
      expectedTrustedControlSha: value.commit,
      lane: 'proof',
      trustedRoot: value.trusted,
    })
  ).toMatchObject({ outcome: 'passed', derived: false });
});

it('rejects missing phases or profile authority without imposing resource minimums', () => {
  const missing = fixture();
  missing.manifest.phases.pop();
  resealArtifact(missing.artifact, missing.manifest);
  expect(() =>
    admitCandidateProof({
      artifactRoot: missing.artifact,
      baseSha: missing.baseSha,
      candidateRoot: missing.candidate,
      commit: missing.commit,
      expectedTrustedControlSha: missing.commit,
      lane: 'proof',
      trustedRoot: missing.trusted,
    })
  ).toThrow(/phase sequence/u);
  const weak = fixture();
  weak.manifest.executionProfile.cpuTokens = 2;
  resealArtifact(weak.artifact, weak.manifest);
  expect(
    admitCandidateProof({
      artifactRoot: weak.artifact,
      baseSha: weak.baseSha,
      candidateRoot: weak.candidate,
      commit: weak.commit,
      expectedTrustedControlSha: weak.commit,
      lane: 'proof',
      trustedRoot: weak.trusted,
    })
  ).toMatchObject({ outcome: 'passed' });
  const unowned = fixture();
  delete unowned.manifest.reuseCompatibility.authority;
  resealArtifact(unowned.artifact, unowned.manifest);
  expect(() =>
    admitCandidateProof({
      artifactRoot: unowned.artifact,
      baseSha: unowned.baseSha,
      candidateRoot: unowned.candidate,
      commit: unowned.commit,
      expectedTrustedControlSha: unowned.commit,
      lane: 'proof',
      trustedRoot: unowned.trusted,
    })
  ).toThrow(/execution profile/u);
});

it('admits candidate control drift once and records the explicit authority disposition', () => {
  const value = fixture({ candidateControl: 'export const candidateGeneration = true;\n' });
  expect(
    admitCandidateProof({
      artifactRoot: value.artifact,
      baseSha: value.baseSha,
      candidateRoot: value.candidate,
      commit: value.commit,
      expectedTrustedControlSha: value.commit,
      lane: 'proof',
      trustedRoot: value.trusted,
    })
  ).toMatchObject({
    outcome: 'passed',
    controlsChanged: true,
    controlDisposition: 'candidate-controls',
  });
});

it('rejects a candidate-control proof that conceals its control drift', () => {
  const value = fixture({ candidateControl: 'export const candidateGeneration = true;\n' });
  value.manifest.controlsChanged = false;
  value.manifest.controlDisposition = 'trusted-controls';
  resealArtifact(value.artifact, value.manifest);
  expect(() =>
    admitCandidateProof({
      artifactRoot: value.artifact,
      baseSha: value.baseSha,
      candidateRoot: value.candidate,
      commit: value.commit,
      expectedTrustedControlSha: value.commit,
      lane: 'proof',
      trustedRoot: value.trusted,
    })
  ).toThrow(/identity does not match/u);
});

it('rejects proof reuse across candidate control digests', () => {
  const value = fixture();
  const relative = '.tmp/qa/build-proof.json';
  const receipt = JSON.parse(fs.readFileSync(path.join(value.artifact, relative), 'utf8'));
  receipt.producer.controlDigest = `sha256:${'f'.repeat(64)}`;
  delete receipt.proofDigest;
  write(value.artifact, relative, `${JSON.stringify(sealReceipt(receipt))}\n`);
  const file = value.manifest.files.find((entry: { file: string }) => entry.file === relative);
  file.sha256 = sha256(fs.readFileSync(path.join(value.artifact, relative)));
  resealArtifact(value.artifact, value.manifest);

  expect(() =>
    admitCandidateProof({
      artifactRoot: value.artifact,
      baseSha: value.baseSha,
      candidateRoot: value.candidate,
      commit: value.commit,
      expectedTrustedControlSha: value.commit,
      lane: 'proof',
      trustedRoot: value.trusted,
    })
  ).toThrow(/does not bind/u);
});
