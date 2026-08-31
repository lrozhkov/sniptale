import { describe, expect, it } from 'vitest';

import { getSourceSnapshotStats } from '../../analysis/source/source-snapshot.mjs';
import { buildExecutableDiscovery, isPolicyConsumerEvidenceFile } from './discovery.mjs';

it('does not treat generated inventories as executable policy consumers', () => {
  expect(isPolicyConsumerEvidenceFile('tooling/configs/qa/control-dispositions.data.json')).toBe(
    false
  );
  expect(isPolicyConsumerEvidenceFile('tooling/configs/qa/technical-debt.data.json')).toBe(false);
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
        },
        {
          id: 'qa.rule.same-basename',
          source: 'tooling/qa/other/verify-example.mjs',
        },
      ],
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
        proofFiles: [],
        entrypointKind: 'guarded',
        importSafety: 'safe',
      }),
    ]);
    expect(getSourceSnapshotStats()).toEqual(snapshotStatsBefore);
  });

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
