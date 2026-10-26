import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { runJscpdCheck } from './check.mjs';
import { createTempRoot, writeFile } from '../../test-support/test-helpers';

const CLONE_BODY = [
  '  const alpha = input.trim();',
  '  const beta = alpha.toUpperCase();',
  '  const gamma = beta.split("");',
  '  const delta = gamma.reverse();',
  '  const epsilon = delta.join("");',
  '  return `${epsilon}:${alpha.length}`;',
].join('\n');

const SAME_FILE_CLONE_BODY = [
  '  const units = input.split("/");',
  '  const filtered = units.filter(Boolean);',
  '  const keyed = filtered.map((unit, index) => `${index}-${unit}`);',
  '  const selected = keyed.slice(0, 4);',
  '  const joined = selected.join("|");',
  '  return joined.padEnd(24, "_");',
].join('\n');

function functionSource(name: string, body = CLONE_BODY) {
  return `export function ${name}(input: string) {\n${body}\n}\n`;
}

function initializeFixtureRepository(root: string) {
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  writeFile(root, '.gitignore', 'src-b/gitignored.ts\n');
  writeFile(
    root,
    '.jscpd.json',
    `${JSON.stringify({
      absolute: true,
      crossFormats: [],
      exitCode: 1,
      format: ['javascript', 'typescript'],
      gitignore: true,
      ignore: ['**/config-ignored.ts'],
      ignorePattern: [],
      minLines: 4,
      minTokens: 20,
      mode: 'mild',
      noTips: true,
      output: '.tmp/jscpd',
      reporters: ['json'],
      silent: true,
      threshold: 0,
    })}\n`
  );
  writeFile(
    root,
    'src-a/same-file.ts',
    `${functionSource('sameFirst', SAME_FILE_CLONE_BODY)}\n${functionSource('sameSecond', SAME_FILE_CLONE_BODY)}`
  );
  writeFile(root, 'src-a/cross-a.ts', functionSource('crossA'));
  writeFile(root, 'src-b/cross-b.ts', functionSource('crossB'));
  writeFile(
    root,
    'src-b/near-nonclone.ts',
    functionSource(
      'nearNonclone',
      [
        '  const parsed = Number.parseInt(input, 10);',
        '  const bounded = Math.max(0, parsed);',
        '  const serialized = JSON.stringify({ bounded });',
        '  const bytes = new TextEncoder().encode(serialized);',
        '  const checksum = bytes.reduce((sum, byte) => sum + byte, 0);',
        '  return `${serialized}:${checksum}`;',
      ].join('\n')
    )
  );
  writeFile(root, 'src-a/cross-format.js', functionSource('javascriptClone'));
  writeFile(root, 'src-b/cross-format.ts', functionSource('typescriptClone'));
  writeFile(root, 'src-b/gitignored.ts', functionSource('ignoredByGit'));
  writeFile(root, 'src-b/config-ignored.ts', functionSource('ignoredByConfig'));
  execFileSync('git', ['add', '.'], { cwd: root });
}

it('runs the pinned native v5 detector across roots with exact format and ignore policy', () => {
  const root = createTempRoot('verify-jscpd-native-');
  initializeFixtureRepository(root);
  const result = runJscpdCheck({
    baselinePath: null,
    configPath: path.join(root, '.jscpd.json'),
    root,
    scanTargets: ['src-b', 'src-a'],
  });

  expect(
    result.findings.some((finding) => finding.firstFile.path === finding.secondFile.path)
  ).toBe(true);
  expect(
    result.findings.some((finding) => finding.firstFile.path !== finding.secondFile.path)
  ).toBe(true);
  const findingPaths = result.findings.flatMap((finding) => [
    finding.firstFile.path,
    finding.secondFile.path,
  ]);
  expect(findingPaths).not.toContain('src-b/near-nonclone.ts');
  expect(findingPaths).not.toContain('src-b/gitignored.ts');
  expect(findingPaths).not.toContain('src-b/config-ignored.ts');
  expect(
    result.findings.some((finding) => {
      const files = new Set([finding.firstFile.path, finding.secondFile.path]);
      return files.has('src-a/cross-format.js') && files.has('src-b/cross-format.ts');
    })
  ).toBe(false);
  expect(result.detector).toMatchObject({
    config: { path: '.jscpd.json' },
    scope: { roots: ['src-a', 'src-b'] },
    runtime: {
      nativeBinaryDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      platformPackage: expect.stringMatching(/^jscpd-/u),
      workers: 2,
    },
  });
}, 30_000);

