import { describe, expect, it } from 'vitest';

import { analyzeStructuralSource } from './report.mjs';
import { scoreFunction } from './score.mjs';

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

  it('does not count declarative fixture property fallbacks as test branching', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/settings/section.test.ts',
      `function createPreset(overrides = {}) {
        return {
          id: overrides.id ?? 'preset-1',
          name: overrides.name ?? 'Preset',
          width: overrides.width ?? 4,
          color: overrides.color ?? '#ff6600',
          radius: overrides.radius ?? 8,
          shadow: overrides.shadow ?? 30,
          opacity: overrides.opacity ?? 80,
          fillColor: overrides.fillColor ?? '#00000000',
          fillOpacity: overrides.fillOpacity ?? 0,
          inheritCustomCss: overrides.inheritCustomCss ?? false,
          strokeOpacity: overrides.strokeOpacity ?? 100,
        };
      }`
    ).functions[0];

    expect(metric).toMatchObject({
      cognitive: 0,
      cyclomatic: 1,
      profile: 'test-fixture',
    });
    expect(scoreFunction(metric)).toBe(0);
  });

  it('keeps real control flow in test fixture helpers on the normal test profile', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/settings/section.test.ts',
      `function createPreset(overrides = {}) {
        if (!overrides.id) throw new Error('missing id');
        return { id: overrides.id ?? 'preset-1' };
      }`
    ).functions[0];

    expect(metric).toMatchObject({ profile: 'test' });
    expect(metric.cognitive).toBeGreaterThan(1);
    expect(metric.cyclomatic).toBeGreaterThan(2);
  });

  it('retains logical gating inside a declarative test fixture', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/settings/section.test.ts',
      `function createPreset(flags) {
        return {
          alpha: flags.alpha && buildAlpha(),
          beta: flags.beta && buildBeta(),
          gamma: flags.gamma && buildGamma(),
          delta: flags.delta && buildDelta(),
          epsilon: flags.epsilon && buildEpsilon(),
        };
      }`
    ).functions[0];

    expect(metric).toMatchObject({
      cognitive: 5,
      cyclomatic: 6,
      profile: 'test-fixture',
    });
    expect(scoreFunction(metric)).toBe(2);
  });
});
