import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { analyzeExecutableEntrypoint, hasExecutableEntryPoint } from './check.mjs';
import {
  eagerExecutableFixtures,
  generateDocsStyleSource,
  guardedExecutableFixtures,
  runtimeParityEquivalentSource,
  silentModuleFixtures,
} from './test-support';

describe('QA executable AST semantics', () => {
  it.each(guardedExecutableFixtures)(
    'classifies guarded executable: $name',
    ({ source, fileName }) => {
      const analysis = analyzeExecutableEntrypoint(source, fileName);
      expect(analysis).toMatchObject({
        classification: 'guarded',
        executable: true,
        importSafe: true,
        malformed: false,
      });
      expect(analysis.evidence).not.toHaveLength(0);
    }
  );

  it.each(eagerExecutableFixtures)(
    'classifies import-unsafe executable smell: $name',
    ({ source }) => {
      const analysis = analyzeExecutableEntrypoint(source);
      expect(analysis).toMatchObject({
        classification: 'eager',
        executable: true,
        importSafe: false,
        malformed: false,
      });
      expect(analysis.evidence).not.toHaveLength(0);
    }
  );

  it.each(silentModuleFixtures)(
    'does not create a false executable target: $name',
    ({ source }) => {
      expect(analyzeExecutableEntrypoint(source)).toEqual({
        classification: 'silent',
        evidence: [],
        executable: false,
        importSafe: true,
        malformed: false,
      });
    }
  );

  it('recognizes the runtime-parity alias guard as import-safe', () => {
    const analysis = analyzeExecutableEntrypoint(runtimeParityEquivalentSource);
    expect(analysis).toMatchObject({
      classification: 'guarded',
      executable: true,
      importSafe: true,
    });
    expect(analysis.evidence.map(({ kind }) => kind)).toEqual(['import-meta-argv-guard']);
  });

  it('classifies a generate-docs-style argv-driven top-level call as eager', () => {
    expect(analyzeExecutableEntrypoint(generateDocsStyleSource)).toEqual({
      classification: 'eager',
      evidence: [expect.objectContaining({ kind: 'process-argv' })],
      executable: true,
      importSafe: false,
      malformed: false,
    });
  });

  it('excludes an ordinary test module from real executable target detection', () => {
    expect(analyzeExecutableEntrypoint("process.stdout.write('test');", 'owner.test.ts')).toEqual({
      classification: 'ignored-test',
      evidence: [],
      executable: false,
      importSafe: true,
      malformed: false,
    });
  });

  it('fails closed with parse evidence for malformed source', () => {
    const analysis = analyzeExecutableEntrypoint('if (');
    expect(analysis).toMatchObject({
      classification: 'malformed',
      executable: true,
      importSafe: false,
      malformed: true,
    });
    expect(analysis.evidence).toEqual([
      expect.objectContaining({ kind: 'parse-diagnostic', code: expect.any(Number) }),
    ]);
    expect(hasExecutableEntryPoint('if (')).toBe(true);
  });

  it.each(['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'])(
    'preserves the boolean executable projection for .%s',
    (extension) => {
      const source =
        extension === 'cjs'
          ? 'if (require.main === module) run();\n'
          : "import { isExecutedAsScript } from './shared.mjs';\nif (isExecutedAsScript(import.meta.url)) run();\n";
      expect(hasExecutableEntryPoint(source, `fixture.${extension}`)).toBe(true);
    }
  );
});

describe('guarded executable process contract', () => {
  let fixtureDirectory = '';
  let fixturePath = '';

  beforeAll(() => {
    fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-executable-contract-'));
    fixturePath = path.join(fixtureDirectory, 'guarded.mjs');
    fs.writeFileSync(
      fixturePath,
      `import path from 'node:path';
import { fileURLToPath } from 'node:url';
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--fail')) throw new Error('fixture failure');
  process.stdout.write('fixture output\\n');
}
`
    );
  });

  afterAll(() => {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  });

  it('imports a guarded executable without effects', () => {
    expect(
      analyzeExecutableEntrypoint(fs.readFileSync(fixturePath, 'utf8'), fixturePath)
    ).toMatchObject({ classification: 'guarded', executable: true, importSafe: true });
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(pathToFileURL(fixturePath).href)})`,
      ],
      { encoding: 'utf8' }
    );
    expect(result).toMatchObject({ status: 0, stdout: '', stderr: '' });
  });

  it('emits observable output when spawned directly', () => {
    const result = spawnSync(process.execPath, [fixturePath], { encoding: 'utf8' });
    expect(result).toMatchObject({ status: 0, stdout: 'fixture output\n', stderr: '' });
  });

  it('propagates a non-zero direct execution failure', () => {
    const result = spawnSync(process.execPath, [fixturePath, '--fail'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('fixture failure');
  });
});
