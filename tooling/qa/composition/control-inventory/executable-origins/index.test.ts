import { describe, expect, it } from 'vitest';

import {
  collectCatalogOrigins,
  collectDeclaredEntryOrigins,
  collectDockerOrigins,
  collectDocumentedCommandOrigins,
  collectExecutableOriginProjection,
  collectHookOrigins,
  collectPackageScriptOrigins,
  collectSourceInvocationOrigins,
  collectWorkflowOrigins,
} from './index.mjs';

const present = new Set([
  'tooling/bin/child.mjs',
  'tooling/bin/cli.mjs',
  'tooling/bin/hook.mjs',
  'tooling/bin/worker.mjs',
  'tooling/nested/run.mjs',
]);

describe('executable origin collectors', () => {
  it('collects root and nested package script commands without treating the manifest as a target', () => {
    expect(
      collectPackageScriptOrigins({
        authority: 'tooling/nested/package.json',
        source: JSON.stringify({
          scripts: {
            ignored: 'vite build',
            run: 'node tooling/nested/run.mjs --proof',
          },
        }),
      })
    ).toEqual([
      expect.objectContaining({
        id: 'package-script:tooling/nested/package.json#scripts.run.target.tooling/nested/run.mjs',
        target: 'tooling/nested/run.mjs',
      }),
    ]);
  });

  it('parses trusted workflow steps by id, name, and stable index while ignoring uses', () => {
    const origins = collectWorkflowOrigins({
      authority: '.github/workflows/quality.yml',
      source: `
jobs:
  gate:
    steps:
      - uses: actions/checkout@v4
      - id: exact
        run: node tooling/bin/cli.mjs
      - name: Renamed command
        run: node tooling/bin/child.mjs
`,
    });
    expect(origins.map(({ id }) => id)).toEqual([
      'workflow:.github/workflows/quality.yml#job.gate.step.id.exact.target.tooling/bin/cli.mjs.occurrence.1',
      'workflow:.github/workflows/quality.yml#job.gate.step.name.renamed-command.' +
        'target.tooling/bin/child.mjs.occurrence.1',
    ]);
  });

  it('requires a copied source before Docker RUN or ENTRYPOINT establishes an origin', () => {
    const origins = collectDockerOrigins({
      authority: 'tooling/ci/Dockerfile',
      source: `
COPY tooling/bin/cli.mjs /usr/local/bin/cli.mjs
RUN node /usr/local/bin/cli.mjs
COPY tooling/bin/child.mjs /usr/local/bin/child.mjs
ENTRYPOINT ["node", "/usr/local/bin/child.mjs"]
RUN node /usr/local/bin/not-copied.mjs
`,
    });
    expect(origins.map(({ kind, target }) => [kind, target])).toEqual([
      ['docker-entrypoint', 'tooling/bin/child.mjs'],
      ['docker-copy-run', 'tooling/bin/cli.mjs'],
    ]);
  });

  it('collects uncommented Husky commands and explicit documented operator commands', () => {
    expect(
      collectHookOrigins({
        authority: '.husky/pre-push',
        source: '# node tooling/bin/child.mjs\nnode tooling/bin/hook.mjs\n',
      }).map(({ target }) => target)
    ).toEqual(['tooling/bin/hook.mjs']);
    expect(
      collectDocumentedCommandOrigins({
        authority: 'docs/tooling/operator.md',
        source:
          'Plain prose mentioning tooling/bin/child.mjs is not an operator command.\n\n' +
          '```bash\nnode tooling/bin/cli.mjs\n```\n',
      }).map(({ target }) => target)
    ).toEqual(['tooling/bin/cli.mjs']);
  });

  it('collects only catalog records that name an executable repository target', () => {
    expect(
      collectCatalogOrigins({
        authority: 'tooling/qa/catalog.mjs',
        controls: [
          {
            execution: 'always',
            id: 'qa.rule.cli',
            lane: 'build',
            source: 'tooling/bin/cli.mjs',
          },
          {
            execution: false,
            id: 'qa.rule.disabled',
            lane: 'build',
            source: 'tooling/bin/child.mjs',
          },
          { execution: 'always', id: 'qa.rule.external', lane: 'build', source: 'git' },
        ],
      }).map(({ target }) => target)
    ).toEqual(['tooling/bin/cli.mjs']);
  });
});

