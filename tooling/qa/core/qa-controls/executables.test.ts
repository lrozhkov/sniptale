import { describe, expect, it } from 'vitest';

import { collectControlDiscovery } from './discovery.mjs';
import { hasExecutableEntryPoint } from './executables.mjs';
import { executableEntryFixtures, nonExecutableEntryFixtures } from './executables.test-support';

describe('QA executable syntax discovery', () => {
  it.each(executableEntryFixtures)('discovers $name', ({ source, fileName }) => {
    expect(hasExecutableEntryPoint(source, fileName)).toBe(true);
  });

  it.each(nonExecutableEntryFixtures)('ignores $name', ({ source }) => {
    expect(hasExecutableEntryPoint(source)).toBe(false);
  });

  it('discovers supported entry forms across the complete tooling tree', () => {
    const paths = collectControlDiscovery().executables.map(({ path }) => path);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toEqual(
      expect.arrayContaining([
        'tooling/qa/core/verify-test-coverage.mjs',
        'tooling/qa/core/verify-package-boundaries.mjs',
        'tooling/release/generate-dependency-legal.mjs',
        'tooling/test/e2e/run-e2e.mjs',
      ])
    );
  });

  it.each(['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'])(
    'classifies executable .%s source before policy registration',
    (extension) => {
      const source =
        extension === 'cjs'
          ? 'if (require.main === module) run();\n'
          : "import { isExecutedAsScript } from './shared.mjs';\nif (isExecutedAsScript(import.meta.url)) run();\n";
      expect(hasExecutableEntryPoint(source, `fixture.${extension}`)).toBe(true);
    }
  );
});
