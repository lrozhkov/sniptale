import { describe, expect, it } from 'vitest';

import { collectControlPolicyViolations } from './policy.mjs';

const control = {
  id: 'qa.rule.example',
  source: 'tooling/qa/core/verify-example.mjs',
  owner: 'maintainability-governance',
  ruleDoc: 'docs/tooling/code-quality.md',
  remediation: 'Inspect the owner boundary; do not mechanically split code.',
  truthSource: 'fixture',
  sourceExists: true,
  proofFiles: ['tooling/qa/core/example.test.ts'],
};

const discovery = {
  controls: [control],
  executables: [
    {
      path: 'tooling/qa/core/verify-example.mjs',
      controlIds: [control.id],
      scriptIds: [],
      proofFiles: ['tooling/qa/core/example.test.ts'],
    },
  ],
  packageQaScripts: [{ id: 'qa:example', command: 'node tooling/qa/core/verify-example.mjs' }],
  policyFiles: [
    { path: 'tooling/configs/qa/example.json', consumers: ['tooling/qa/core/example.mjs'] },
  ],
  validationTools: ['verify-example.mjs'],
};

function validPolicy() {
  return {
    schemaVersion: 1,
    controls: [
      {
        id: control.id,
        disposition: 'keep',
        owner: 'qa-platform',
        rationale: 'permanent fixture control',
        sourceKind: 'repository',
      },
    ],
    executables: [
      {
        path: 'tooling/qa/core/verify-example.mjs',
        disposition: 'keep',
        owner: 'qa-platform',
        rationale: 'permanent fixture executable',
      },
    ],
    policyFiles: [
      {
        path: 'tooling/configs/qa/example.json',
        consumers: ['tooling/qa/core/example.mjs'],
        disposition: 'keep',
        owner: 'qa-platform',
        rationale: 'permanent fixture policy',
      },
    ],
    scripts: [
      {
        id: 'qa:example',
        disposition: 'keep',
        owner: 'qa-platform',
        rationale: 'permanent fixture script',
      },
    ],
    validationTools: [
      {
        tool: 'verify-example.mjs',
        disposition: 'keep',
        owner: 'qa-platform',
        rationale: 'permanent fixture validation',
      },
    ],
  };
}

function rules(policy: ReturnType<typeof validPolicy>) {
  return collectControlPolicyViolations(discovery, policy).map(({ rule }) => rule);
}

describe('QA control policy exact populations', () => {
  it('accepts an exact classified population', () => {
    expect(collectControlPolicyViolations(discovery, validPolicy())).toEqual([]);
  });

  it('rejects an unclassified executable control and stale row', () => {
    const missing = validPolicy();
    missing.controls = [];
    expect(rules(missing)).toContain('qa-control-policy-unclassified');

    const stale = validPolicy();
    stale.controls.push({
      ...stale.controls[0],
      id: 'qa.rule.removed',
    });
    expect(rules(stale)).toContain('qa-control-policy-stale');
  });

  it('rejects an unregistered executable outside the historical mjs topology', () => {
    const nonMjsDiscovery = {
      ...discovery,
      executables: [
        ...discovery.executables,
        {
          path: 'tooling/qa/core/verify-unregistered.ts',
          controlIds: [],
          scriptIds: [],
          proofFiles: [],
        },
      ],
    };

    expect(
      collectControlPolicyViolations(nonMjsDiscovery, validPolicy()).map(({ rule }) => rule)
    ).toContain('qa-executable-policy-unclassified');
  });
});

describe('QA control policy invalid metadata', () => {
  it('rejects duplicate IDs, invalid dispositions, and missing proof', () => {
    const duplicate = validPolicy();
    duplicate.controls.push({ ...duplicate.controls[0] });
    expect(rules(duplicate)).toContain('qa-control-policy-duplicate');

    const invalid = validPolicy();
    invalid.controls[0].disposition = 'ignore';
    expect(rules(invalid)).toContain('qa-control-policy-disposition');

    const noProofDiscovery = { ...discovery, controls: [{ ...control, proofFiles: [] }] };
    const noProofRules = collectControlPolicyViolations(noProofDiscovery, validPolicy()).map(
      ({ rule }) => rule
    );
    expect(noProofRules).toContain('qa-control-policy-proof');

    const unknownKey = validPolicy();
    Object.assign(unknownKey.controls[0], { wildcard: true });
    expect(rules(unknownKey)).toContain('qa-control-policy-unknown-key');
  });

  it('rejects orphan policies and mechanical metric remediation', () => {
    const orphanDiscovery = {
      ...discovery,
      policyFiles: [{ path: 'tooling/configs/qa/example.json', consumers: [] }],
    };
    const orphanRules = collectControlPolicyViolations(orphanDiscovery, validPolicy()).map(
      ({ rule }) => rule
    );
    expect(orphanRules).toContain('qa-policy-file-no-consumer');

    const weakDiscovery = {
      ...discovery,
      controls: [{ ...control, remediation: 'Split the file below the threshold.' }],
    };
    const weakRules = collectControlPolicyViolations(weakDiscovery, validPolicy()).map(
      ({ rule }) => rule
    );
    expect(weakRules).toContain('qa-control-metric-remediation');
  });
});

describe('QA control policy consumer population', () => {
  it.each([
    { name: 'removed', consumers: [] },
    {
      name: 'added',
      consumers: ['tooling/qa/core/example.mjs', 'tooling/qa/core/stale-example.mjs'],
    },
  ])('rejects $name policy consumer drift', ({ consumers }) => {
    const drifted = validPolicy();
    drifted.policyFiles[0].consumers = consumers;
    expect(rules(drifted)).toContain('qa-policy-file-consumer-drift');
  });
});