describe('source executable origin semantics', () => {
  it('distinguishes canonical and alternate runtime declarations', () => {
    expect(
      collectDeclaredEntryOrigins({
        authority: 'tooling/bin/alternate.mjs',
        source:
          "import { isExecutedAsScript } from './shared.mjs';\n" +
          'if (isExecutedAsScript(import.meta.url)) run();\n',
      })[0].kind
    ).toBe('canonical-production-AST-direct-entry');
    expect(
      collectDeclaredEntryOrigins({
        authority: 'tooling/bin/cli.mjs',
        source:
          'const invoked = process.argv[1];\n' +
          'const owner = fileURLToPath(import.meta.url);\n' +
          'if (invoked === owner) run();\n',
      })[0].kind
    ).toBe('canonical-production-AST-alternate-entry');
    expect(
      collectDeclaredEntryOrigins({
        authority: 'tooling/bin/worker.mjs',
        source: "process.on('message', run);\n",
      })[0].kind
    ).toBe('qa-lane-ipc-worker-entry');
    expect(
      collectDeclaredEntryOrigins({
        authority: 'tooling/bin/controller.py',
        source: "if __name__ == '__main__':\n    run()\n",
      })[0].kind
    ).toBe('python-main-entry');
    expect(
      collectDeclaredEntryOrigins({
        authority: 'tooling/bin/run.sh',
        executableMode: true,
        source: '#!/usr/bin/env bash\nrun\n',
      })[0].kind
    ).toBe('registered-shell-entry');
    expect(
      collectDeclaredEntryOrigins({
        authority: 'tooling/bin/run.sh',
        executableMode: false,
        source: '#!/usr/bin/env bash\nrun\n',
      })
    ).toEqual([]);
  });

  it('resolves internal spawn, fork, Worker, dynamic import, and test-process edges', () => {
    const result = collectSourceInvocationOrigins({
      authority: 'tooling/bin/parent.mjs',
      source: `
const child = new URL('./child.mjs', import.meta.url);
spawn(process.execPath, [child]);
fork(fileURLToPath(child));
new Worker(child);
await import('./child.mjs');
`,
    });
    expect(result.unresolved).toEqual([]);
    expect(result.origins.map(({ target }) => target)).toEqual([
      'tooling/bin/child.mjs',
      'tooling/bin/child.mjs',
      'tooling/bin/child.mjs',
    ]);
    expect(
      collectSourceInvocationOrigins({
        authority: 'tooling/bin/parent.test.ts',
        source: "spawn(process.execPath, ['tooling/bin/cli.mjs']);",
        testProcess: true,
      }).origins[0].kind
    ).toBe('test-process-target');
  });

  it('does not promote a library dynamic import to a process target', () => {
    expect(
      collectSourceInvocationOrigins({
        authority: 'tooling/qa/composition/quality/example.mjs',
        source: "export async function run() { return import('./verify-oxlint.mjs'); }",
      })
    ).toEqual({ origins: [], unresolved: [] });
  });

  it('retains the bounded polygon runner dynamic execution edge', () => {
    expect(
      collectSourceInvocationOrigins({
        authority: 'tooling/web-snapshot-smoke/runtime/polygon-runner.mjs',
        source: "await import('./runner.mjs');",
      }).origins
    ).toEqual([
      expect.objectContaining({
        authority: 'tooling/web-snapshot-smoke/runtime/polygon-runner.mjs',
        kind: 'internal-process-target',
        target: 'tooling/web-snapshot-smoke/runtime/runner.mjs',
      }),
    ]);
  });
});

