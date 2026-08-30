import { describe, expect, it } from 'vitest';

import { collectControlPolicyViolations } from './policy.mjs';

const controlSource = 'tooling/qa/guards/quality/example/check.mjs';
const collectorSource = 'export function collectExampleViolations() { return []; }\n';

function discoveryFixture() {
  return {
    controls: [
      {
        id: 'qa.rule.example',
        semanticClass: 'semantic guard / analyzer',
        source: controlSource,
        sourceExists: true,
        proofFiles: ['tooling/qa/guards/quality/example/check.test.ts'],
      },
    ],
    executables: [
      {
        path: controlSource,
        controlIds: ['qa.rule.example'],
        scriptIds: [],
        origins: [
          `ast-entry:${controlSource}#canonical-js-entry`,
          `catalog:tooling/qa/composition/catalog/catalog.data.mjs#lane.focused-guardrail.id.qa.rule.example.source.${controlSource}`,
        ],
        entrypointKind: 'guarded',
        importSafety: 'safe',
      },
    ],
    policyFiles: [
      {
        path: 'tooling/configs/qa/example.data.json',
        consumers: [controlSource],
      },
    ],
  };
}

function policyFixture() {
  return {
    $comment: 'Only evidenced exceptions are checked in.',
    schemaVersion: 4,
    exceptions: [] as Array<{ kind: string; path: string; rationale: string }>,
  };
}

function rules(discovery = discoveryFixture(), policy = policyFixture()) {
  return collectControlPolicyViolations(discovery, policy, {
    readSource: () => collectorSource,
  }).map(({ rule }) => rule);
}

describe('derived control-inventory closure', () => {
  it('accepts exact catalog, semantic fixture, executable, and policy-consumer closure', () => {
    expect(rules()).toEqual([]);
  });

  it('rejects malformed policy instead of generating default keep decisions', () => {
    expect(
      rules(discoveryFixture(), { schemaVersion: 4 } as ReturnType<typeof policyFixture>)
    ).toContain('qa-control-policy-schema');
  });

  it('rejects missing catalog sources and broken executable backlinks', () => {
    const missing = discoveryFixture();
    missing.controls[0].sourceExists = false;
    expect(rules(missing)).toContain('qa-control-source-missing');

    const unlinked = discoveryFixture();
    unlinked.executables[0].controlIds = [];
    expect(rules(unlinked)).toContain('qa-control-source-closure');
  });

  it('requires a collector and declared fixture for semantic analyzers', () => {
    const missingFixture = discoveryFixture();
    missingFixture.controls[0].proofFiles = [];
    expect(rules(missingFixture)).toContain('qa-semantic-control-missing-fixture');

    expect(
      collectControlPolicyViolations(discoveryFixture(), policyFixture(), {
        readSource: () => 'export function runExampleCheck() { return { violations: [] }; }\n',
      }).map(({ rule }) => rule)
    ).toContain('qa-semantic-control-missing-collector');
  });

  it('does not auto-admit a newly discovered orphan executable', () => {
    const discovery = discoveryFixture();
    discovery.executables.push({
      path: 'tooling/qa/orphan.mjs',
      controlIds: [],
      scriptIds: [],
      origins: ['ast-entry:tooling/qa/orphan.mjs#canonical-js-entry'],
      entrypointKind: 'guarded',
      importSafety: 'safe',
    });
    expect(rules(discovery)).toContain('qa-executable-orphan');
  });

  it('admits only a current, explicit orphan exception and rejects it when stale', () => {
    const discovery = discoveryFixture();
    const orphan = {
      path: 'tooling/qa/operator.mjs',
      controlIds: [],
      scriptIds: [],
      origins: ['ast-entry:tooling/qa/operator.mjs#canonical-js-entry'],
      entrypointKind: 'guarded',
      importSafety: 'safe',
    };
    discovery.executables.push(orphan);
    const policy = policyFixture();
    policy.exceptions.push({
      kind: 'orphan-executable',
      path: orphan.path,
      rationale: 'This import-safe maintenance operator has an independent transaction contract.',
    });
    expect(rules(discovery, policy)).not.toContain('qa-executable-orphan');

    orphan.origins.push(
      'package-script:package.json#scripts.qa:operator.target.tooling/qa/operator.mjs'
    );
    expect(rules(discovery, policy)).toContain('qa-control-policy-exception-stale');
  });

  it('rejects import-unsafe entrypoints without an exact process relationship or exception', () => {
    const discovery = discoveryFixture();
    discovery.executables[0].entrypointKind = 'eager';
    discovery.executables[0].importSafety = 'unsafe';
    expect(rules(discovery)).toContain('qa-executable-import-safety');

    const policy = policyFixture();
    policy.exceptions.push({
      kind: 'unsafe-import',
      path: controlSource,
      rationale: 'The source self-spawns as a bounded worker under an exact private argument.',
    });
    expect(rules(discovery, policy)).not.toContain('qa-executable-import-safety');
  });

  it('rejects active policy files without a discovered production consumer', () => {
    const discovery = discoveryFixture();
    discovery.policyFiles[0].consumers = [];
    expect(rules(discovery)).toContain('qa-policy-file-no-consumer');
  });
});
