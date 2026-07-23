import { describe, expect, it } from 'vitest';

import { analyzeStructuralSource } from './report.mjs';

describe('function profile classification', () => {
  it('uses the entrypoint profile only for an exported entrypoint binding', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/overlay/example/index.ts',
      `function prepare(value) { return value + 1; }
      export function run(value) { return prepare(value); }
      const execute = (value) => run(value);
      export default execute;`
    );

    expect(metric.functions.find(({ symbol }) => symbol === 'prepare')?.profile).toBe('default');
    expect(metric.functions.find(({ symbol }) => symbol === 'run')?.profile).toBe('entrypoint');
    expect(metric.functions.find(({ symbol }) => symbol === 'execute')?.profile).toBe('entrypoint');
  });

  it('does not inherit an exported binding profile in a nested callback', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/overlay/example/index.ts',
      'export const run = () => [1].map((value) => value + 1);'
    );

    expect(metric.functions.find(({ symbol }) => symbol === 'run')?.profile).toBe('entrypoint');
    expect(metric.functions.find(({ symbol }) => symbol !== 'run')?.profile).toBe('default');
  });

  it('does not treat descendant functions in exported initializers as entrypoints', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/overlay/example/index.ts',
      `export const run = decorate(function prepare() {});
      export const handlers = { execute() {} };`
    );

    expect(metric.functions.find(({ symbol }) => symbol === 'prepare')?.profile).toBe('default');
    expect(metric.functions.find(({ symbol }) => symbol === 'execute')?.profile).toBe('default');
  });

  it('recognizes a direct default export through transparent wrappers', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/overlay/example/index.ts',
      'export default (() => true);'
    );

    expect(metric.functions[0]?.profile).toBe('entrypoint');
  });

  it('uses the pure profile for the registered deleted-aggregate AST owner', () => {
    const metric = analyzeStructuralSource(
      'tooling/qa/core/verify-build.deleted-aggregate.mjs',
      `function collectBindings(nodes) {
        const bindings = [];
        for (const node of nodes) {
          if (node.kind === 'import') bindings.push(node.name);
        }
        return bindings;
      }`
    );

    expect(metric.functions[0]?.profile).toBe('pure');
  });
});