describe('executable origin admission failures', () => {
  it('does not promote comments, strings, ordinary imports, inputs, or embedded fixtures', () => {
    const projection = collectExecutableOriginProjection({
      authorities: [
        {
          kind: 'source',
          path: 'tooling/bin/library.mjs',
          source:
            "import './child.mjs';\nconst example = 'spawn(process.execPath, [tooling/bin/cli.mjs])';\n",
        },
      ],
      eagerCandidates: ['tooling/bin/eager.mjs'],
      embeddedSourceFixtures: ['tooling/bin/library.test.ts'],
      exists: (target: string) => present.has(target),
      inputs: ['tooling/ci/toolchain.lock.json'],
    });
    expect(projection.origins).toEqual([]);
    expect(projection.targets).toEqual([]);
    expect(projection.inputs).toEqual(['tooling/ci/toolchain.lock.json']);
    expect(projection.embeddedSourceFixtures).toEqual(['tooling/bin/library.test.ts']);
    expect(projection.eagerCandidates).toEqual(['tooling/bin/eager.mjs']);
  });

  it('fails closed for unresolved repository targets and unsupported authority kinds', () => {
    expect(() =>
      collectExecutableOriginProjection({
        authorities: [
          {
            kind: 'package',
            path: 'package.json',
            source: JSON.stringify({ scripts: { broken: 'node tooling/bin/missing.mjs' } }),
          },
        ],
        exists: (target: string) => present.has(target),
      })
    ).toThrow(/Unresolved repository executable targets/u);
    expect(() =>
      collectExecutableOriginProjection({
        authorities: [{ kind: 'lockfile', path: 'package-lock.json', source: '{}' }],
        exists: () => true,
      })
    ).toThrow(/Unsupported executable origin authority/u);
    expect(() =>
      collectExecutableOriginProjection({
        authorities: [
          { kind: 'package', path: 'package.json', source: '{"scripts":{}}' },
          { kind: 'package', path: 'package.json', source: '{"scripts":{}}' },
        ],
        exists: () => true,
      })
    ).toThrow(/Duplicate executable origin authorities/u);
    expect(
      collectSourceInvocationOrigins({
        authority: 'tooling/bin/parent.mjs',
        source: 'spawn(process.execPath, [`tooling/bin/${name}.mjs`]);',
      }).unresolved
    ).toHaveLength(1);
    expect(
      collectSourceInvocationOrigins({
        authority: 'tooling/bin/parent.mjs',
        source:
          "spawn(process.execPath, [flag ? 'tooling/bin/child.mjs' : 'tooling/bin/worker.mjs']);",
      })
    ).toEqual({ origins: [], unresolved: [expect.objectContaining({ ordinal: 1 })] });
    expect(
      collectSourceInvocationOrigins({
        authority: 'tooling/bin/parent.mjs',
        source:
          "const target = flag ? 'tooling/bin/child.mjs' : 'tooling/bin/worker.mjs';\n" +
          'spawn(process.execPath, [target]);',
      })
    ).toEqual({ origins: [], unresolved: [expect.objectContaining({ ordinal: 1 })] });
    expect(
      collectSourceInvocationOrigins({
        authority: 'tooling/bin/parent.mjs',
        source:
          "spawn(process.execPath, [flag ? 'tooling/bin/child.mjs' : `tooling/bin/${name}.mjs`]);",
      })
    ).toEqual({ origins: [], unresolved: [expect.objectContaining({ ordinal: 1 })] });
    expect(
      collectSourceInvocationOrigins({
        authority: 'tooling/bin/parent.mjs',
        source:
          "appendCandidatePhaseInvocation([], { executable: 'node', " +
          "args: [flag ? 'tooling/bin/child.mjs' : `tooling/bin/${name}.mjs`] });",
      })
    ).toEqual({ origins: [], unresolved: [expect.objectContaining({ ordinal: 1 })] });
    expect(
      collectSourceInvocationOrigins({
        authority: 'tooling/bin/parent.mjs',
        source:
          "runQaLaneWorker({ workerUrl: flag ? 'tooling/bin/child.mjs' : " +
          '`tooling/bin/${name}.mjs` });',
      })
    ).toEqual({ origins: [], unresolved: [expect.objectContaining({ ordinal: 1 })] });
  });
});