it('returns native status zero when the admitted population contains no clones', () => {
  const root = createTempRoot('verify-jscpd-native-clean-');
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  writeFile(
    root,
    '.jscpd.json',
    `${JSON.stringify({
      absolute: true,
      exitCode: 1,
      format: ['typescript'],
      ignorePattern: [],
      minLines: 4,
      minTokens: 20,
      output: '.tmp/jscpd',
      reporters: ['json'],
      silent: true,
      threshold: 0,
    })}\n`
  );
  writeFile(root, 'src-a/only.ts', functionSource('only'));
  writeFile(root, 'src-b/unrelated.ts', 'export const unrelated = new Map<string, number>();\n');
  execFileSync('git', ['add', '.'], { cwd: root });

  const result = runJscpdCheck({
    baselinePath: null,
    configPath: path.join(root, '.jscpd.json'),
    root,
    scanTargets: ['src-a', 'src-b'],
  });
  expect(result.findings).toEqual([]);
  expect(result.violations).toEqual([]);
}, 30_000);

it('applies native code-token ignore patterns before clone comparison', () => {
  const root = createTempRoot('verify-jscpd-native-ignore-pattern-');
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  writeFile(
    root,
    '.jscpd.json',
    `${JSON.stringify({
      absolute: true,
      exitCode: 1,
      format: ['typescript'],
      ignorePattern: ['.*'],
      minLines: 4,
      minTokens: 20,
      output: '.tmp/jscpd',
      reporters: ['json'],
      silent: true,
      threshold: 0,
    })}\n`
  );
  writeFile(root, 'src-a/ignored-a.ts', functionSource('ignoredA'));
  writeFile(root, 'src-b/ignored-b.ts', functionSource('ignoredB'));
  execFileSync('git', ['add', '.'], { cwd: root });

  const result = runJscpdCheck({
    baselinePath: null,
    configPath: path.join(root, '.jscpd.json'),
    root,
    scanTargets: ['src-a', 'src-b'],
  });
  expect(result.findings).toEqual([]);
}, 30_000);

it('terminates the native detector on timeout with the admitted signal', () => {
  const root = createTempRoot('verify-jscpd-native-timeout-');
  initializeFixtureRepository(root);
  expect(() =>
    runJscpdCheck({
      baselinePath: null,
      configPath: path.join(root, '.jscpd.json'),
      killSignal: 'SIGKILL',
      root,
      scanTargets: ['src-a', 'src-b'],
      timeoutMs: 1,
    })
  ).toThrow(/timed out|ETIMEDOUT|failed to start/iu);
}, 30_000);

it('detects HTML clones and binds every native markup extension to the population receipt', () => {
  const root = createTempRoot('verify-jscpd-native-markup-');
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  const config = JSON.parse(fs.readFileSync('tooling/configs/qa/jscpd.json', 'utf8'));
  writeFile(root, '.jscpd.json', `${JSON.stringify(config)}\n`);
  const markupSource = [
    '<!doctype html>',
    '<html lang="en">',
    '<body>',
    '<section class="editor">',
    '<h1>Example panel</h1>',
    '<div class="controls">',
    '<label for="title">Document title</label>',
    '<input id="title" type="text" value="Example">',
    '<button type="button">Save document</button>',
    '<p>Content remains available after editing.</p>',
    '</div>',
    '</section>',
    '</body>',
    '</html>',
  ].join('\n');
  const htmlPaths = ['src-a/one.html', 'src-b/two.htm'];
  for (const file of htmlPaths) writeFile(root, file, markupSource);
  const run = () =>
    runJscpdCheck({
      baselinePath: null,
      configPath: path.join(root, '.jscpd.json'),
      root,
      scanTargets: ['src-a', 'src-b'],
    });
  const htmlResult = run();
  const htmlReport = JSON.parse(fs.readFileSync(htmlResult.reportPath, 'utf8'));
  expect(htmlReport.statistics.total.sources).toBe(2);
  expect(htmlResult.findings.some((finding) => finding.format === 'markup')).toBe(true);
  expect(htmlResult.detector.scope.populationCount).toBe(2);
  expect(
    [
      ...new Set(
        htmlResult.findings.flatMap((finding) => [finding.firstFile.path, finding.secondFile.path])
      ),
    ].sort()
  ).toEqual(htmlPaths);

  const remainingExtensions = ['xml', 'xsl', 'xslt', 'svg', 'ejs', 'jsp'];
  const remainingPaths = remainingExtensions.map((extension) => `src-b/peer.${extension}`);
  for (const file of remainingPaths) writeFile(root, file, markupSource);
  const closureResult = run();
  const closureReport = JSON.parse(fs.readFileSync(closureResult.reportPath, 'utf8'));
  const expectedPaths = [...htmlPaths, ...remainingPaths].sort();
  expect(closureReport.statistics.total.sources).toBe(expectedPaths.length);
  expect(closureResult.detector.scope.populationCount).toBe(expectedPaths.length);
  expect(
    [
      ...new Set(
        closureResult.findings.flatMap((finding) => [
          finding.firstFile.path,
          finding.secondFile.path,
        ])
      ),
    ].sort()
  ).toEqual(expectedPaths);
  expect(closureResult.findings.every((finding) => finding.format === 'markup')).toBe(true);
}, 30_000);
