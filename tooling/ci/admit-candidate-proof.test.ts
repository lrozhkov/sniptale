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
import { expectedProofPopulationKind } from './proof-population-policy.mjs';

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

function populationFor(stepId: string) {
  const populationKind = expectedProofPopulationKind(stepId);
  return populationKind === 'repository-files'
    ? { scope: 'repo-wide', populationKind, scannedFileCount: 1 }
    : { scope: 'repo-wide', populationKind };
}

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

function refreshDeclaredFile(root: string, manifest: Record<string, any>, relative: string) {
  const file = manifest.files.find((entry: { file: string }) => entry.file === relative);
  file.sha256 = sha256(fs.readFileSync(path.join(root, relative)));
  resealArtifact(root, manifest);
}

function rebuildDeclaredFiles(root: string, manifest: Record<string, any>) {
  const files = [] as Array<{ file: string; sha256: string }>;
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else {
        const file = path.relative(root, absolute).replaceAll(path.sep, '/');
        if (!['proof-manifest.json', 'SHA256SUMS'].includes(file)) {
          files.push({ file, sha256: sha256(fs.readFileSync(absolute)) });
        }
      }
    }
  };
  visit(root);
  manifest.files = files.sort((left, right) => left.file.localeCompare(right.file));
  resealArtifact(root, manifest);
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
    'tooling/configs/qa/codeql-proof-reuse.data.json',
    'tooling/configs/qa/coverage-proof-reuse.data.json',
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
    'tooling/configs/qa/codeql-proof-reuse.data.json',
    'tooling/configs/qa/coverage-proof-reuse.data.json',
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
  const unit = sealReceipt({
    schemaVersion: 1,
    artifactKind: 'sniptale-full-unit-proof',
    outcome: 'passed',
    inputDigest: '4'.repeat(64),
    execution: { suite: 'product' },
    planning: { maxWorkers: 1 },
    fileDigests: [],
    testFiles: [],
    producer: { controlDigest },
    reusedFrom: null,
  });
  write(artifact, '.tmp/qa/unit-proof.json', `${JSON.stringify(unit)}\n`);
  const coverageReportFiles = [
    'coverage-final.json',
    'coverage-summary.json',
    'html/index.html',
    'lcov.info',
  ];
  for (const file of coverageReportFiles) {
    write(artifact, `.tmp/coverage/canonical/${file}`, `${file}\n`);
  }
  const coverage = sealReceipt({
    schemaVersion: 1,
    artifactKind: 'sniptale-coverage-proof',
    outcome: 'passed',
    inputDigest: '6'.repeat(64),
    reports: coverageReportFiles.map((file) => ({
      file,
      sha256: sha256(fs.readFileSync(path.join(artifact, '.tmp/coverage/canonical', file))),
    })),
    producer: { controlDigest },
    reusedFrom: null,
  });
  write(artifact, '.tmp/qa/coverage-proof.json', `${JSON.stringify(coverage)}\n`);
  for (const file of [
    '.tmp/osv/results.json',
    '.tmp/gitleaks/report.json',
    '.tmp/npm-audit/results.json',
    '.tmp/npm-audit/signatures.json',
    '.tmp/licenses/summary.json',
    '.tmp/licenses/sbom.cdx.json',
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
      schemaVersion: 4,
      wrapperId: 'ci:proof',
      status: 'all-passed',
      exitCode: 0,
      parentRunId: null,
      repository: { head: commit },
      log: { path: log },
      steps: [
        ...controlMatrix.requiredPassed.map((stepId) => ({
          stepId,
          outcome: 'passed',
          population: populationFor(stepId),
        })),
        ...controlMatrix.allowedSkipped.map((stepId) => ({
          stepId,
          outcome: 'skipped',
          skipReasonId: controlMatrix.allowedSkippedReasons[stepId],
        })),
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
  const gateInputDigest = createFastGateInputDigest({
    cwd: candidate,
    policyRoot: trusted,
  });
  const executionEnvironment = {
    kind: 'locked-container',
    digest: `sha256:${'3'.repeat(64)}`,
  };
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
    fullVitest: true,
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
      'runtime-parity',
      'install',
      'verify-project-toolchain',
      'validate-workflows',
      'provision-canvas',
      'verify-canvas',
      'provision-ast-grep',
      'verify-ast-grep',
      'proof',
    ].map((id) => ({ id, status: 'passed' })),
    proofReuse: {
      build: 'unavailable',
      unit: 'fresh',
      codeql: 'unavailable',
      coverage: 'fresh',
    },
    files,
  };
  resealArtifact(artifact, manifest);
  return { artifact, baseSha, candidate, commit, manifest, trusted };
}

