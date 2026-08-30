import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
const OXLINT_ENTRY = 'node_modules/oxlint/bin/oxlint';

function fixtureRoot() {
  fs.mkdirSync('.tmp', { recursive: true });
  const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp/oxlint-security-fixtures-'));
  const migratedRules = new Set(['no-eval', 'no-new-func', 'react/no-danger']);
  const securityRules = Object.fromEntries(
    Object.entries(JSON.parse(fs.readFileSync('.oxlintrc.json', 'utf8')).rules).filter(
      ([rule]) => rule.startsWith('security/') || migratedRules.has(rule)
    )
  );
  fs.writeFileSync(
    path.join(root, 'oxlint.json'),
    `${JSON.stringify({
      categories: { correctness: 'off' },
      env: { builtin: true },
      plugins: ['react'],
      jsPlugins: [{ name: 'security', specifier: 'eslint-plugin-security' }],
      rules: securityRules,
    })}\n`
  );
  roots.push(root);
  return root;
}

function write(root: string, name: string, source: string) {
  const file = path.join(root, name);
  fs.writeFileSync(file, source);
  return path.relative(process.cwd(), file).replaceAll(path.sep, '/');
}

function lint(files: string[], { strict = false } = {}) {
  const config = path.posix.join(path.posix.dirname(files[0]), 'oxlint.json');
  if (strict) {
    const value = JSON.parse(fs.readFileSync(config, 'utf8'));
    value.rules['security/detect-non-literal-regexp'] = 'warn';
    fs.writeFileSync(config, `${JSON.stringify(value)}\n`);
  }
  return spawnSync(
    process.execPath,
    [
      OXLINT_ENTRY,
      '--config',
      config,
      '--no-ignore',
      '--deny-warnings',
      '--format',
      'unix',
      ...files,
    ],
    { cwd: process.cwd(), encoding: 'utf8' }
  );
}

function output(result: ReturnType<typeof lint>) {
  return `${result.stdout}${result.stderr}`;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

describe('Oxlint security JS-plugin parity', () => {
  it('pins the previous error, warning, and disabled severities', () => {
    const config = JSON.parse(fs.readFileSync('.oxlintrc.json', 'utf8'));
    expect(config.jsPlugins).toContainEqual({
      name: 'security',
      specifier: 'eslint-plugin-security',
    });
    expect(config.rules).toMatchObject({
      'security/detect-bidi-characters': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-non-literal-regexp': 'off',
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'warn',
      'no-eval': 'error',
      'no-new-func': 'error',
      'react/no-danger': 'error',
    });
  });

  it('preserves exact negative findings across JS, TS, and TSX', () => {
    const root = fixtureRoot();
    const files = [
      write(root, 'bidi.js', `const value = "safe"; // ${String.fromCodePoint(0x202e)} hidden\n`),
      write(root, 'buffer.ts', 'buffer.readDoubleLE(0, true);\n'),
      write(root, 'eval.tsx', 'eval(source);\n'),
      write(root, 'function.ts', 'const create = new Function(source);\n'),
      write(
        root,
        'danger.tsx',
        'const view = <div dangerouslySetInnerHTML={{ __html: html }} />;\n'
      ),
      write(root, 'new-buffer.js', 'const value = new Buffer(size);\n'),
      write(root, 'unsafe-regex.ts', 'const expression = /(x+x+)+y/;\n'),
    ];
    const result = lint(files);
    const text = output(result);
    expect(result.status).toBe(1);
    for (const rule of [
      'security/detect-bidi-characters',
      'security/detect-buffer-noassert',
      'eslint(no-eval)',
      'eslint(no-new-func)',
      'react(no-danger)',
      'security/detect-new-buffer',
      'security/detect-unsafe-regex',
    ]) {
      expect(text).toContain(
        rule.includes('(') ? rule : rule.replace('security/', 'security(').replace(/$/u, ')')
      );
    }
  });

  it('keeps literal-safe forms and disabled object injection accepted', () => {
    const root = fixtureRoot();
    const result = lint([
      write(
        root,
        'safe.ts',
        [
          'buffer.readDoubleLE(0, false);',
          'const bytes = new Buffer("fixed value");',
          'const expression = new RegExp("fixed+");',
          'const safe = /^\\d+$/;',
          'const object = {}; object[key] = value;',
          'void bytes; void expression; void safe; void object;',
        ].join('\n')
      ),
    ]);
    expect(output(result)).not.toContain('security(');
  });

  it('enables non-literal RegExp only in strict repository-wide mode', () => {
    const root = fixtureRoot();
    const file = write(
      root,
      'regexp.ts',
      'const expression = new RegExp(source); void expression;\n'
    );
    const focused = lint([file]);
    expect(focused.status).toBe(0);
    expect(output(focused)).not.toContain('security/detect-non-literal-regexp');
    const strict = lint([file], { strict: true });
    expect(strict.status).toBe(1);
    expect(output(strict)).toContain('security(detect-non-literal-regexp)');
  });
});
