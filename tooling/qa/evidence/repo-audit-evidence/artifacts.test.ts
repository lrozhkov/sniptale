import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from '../../core/test-helpers';
import {
  persistRepoAuditEvidence,
  persistRepoAuditTopology,
  REPO_AUDIT_EVIDENCE_PATH,
  REPO_AUDIT_TOPOLOGY_PATH,
} from './artifacts.mjs';

function expectSanitizedEvidenceArtifact(artifact: unknown) {
  expect(artifact).toMatchObject({
    schemaVersion: 1,
    artifactKind: 'repo-audit-evidence',
    findingCount: 2,
    repository: { root: '<repo>' },
    smellFindings: [
      { family: 'Second', file: 'src/second.ts', line: null },
      { family: 'Second', file: 'src/third.ts', line: null },
    ],
    smellFamilies: [{ family: 'Second', count: 2, examples: [] }],
    verification: {
      manualAuditSteps: [{ id: 'qa.rule.example' }],
      manualAuditTools: ['example.mjs'],
    },
    note: '<redacted>',
  });
}

function expectPrivateArtifactMode(rootDir: string) {
  if (process.platform === 'win32') return;
  expect(fs.statSync(path.join(rootDir, REPO_AUDIT_EVIDENCE_PATH)).mode & 0o777).toBe(0o600);
}

it('writes a sanitized evidence schema and replaces the previous inventory', () => {
  const rootDir = createTempRoot('repo-audit-evidence-');
  const sensitiveValues = ['sentinel-private-value'];
  const first = {
    generatedAt: '2026-07-16T00:00:00.000Z',
    repository: { root: rootDir },
    smellFindings: [{ family: 'First', file: 'src/first.ts', line: null }],
    smellFamilies: [{ family: 'First', count: 1, examples: [] }],
    loopholes: [],
    verification: {
      manualAuditSteps: [{ id: 'qa.rule.example' }],
      manualAuditTools: ['example.mjs'],
    },
    note: 'sentinel-private-value',
  };
  persistRepoAuditEvidence(first, { rootDir, sensitiveValues });
  persistRepoAuditEvidence(
    {
      ...first,
      smellFindings: [
        { family: 'Second', file: 'src/second.ts', line: null },
        { family: 'Second', file: 'src/third.ts', line: null },
      ],
      smellFamilies: [{ family: 'Second', count: 2, examples: [] }],
    },
    { rootDir, sensitiveValues }
  );

  const text = fs.readFileSync(path.join(rootDir, REPO_AUDIT_EVIDENCE_PATH), 'utf8');
  expectSanitizedEvidenceArtifact(JSON.parse(text));
  expect(text).not.toContain(rootDir);
  expect(text).not.toContain('sentinel-private-value');
  expect(text).not.toContain('"family": "First"');
  expect(fs.readdirSync(path.join(rootDir, '.tmp/repo-audit'))).toEqual(['evidence.json']);
  expectPrivateArtifactMode(rootDir);
});

it('rejects evidence whose bounded summaries disagree with retained findings', () => {
  const rootDir = createTempRoot('repo-audit-evidence-');

  expect(() =>
    persistRepoAuditEvidence(
      {
        generatedAt: '2026-07-16T00:00:00.000Z',
        repository: { root: rootDir },
        smellFindings: [{ family: 'Example', file: 'src/example.ts', line: null }],
        smellFamilies: [{ family: 'Example', count: 2, examples: ['src/example.ts'] }],
        loopholes: [],
        verification: { manualAuditSteps: [], manualAuditTools: [] },
      },
      { rootDir }
    )
  ).toThrow('Repo audit evidence family summary mismatch');
  expect(fs.existsSync(path.join(rootDir, REPO_AUDIT_EVIDENCE_PATH))).toBe(false);
});

it('rejects balanced family drift even when the aggregate count matches', () => {
  const rootDir = createTempRoot('repo-audit-evidence-');

  expect(() =>
    persistRepoAuditEvidence(
      {
        generatedAt: '2026-07-16T00:00:00.000Z',
        repository: { root: rootDir },
        smellFindings: [
          { family: 'First', file: 'src/first.ts', line: null },
          { family: 'Second', file: 'src/second.ts', line: null },
        ],
        smellFamilies: [{ family: 'First', count: 2, examples: ['src/first.ts'] }],
        loopholes: [],
        verification: { manualAuditSteps: [], manualAuditTools: [] },
      },
      { rootDir }
    )
  ).toThrow('Repo audit evidence family summary mismatch');
  expect(fs.existsSync(path.join(rootDir, REPO_AUDIT_EVIDENCE_PATH))).toBe(false);
});

it('persists every topology finding plus bounded rule examples', () => {
  const rootDir = createTempRoot('repo-audit-topology-');
  const findings = [
    { rule: 'repeated-prefix-naming', file: 'src/first.ts', message: 'first' },
    { rule: 'repeated-prefix-naming', file: 'src/second.ts', message: 'second' },
    { rule: 'ambiguous-facade-naming', file: 'src/third.ts', line: 4, message: 'third' },
  ];

  persistRepoAuditTopology(
    { files: findings.map(({ file }) => file), violations: findings },
    {
      rootDir,
    }
  );

  const artifact = JSON.parse(
    fs.readFileSync(path.join(rootDir, REPO_AUDIT_TOPOLOGY_PATH), 'utf8')
  );
  expect(artifact).toMatchObject({
    schemaVersion: 1,
    artifactKind: 'repo-audit-topology',
    scope: 'repository',
    findingCount: 3,
    findings,
  });
  expect(artifact.summaries).toContainEqual({
    rule: 'repeated-prefix-naming',
    count: 2,
    examples: [
      { file: 'src/first.ts', line: null, message: 'first' },
      { file: 'src/second.ts', line: null, message: 'second' },
    ],
  });
});

it('rejects a symlinked artifact directory without modifying the external target', () => {
  const rootDir = createTempRoot('repo-audit-root-');
  const externalRoot = createTempRoot('repo-audit-external-');
  const externalEvidence = path.join(externalRoot, 'evidence.json');
  fs.writeFileSync(externalEvidence, 'keep-me\n');
  fs.mkdirSync(path.join(rootDir, '.tmp'), { recursive: true });
  fs.symlinkSync(externalRoot, path.join(rootDir, '.tmp/repo-audit'), 'dir');

  expect(() =>
    persistRepoAuditEvidence(
      {
        generatedAt: '2026-07-16T00:00:00.000Z',
        repository: { root: rootDir },
        smellFindings: [],
        smellFamilies: [],
        loopholes: [],
        verification: { manualAuditSteps: [], manualAuditTools: [] },
      },
      { rootDir }
    )
  ).toThrow('unsafe repository path');
  expect(fs.readFileSync(externalEvidence, 'utf8')).toBe('keep-me\n');
});