function releaseFixture({ reused = false } = {}) {
  const value = fixture();
  const { artifact, commit, manifest } = value;
  const sourceManifestBytes = fs.readFileSync(path.join(artifact, 'proof-manifest.json'));
  write(artifact, 'fast-proof/proof-manifest.json', sourceManifestBytes.toString());
  const sourceRunRecord = '.tmp/qa-observability/runs/2026-08-23/run.json';
  const sourceRunLog = '.tmp/qa-logs/2026-08-23/run.log';
  write(
    artifact,
    `fast-proof/${sourceRunRecord}`,
    fs.readFileSync(path.join(artifact, sourceRunRecord), 'utf8')
  );
  write(
    artifact,
    `fast-proof/${sourceRunLog}`,
    fs.readFileSync(path.join(artifact, sourceRunLog), 'utf8')
  );
  const fastProofAdmission = {
    schemaVersion: 1,
    artifactKind: 'sniptale-fast-proof-admission',
    outcome: 'admitted',
    lane: 'proof',
    commit,
    candidateTree: manifest.candidateTree,
    controlDigest: manifest.controlDigest,
    executionEnvironment: manifest.executionEnvironment,
    proofSemanticDigest: manifest.proofSemanticDigest,
    proofManifestDigest: `sha256:${sha256(sourceManifestBytes)}`,
    sourceRunRecord,
    sourceRunLog,
    workspaceMode: manifest.workspaceMode,
  };
  write(artifact, '.tmp/ci/fast-proof-admission.json', `${JSON.stringify(fastProofAdmission)}\n`);
  const archive = 'build/sniptale_0.3.3_test.zip';
  write(artifact, archive, 'zip');
  const build = sealReceipt({
    schemaVersion: 1,
    artifactKind: 'sniptale-build-zip-proof',
    outcome: 'passed',
    inputDigest: '2'.repeat(64),
    archive: { file: path.basename(archive), sha256: sha256('zip') },
    producer: {
      id: 'qa-release-archive-owner',
      controlDigest: manifest.controlDigest,
    },
  });
  write(artifact, '.tmp/qa/build-proof.json', `${JSON.stringify(build)}\n`);
  const sarif = '.tmp/codeql/results.filtered.sarif';
  write(artifact, sarif, '{"version":"2.1.0","runs":[{"results":[]}]}\n');
  const codeql = sealReceipt({
    schemaVersion: 1,
    artifactKind: 'sniptale-codeql-proof',
    outcome: 'passed',
    inputDigest: '5'.repeat(64),
    sarifSha256: sha256(fs.readFileSync(path.join(artifact, sarif))),
    producer: { controlDigest: manifest.controlDigest },
    reusedFrom: reused ? { source: 'main-release' } : null,
  });
  write(artifact, '.tmp/qa/codeql-proof.json', `${JSON.stringify(codeql)}\n`);

  for (const file of [
    '.tmp/npm-audit/results.json',
    '.tmp/licenses/summary.json',
    '.tmp/licenses/sbom.cdx.json',
    '.tmp/mutation/persistence/results.json',
    '.tmp/mutation/secrets/results.json',
  ])
    write(artifact, file, '{}\n');

  const recordPath = '.tmp/qa-observability/runs/2026-08-23/run.json';
  const record = JSON.parse(fs.readFileSync(path.join(artifact, recordPath), 'utf8'));
  const controlMatrix = createTrustedControlMatrix('release');
  record.schemaVersion = 4;
  record.wrapperId = 'ci:release';
  record.steps = [
    ...controlMatrix.requiredPassed.map((stepId) => ({
      stepId,
      outcome: 'passed',
      population: populationFor(stepId),
    })),
    ...controlMatrix.requiredInherited.map((stepId) => ({
      stepId,
      outcome: 'inherited',
      inheritance: {
        sourceProofSemanticDigest: fastProofAdmission.proofSemanticDigest,
        sourceProofManifestDigest: fastProofAdmission.proofManifestDigest,
        sourceControlId: stepId,
        sourceRunRecord: `fast-proof/${sourceRunRecord}`,
        evidenceFiles: [`fast-proof/${sourceRunRecord}`, `fast-proof/${sourceRunLog}`],
      },
    })),
    ...controlMatrix.allowedSkipped.map((stepId) => ({
      stepId,
      outcome: 'skipped',
      skipReasonId: controlMatrix.allowedSkippedReasons[stepId],
    })),
  ];
  write(artifact, recordPath, `${JSON.stringify(record)}\n`);

  manifest.lane = 'release';
  manifest.gateClaim = 'release-provenance';
  manifest.releaseReady = true;
  manifest.phases = [
    'runtime-parity',
    'install',
    'verify-project-toolchain',
    'validate-workflows',
    'provision-canvas',
    'verify-canvas',
    'provision-ast-grep',
    'verify-ast-grep',
    'release',
  ].map((id) => ({ id, status: 'passed' }));
  manifest.proofReuse = {
    build: 'fresh',
    unit: 'inherited',
    codeql: reused ? 'reused' : 'fresh',
    coverage: 'inherited',
  };
  manifest.proofSemanticDigest = createProofSemanticDigest({
    lane: 'release',
    commit,
    candidateTree: manifest.candidateTree,
    trustedControlSha: commit,
    trustedControlDigest: manifest.trustedControlDigest,
    controlDigest: manifest.controlDigest,
    gateInputDigest: manifest.gateInputDigest,
    executionEnvironment: manifest.executionEnvironment,
  });
  rebuildDeclaredFiles(artifact, manifest);
  return value;
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
  ).toMatchObject({ outcome: 'admitted', derived: false });
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
  ).toMatchObject({ outcome: 'admitted' });
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
  const value = fixture({
    candidateControl: 'export const candidateGeneration = true;\n',
  });
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
    outcome: 'admitted',
    controlsChanged: true,
    controlDisposition: 'candidate-controls',
  });
});

