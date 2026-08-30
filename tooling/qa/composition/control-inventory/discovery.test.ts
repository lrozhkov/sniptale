import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { getSourceSnapshotStats } from '../../analysis/source/source-snapshot.mjs';
import {
  buildExecutableDiscovery,
  collectControlDiscovery,
  isPolicyConsumerEvidenceFile,
  projectExecutableManifestProof,
} from './discovery.mjs';
import { collectRepositoryExecutableOrigins } from './executable-origins/repository.mjs';

it('does not treat generated inventories as executable policy consumers', () => {
  expect(isPolicyConsumerEvidenceFile('tooling/configs/qa/control-dispositions.data.json')).toBe(
    false
  );
  expect(isPolicyConsumerEvidenceFile('tooling/configs/qa/technical-debt.data.json')).toBe(false);
  expect(isPolicyConsumerEvidenceFile('tooling/configs/qa/validation-manifest.json')).toBe(true);
  expect(isPolicyConsumerEvidenceFile('tooling/qa/wrappers/checkpoint.mjs')).toBe(true);
});

describe('executable discovery identity and reflection metadata', () => {
  it('joins controls and proof through exact identities without basename attribution', () => {
    const path = 'tooling/qa/core/owner/verify-example.mjs';
    const snapshotStatsBefore = getSourceSnapshotStats();
    const rows = buildExecutableDiscovery({
      controls: [
        {
          id: 'qa.rule.exact',
          source: path,
          proofFiles: ['tooling/qa/core/owner/verify-example.test.ts'],
        },
        {
          id: 'qa.rule.same-basename',
          source: 'tooling/qa/other/verify-example.mjs',
          proofFiles: ['tooling/qa/other/verify-example.test.ts'],
        },
      ],
      executableProof: new Map([[path, ['tooling/qa/core/owner/verify-example.manifest.test.ts']]]),
      originProjection: {
        targets: [path],
        origins: [
          {
            authority: path,
            id: `ast-entry:${path}#canonical-js-entry`,
            kind: 'canonical-production-AST-direct-entry',
            target: path,
          },
          {
            authority: 'package.json',
            id: `package-script:package.json#scripts.qa:example.target.${path}`,
            kind: 'package-script',
            scriptId: 'qa:example',
            target: path,
          },
        ],
      },
      readSource: () =>
        "import { isExecutedAsScript } from '../shared.mjs';\nif (isExecutedAsScript(import.meta.url)) run();\n",
    });

    expect(rows).toEqual([
      expect.objectContaining({
        path,
        controlIds: ['qa.rule.exact'],
        scriptIds: ['qa:example'],
        proofFiles: [
          'tooling/qa/core/owner/verify-example.manifest.test.ts',
          'tooling/qa/core/owner/verify-example.test.ts',
        ],
        entrypointKind: 'guarded',
        importSafety: 'safe',
      }),
    ]);
    expect(getSourceSnapshotStats()).toEqual(snapshotStatsBefore);
  });

  it('projects supplemental proof by exact source without basename attribution', () => {
    expect(
      projectExecutableManifestProof(
        [
          {
            claim: 'executable',
            source: 'tooling/qa/core/owner/verify-example.mjs',
            validationMode: 'fixture-test',
            testFiles: ['tooling/qa/core/verify-example.test.ts'],
            states: ['pass', 'fail'],
          },
        ],
        ['tooling/qa/core/owner/verify-example.mjs', 'tooling/qa/other/verify-example.mjs']
      )
    ).toEqual(
      new Map([
        ['tooling/qa/core/owner/verify-example.mjs', ['tooling/qa/core/verify-example.test.ts']],
      ])
    );
  });

  it('does not project control claims as supplemental executable proof', () => {
    const source = 'tooling/test/e2e/run-e2e.mjs';
    expect(
      projectExecutableManifestProof(
        [
          {
            claim: 'control',
            controlId: 'qa.rule.playwright',
            testFiles: ['playwright.test.ts'],
          },
        ],
        [source]
      )
    ).toEqual(new Map());
  });

  it('projects only existing exact executable targets to existing unique proof files', () => {
    const entries = JSON.parse(
      fs.readFileSync('tooling/configs/qa/validation-manifest.json', 'utf8')
    ).claims;
    const proof = projectExecutableManifestProof(
      entries,
      collectRepositoryExecutableOrigins().targets
    );
    const inventory = [...proof]
      .map(([target, proofFiles]) => ({ target, proofFiles }))
      .sort((left, right) => left.target.localeCompare(right.target));
    expect(inventory.length).toBeGreaterThan(0);
    for (const { target, proofFiles } of inventory) {
      expect(fs.existsSync(target)).toBe(true);
      expect(proofFiles.length).toBeGreaterThan(0);
      expect(new Set(proofFiles).size).toBe(proofFiles.length);
      expect(proofFiles.every((proofFile) => fs.existsSync(proofFile))).toBe(true);
    }
  }, 60_000);

  it('retains discriminated validation claims alongside exact validation entries', () => {
    const discovery = collectControlDiscovery();
    expect(discovery.validationClaims).toEqual(
      discovery.validationEntries.map((entry) =>
        entry.claim === 'control'
          ? { claim: 'control', controlId: entry.controlId }
          : { claim: 'executable', source: entry.source }
      )
    );
    expect(
      discovery.validationEntries
        .filter(({ claim }) => claim === 'executable')
        .every(({ source }) => fs.existsSync(source))
    ).toBe(true);
  }, 60_000);

  it('keeps semantic control proof on the stable tool projection', () => {
    const discovery = collectControlDiscovery();
    expect(discovery.controls.find(({ id }) => id === 'qa.rule.harness-qa')).toMatchObject({
      source: 'tooling/qa/composition/harness/harness-freshness-step.mjs',
      tool: 'verify-harness.state.helpers.mjs',
      proofFiles: ['tooling/qa/composition/harness/harness-freshness-step.test.ts'],
    });
    expect(
      discovery.controls.find(({ id }) => id === 'qa.rule.structural-audit')?.proofFiles
    ).toEqual(expect.arrayContaining(['tooling/qa/wrappers/structural-audit.test.ts']));
  }, 60_000);

  it('records process-only non-JavaScript targets without pretending they are importable', () => {
    const path = 'tooling/ci/example.py';
    const rows = buildExecutableDiscovery({
      controls: [],
      originProjection: {
        targets: [path],
        origins: [
          {
            authority: 'tooling/ci/runner.mjs',
            id: `internal:tooling/ci/runner.mjs#spawn.target.${path}`,
            kind: 'internal-process-target',
            target: path,
          },
        ],
      },
      readSource: () => '',
    });

    expect(rows[0]).toEqual(
      expect.objectContaining({
        entrypointKind: 'process-target',
        importSafety: 'not-applicable',
        origins: [`internal:tooling/ci/runner.mjs#spawn.target.${path}`],
      })
    );
  });
});
