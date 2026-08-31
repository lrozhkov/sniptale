import { describe, expect, it } from 'vitest';

import {
  assertSemanticRuntimeParity,
  createRuntimeParityReceipt,
  createSemanticRuntimeParityReceipt,
} from './runtime-parity.mjs';

const lock = {
  platform: 'linux/amd64',
  node: { version: '24.18.0', npmVersion: '11.19.1' },
};
const root = '/opt/node-v24.18.0';
const execPath = `${root}/bin/node`;
const paths = {
  node: '/home/test/.local/bin/node',
  npm: `${root}/bin/npm`,
  npx: `${root}/bin/npx`,
};
const realPaths = {
  [execPath]: execPath,
  [paths.node]: execPath,
  [paths.npm]: `${root}/lib/node_modules/npm/bin/npm-cli.js`,
  [paths.npx]: `${root}/lib/node_modules/npm/bin/npx-cli.js`,
};
const versions = { node: 'v24.18.0', npm: '11.19.1', npx: '11.19.1' };

function createReceipt(
  overrides: {
    realPaths?: Record<string, string>;
    versions?: Record<string, string>;
  } = {}
) {
  const observedRealPaths = { ...realPaths, ...overrides.realPaths };
  const observedVersions = { ...versions, ...overrides.versions };
  return createRuntimeParityReceipt({
    lock,
    execPath,
    resolve: (command: keyof typeof paths) => paths[command],
    realpath: (file: string) => observedRealPaths[file] ?? file,
    version: (file: string) => observedVersions[file.split('/').at(-1) as keyof typeof versions],
  });
}

describe('runtime parity', () => {
  it('binds node, npm and npx versions and real paths to one runtime root', () => {
    expect(createReceipt()).toEqual({
      schemaVersion: 1,
      artifactKind: 'sniptale-runtime-parity',
      platform: 'linux/amd64',
      runtimeRoot: root,
      packageManagerRoot: `${root}/lib/node_modules/npm`,
      commands: {
        node: { commandPath: paths.node, realPath: execPath, version: 'v24.18.0' },
        npm: {
          commandPath: paths.npm,
          realPath: `${root}/lib/node_modules/npm/bin/npm-cli.js`,
          version: '11.19.1',
        },
        npx: {
          commandPath: paths.npx,
          realPath: `${root}/lib/node_modules/npm/bin/npx-cli.js`,
          version: '11.19.1',
        },
      },
    });
  });

  it('rejects a stale npx version even when node and npm match', () => {
    expect(() => createReceipt({ versions: { npx: '10.9.4' } })).toThrow(
      'npx version drift: expected 11.19.1, got 10.9.4'
    );
  });

  it('accepts one locked npm package root outside the Node installation', () => {
    const lockedRoot = '/opt/sniptale-npm/node_modules/npm';
    const receipt = createReceipt({
      realPaths: {
        [paths.npm]: `${lockedRoot}/bin/npm-cli.js`,
        [paths.npx]: `${lockedRoot}/bin/npx-cli.js`,
      },
    });

    expect(receipt.runtimeRoot).toBe(root);
    expect(receipt.packageManagerRoot).toBe(lockedRoot);
  });

  it('rejects a stale npx symlink even when it reports the expected version', () => {
    expect(() =>
      createReceipt({
        realPaths: {
          [paths.npx]: '/opt/node-v22.22.1/lib/node_modules/npm/bin/npx-cli.js',
        },
      })
    ).toThrow('npx path drift');
  });

  it('rejects a PATH node that differs from the process runtime', () => {
    expect(() =>
      createReceipt({ realPaths: { [paths.node]: '/opt/node-v22.22.1/bin/node' } })
    ).toThrow('node path drift');
  });

  it('projects external parity without retaining absolute host paths', () => {
    expect(createSemanticRuntimeParityReceipt(createReceipt(), 'selectel-host')).toEqual({
      schemaVersion: 1,
      artifactKind: 'sniptale-runtime-parity-semantic',
      surface: 'selectel-host',
      platform: 'linux/amd64',
      commands: {
        node: {
          version: 'v24.18.0',
          rootRelativeRealPath: 'bin/node',
          processRuntime: true,
        },
        npm: { version: '11.19.1', packageRelativeRealPath: 'bin/npm-cli.js' },
        npx: { version: '11.19.1', packageRelativeRealPath: 'bin/npx-cli.js' },
      },
      npmNpxSharePackageRoot: true,
    });
  });

  it('compares semantic roots across host and container without comparing absolute paths', () => {
    const host = createSemanticRuntimeParityReceipt(createReceipt(), 'selectel-host');
    const container = createSemanticRuntimeParityReceipt(
      createReceipt({
        realPaths: {
          [execPath]: '/usr/local/bin/node',
          [paths.node]: '/usr/local/bin/node',
          [paths.npm]: '/opt/sniptale-npm/node_modules/npm/bin/npm-cli.js',
          [paths.npx]: '/opt/sniptale-npm/node_modules/npm/bin/npx-cli.js',
        },
      }),
      'qa-container'
    );

    expect(() => assertSemanticRuntimeParity(host, container)).not.toThrow();
    container.commands.npx.version = '10.9.4';
    expect(() => assertSemanticRuntimeParity(host, container)).toThrow(
      'Runtime parity semantic drift between external execution surfaces.'
    );
  });
});