it('rejects a candidate-control proof that conceals its control drift', () => {
  const value = fixture({
    candidateControl: 'export const candidateGeneration = true;\n',
  });
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
  const value = releaseFixture();
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
      lane: 'release',
      trustedRoot: value.trusted,
    })
  ).toThrow(/does not bind/u);
});

it('rejects a malformed unit receipt in the Fast proof lane', () => {
  const value = fixture();
  const relative = '.tmp/qa/unit-proof.json';
  const receipt = JSON.parse(fs.readFileSync(path.join(value.artifact, relative), 'utf8'));
  delete receipt.inputDigest;
  delete receipt.proofDigest;
  write(value.artifact, relative, `${JSON.stringify(sealReceipt(receipt))}\n`);
  refreshDeclaredFile(value.artifact, value.manifest, relative);

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
  ).toThrow(/Malformed candidate receipt: \.tmp\/qa\/unit-proof\.json/u);
});

it('derives unit reuse status from the validated receipt', () => {
  const value = fixture();
  const relative = '.tmp/qa/unit-proof.json';
  const receipt = JSON.parse(fs.readFileSync(path.join(value.artifact, relative), 'utf8'));
  receipt.reusedFrom = { source: 'main-proof' };
  delete receipt.proofDigest;
  write(value.artifact, relative, `${JSON.stringify(sealReceipt(receipt))}\n`);
  refreshDeclaredFile(value.artifact, value.manifest, relative);

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
  ).toThrow(/unit reuse status does not match its receipt/u);
});

it('rejects a unit receipt from a different QA control digest', () => {
  const value = fixture();
  const relative = '.tmp/qa/unit-proof.json';
  const receipt = JSON.parse(fs.readFileSync(path.join(value.artifact, relative), 'utf8'));
  receipt.producer.controlDigest = 'f'.repeat(64);
  delete receipt.proofDigest;
  write(value.artifact, relative, `${JSON.stringify(sealReceipt(receipt))}\n`);
  refreshDeclaredFile(value.artifact, value.manifest, relative);

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
  ).toThrow(/crosses QA control digests/u);
});

it('rejects a missing mandatory repository-file population at admission', () => {
  const value = fixture();
  const relative = '.tmp/qa-observability/runs/2026-08-23/run.json';
  const record = JSON.parse(fs.readFileSync(path.join(value.artifact, relative), 'utf8'));
  delete record.steps.find(({ stepId }: { stepId: string }) => stepId === 'qa.rule.oxlint')
    .population;
  write(value.artifact, relative, `${JSON.stringify(record)}\n`);
  refreshDeclaredFile(value.artifact, value.manifest, relative);

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
  ).toThrow('invalid trusted control population: qa.rule.oxlint');
});

