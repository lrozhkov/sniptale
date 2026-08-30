import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  loadValidationManifest,
  parseValidationManifest,
  validationClaimIdentity,
} from './manifest.mjs';
import { collectRepositoryExecutableOrigins } from '../../composition/control-inventory/executable-origins/repository.mjs';
import { QA_RULE_DEFINITIONS } from '../../composition/catalog/definitions.mjs';

type ValidationClaim = {
  claim: 'control' | 'executable';
  controlId?: string;
  source?: string;
  validationMode: string;
  testFiles: string[];
  states: string[];
};

const manifest = JSON.parse(
  fs.readFileSync('tooling/configs/qa/validation-manifest.json', 'utf8')
) as {
  $comment: string;
  schemaVersion: number;
  claims: ValidationClaim[];
};

const controlIds = new Set(QA_RULE_DEFINITIONS.map(({ id }) => id));
const executableTargets = new Set(collectRepositoryExecutableOrigins().targets);

function parse(value: typeof manifest) {
  return parseValidationManifest(value, {
    controlExists: (controlId) => controlIds.has(controlId),
    sourceExists: (source) => executableTargets.has(source),
    testExists: (testFile) => fs.existsSync(testFile),
  });
}

describe('validation manifest claim contract', () => {
  it('loads every live claim through the sole strict parser', () => {
    expect(Object.keys(manifest).sort()).toEqual(['$comment', 'claims', 'schemaVersion']);
    expect(manifest.schemaVersion).toBe(3);
    expect(
      loadValidationManifest({
        controlExists: (controlId) => controlIds.has(controlId),
        executableExists: (source) => executableTargets.has(source),
      })
    ).toEqual(parse(manifest));
  });

  it('links every claim to exactly one live canonical identity', () => {
    const claims = parse(manifest);
    expect(claims.every(({ claim }) => claim === 'control' || claim === 'executable')).toBe(true);
    expect(new Set(claims.map(validationClaimIdentity)).size).toBe(claims.length);
    for (const claim of claims) {
      if (claim.claim === 'control') expect(controlIds.has(claim.controlId)).toBe(true);
      else expect(executableTargets.has(claim.source)).toBe(true);
    }
  });

  it('records declarations honestly and keeps audited relationships on their real fixtures', () => {
    expect(manifest.$comment).toMatch(/^Declared proof relationships/u);
    expect(
      manifest.claims.find(
        ({ claim, controlId }) => claim === 'control' && controlId === 'qa.rule.i18n'
      )?.testFiles
    ).toEqual(['tooling/qa/composition/control-inventory/verify-quality-gates-core.i18n.test.ts']);
    expect(
      manifest.claims.find(
        ({ claim, controlId }) => claim === 'control' && controlId === 'qa.rule.harness-qa'
      )?.testFiles
    ).toEqual(['tooling/qa/composition/harness/harness-freshness-step.test.ts']);
    expect(manifest.claims).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claim: 'executable',
          source: 'tooling/qa/composition/control-inventory/verify-qa-rule-coverage-contract.mjs',
        }),
        expect.objectContaining({
          claim: 'executable',
          source: 'tooling/qa/policy/technical-debt/verify-technical-debt.mjs',
        }),
      ])
    );
  });

  it('rejects hybrid rows, unknown claim kinds, identities, and modes', () => {
    const hybrid = structuredClone(manifest);
    Object.assign(hybrid.claims[0], { source: 'tooling/qa/example.mjs' });
    expect(() => parse(hybrid)).toThrow(/keys must be exactly/u);

    const unknownKind = structuredClone(manifest);
    unknownKind.claims[0].claim = 'banana' as 'control';
    expect(() => parse(unknownKind)).toThrow(/claim must be control or executable/u);

    const unknownControl = structuredClone(manifest);
    const controlClaim = unknownControl.claims.find(({ claim }) => claim === 'control')!;
    controlClaim.controlId = 'qa.rule.not-registered';
    expect(() => parse(unknownControl)).toThrow(/control does not exist/u);

    const unknownExecutable = structuredClone(manifest);
    const executableClaim = unknownExecutable.claims.find(({ claim }) => claim === 'executable')!;
    executableClaim.source = 'tooling/qa/not-an-executable.mjs';
    expect(() => parse(unknownExecutable)).toThrow(/executable source does not exist/u);

    const unknownMode = structuredClone(manifest);
    unknownMode.claims[0].validationMode = 'banana';
    expect(() => parse(unknownMode)).toThrow(/validationMode is unsupported/u);
  });

  it('rejects duplicate identities, states, tests, and skip-only proof', () => {
    const duplicate = structuredClone(manifest);
    duplicate.claims.push(structuredClone(duplicate.claims[0]));
    expect(() => parse(duplicate)).toThrow(/duplicate validation claim/u);

    const duplicateState = structuredClone(manifest);
    duplicateState.claims[0].states = ['pass', 'fail', 'fail'];
    expect(() => parse(duplicateState)).toThrow(/unique strings/u);

    const duplicateTest = structuredClone(manifest);
    duplicateTest.claims[0].testFiles.push(duplicateTest.claims[0].testFiles[0]);
    expect(() => parse(duplicateTest)).toThrow(/unique strings/u);

    const skipOnly = structuredClone(manifest);
    skipOnly.claims[0].states = ['skip'];
    expect(() => parse(skipOnly)).toThrow(/must prove pass and fail/u);
  });

  it('rejects missing, absolute, traversing, and non-test proof paths', () => {
    const missingProof = structuredClone(manifest);
    missingProof.claims[0].testFiles = [];
    expect(() => parse(missingProof)).toThrow(/non-empty array/u);

    const executableIndex = manifest.claims.findIndex(({ claim }) => claim === 'executable');
    for (const unsafePath of ['/tmp/source.mjs', '../source.mjs', 'tooling/../source.mjs']) {
      const unsafeSource = structuredClone(manifest);
      unsafeSource.claims[executableIndex].source = unsafePath;
      expect(() => parseValidationManifest(unsafeSource)).toThrow(/repository-relative/u);
    }

    const nonTestProof = structuredClone(manifest);
    nonTestProof.claims[0].testFiles = ['tooling/qa/runtime/process/shared-process.mjs'];
    expect(() => parseValidationManifest(nonTestProof)).toThrow(/test path/u);

    expect(() => parseValidationManifest(manifest, { testExists: () => false })).toThrow(
      /test does not exist/u
    );
  });
});