it('admits a complete release proof whose receipts bind the admitted SARIF and reports', () => {
  for (const reused of [false, true]) {
    const value = releaseFixture({ reused });
    expect(
      admitCandidateProof({
        artifactRoot: value.artifact,
        baseSha: value.baseSha,
        candidateRoot: value.candidate,
        commit: value.commit,
        expectedTrustedControlSha: value.commit,
        lane: 'release',
        trustedRoot: value.trusted,
      })
    ).toMatchObject({ outcome: 'admitted', lane: 'release', derived: false });
  }
});

it('rejects inherited status for a release-only fresh control', () => {
  const value = releaseFixture();
  const relative = '.tmp/qa-observability/runs/2026-08-23/run.json';
  const record = JSON.parse(fs.readFileSync(path.join(value.artifact, relative), 'utf8'));
  const step = record.steps.find(
    ({ stepId }: { stepId: string }) => stepId === 'qa.rule.npm-audit'
  );
  step.outcome = 'inherited';
  write(value.artifact, relative, `${JSON.stringify(record)}\n`);
  refreshDeclaredFile(value.artifact, value.manifest, relative);

  expect(() =>
    admitCandidateProof({
      artifactRoot: value.artifact,
      baseSha: value.baseSha,
      candidateRoot: value.candidate,
      commit: value.commit,
      expectedTrustedControlSha: value.commit,
      lane: 'release',
      trustedRoot: value.trusted,
    })
  ).toThrow('did not pass mandatory trusted control: qa.rule.npm-audit');
});

it('rejects missing or tampered physical release evidence after manifest admission', () => {
  const missing = releaseFixture();
  fs.rmSync(path.join(missing.artifact, '.tmp/codeql/results.filtered.sarif'));
  expect(() =>
    admitCandidateProof({
      artifactRoot: missing.artifact,
      baseSha: missing.baseSha,
      candidateRoot: missing.candidate,
      commit: missing.commit,
      expectedTrustedControlSha: missing.commit,
      lane: 'release',
      trustedRoot: missing.trusted,
    })
  ).toThrow(/file digest mismatch/u);

  const tampered = releaseFixture();
  const sarif = '.tmp/codeql/results.filtered.sarif';
  fs.appendFileSync(path.join(tampered.artifact, sarif), 'tampered\n');
  refreshDeclaredFile(tampered.artifact, tampered.manifest, sarif);
  expect(() =>
    admitCandidateProof({
      artifactRoot: tampered.artifact,
      baseSha: tampered.baseSha,
      candidateRoot: tampered.candidate,
      commit: tampered.commit,
      expectedTrustedControlSha: tampered.commit,
      lane: 'release',
      trustedRoot: tampered.trusted,
    })
  ).toThrow(/CodeQL receipt does not bind the admitted SARIF/u);
});

it('rejects an admitted coverage report outside the receipt inventory', () => {
  const value = releaseFixture();
  write(value.artifact, '.tmp/coverage/canonical/html/extra.html', 'extra\n');
  rebuildDeclaredFiles(value.artifact, value.manifest);
  expect(() =>
    admitCandidateProof({
      artifactRoot: value.artifact,
      baseSha: value.baseSha,
      candidateRoot: value.candidate,
      commit: value.commit,
      expectedTrustedControlSha: value.commit,
      lane: 'release',
      trustedRoot: value.trusted,
    })
  ).toThrow(/Inherited Fast proof coverage HTML inventory drifted/u);
});

it('derives CodeQL fresh or reused polarity from the release receipt', () => {
  const value = releaseFixture();
  const relative = '.tmp/qa/codeql-proof.json';
  const receipt = JSON.parse(fs.readFileSync(path.join(value.artifact, relative), 'utf8'));
  receipt.reusedFrom = { source: 'main-release' };
  delete receipt.proofDigest;
  write(value.artifact, relative, `${JSON.stringify(sealReceipt(receipt))}\n`);
  refreshDeclaredFile(value.artifact, value.manifest, relative);
  expect(() =>
    admitCandidateProof({
      artifactRoot: value.artifact,
      baseSha: value.baseSha,
      candidateRoot: value.candidate,
      commit: value.commit,
      expectedTrustedControlSha: value.commit,
      lane: 'release',
      trustedRoot: value.trusted,
    })
  ).toThrow('codeql reuse status does not match its receipt');
});
