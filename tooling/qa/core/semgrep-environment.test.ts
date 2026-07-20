import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { prepareSemgrepSettings, runSemgrepCheck } from '../audits/semgrep.mjs';
import { resolveSemgrepCommand } from '../tools/tool-cli.mjs';
import { createTempRoot, writeFile } from './test-helpers';

it('uses writable local settings and removes only empty proxy variables', () => {
  const root = createTempRoot('semgrep-environment-report-');
  const settingsPath = path.resolve('.tmp/semgrep/settings.yml');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, 'api_token: sentinel-semgrep-token\n');
  const commandSpec = resolveSemgrepCommand({
    environment: {
      PATH: process.env.PATH ?? '',
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      NO_PROXY: '',
      SNIPTALE_SEMGREP_BIN: 'semgrep',
      SEMGREP_APP_TOKEN: 'sentinel-semgrep-token',
    },
  });

  const result = runSemgrepCheck({
    files: ['apps/extension/src/composition/persistence/storage/example.ts'],
    commandSpec: commandSpec ?? { command: 'semgrep', args: [], env: {} },
    reportPath: 'results.json',
    reportRoot: root,
    runCommandImpl: (command, args, options) => {
      expect(command).toBe('semgrep');
      expect(args).toContain('--metrics=off');
      expect(args).toContain('--disable-version-check');
      expect(options.env.HTTP_PROXY).toBeNull();
      expect(options.env.HTTPS_PROXY).toBeNull();
      expect(options.env.NO_PROXY).toBeNull();
      expect(options.env.SEMGREP_APP_TOKEN).toBeNull();
      expect(options.env.SEMGREP_ENABLE_VERSION_CHECK).toBe('0');
      expect(options.env.SEMGREP_SEND_METRICS).toBe('off');
      expect(options.env.SEMGREP_SETTINGS_FILE).toBe(settingsPath);
      expect(options.env.SEMGREP_SETTINGS_FILE).not.toContain(
        path.join(process.env.HOME ?? '', '.semgrep')
      );
      expect(fs.existsSync(path.dirname(options.env.SEMGREP_SETTINGS_FILE))).toBe(true);
      expect(fs.existsSync(options.env.SEMGREP_SETTINGS_FILE)).toBe(false);
      return { status: 0, stdout: JSON.stringify({ results: [] }), stderr: '' };
    },
  });

  expect(result).toMatchObject({ skipped: false, violations: [] });
});

it('inherits nonempty proxy variables instead of replacing them', () => {
  const commandSpec = resolveSemgrepCommand({
    environment: {
      PATH: process.env.PATH ?? '',
      HTTP_PROXY: 'http://proxy.example:8080',
      HTTPS_PROXY: '',
      SNIPTALE_SEMGREP_BIN: 'semgrep',
    },
  });

  expect(commandSpec?.env).not.toHaveProperty('HTTP_PROXY');
  expect(commandSpec?.env.HTTPS_PROXY).toBeNull();
});

it('clears stale evidence when Semgrep is unavailable', () => {
  const root = createTempRoot('semgrep-unavailable-report-');
  const reportPath = writeFile(root, 'results.json', '{"stale":true}\n');

  const result = runSemgrepCheck({
    commandSpec: null,
    reportPath: 'results.json',
    reportRoot: root,
  });

  expect(result).toMatchObject({ skipped: true, violations: [] });
  expect(fs.existsSync(reportPath)).toBe(false);
});

it('clears stale evidence before target discovery fails', () => {
  const root = createTempRoot('semgrep-discovery-failure-');
  const reportPath = writeFile(root, 'results.json', '{"stale":true}\n');

  expect(() =>
    runSemgrepCheck({
      collectFiles: () => {
        throw new Error('target discovery failed');
      },
      commandSpec: { command: 'semgrep', args: [], env: {} },
      reportPath: 'results.json',
      reportRoot: root,
    })
  ).toThrow('target discovery failed');
  expect(fs.existsSync(reportPath)).toBe(false);
});

it('clears stale evidence when no Semgrep targets apply', () => {
  const root = createTempRoot('semgrep-no-targets-');
  const reportPath = writeFile(root, 'results.json', '{"stale":true}\n');

  const result = runSemgrepCheck({
    collectFiles: () => [],
    commandSpec: { command: 'semgrep', args: [], env: {} },
    reportPath: 'results.json',
    reportRoot: root,
  });

  expect(result).toMatchObject({ skipped: true, violations: [] });
  expect(fs.existsSync(reportPath)).toBe(false);
});

it('rejects an alternate settings path without deleting it', () => {
  const root = createTempRoot('semgrep-repository-');
  const externalRoot = createTempRoot('semgrep-external-');
  const externalSettings = writeFile(externalRoot, 'settings.yml', 'api_token: keep-me\n');

  expect(() =>
    prepareSemgrepSettings(
      {
        command: 'semgrep',
        args: [],
        env: { SEMGREP_SETTINGS_FILE: externalSettings },
      },
      { root }
    )
  ).toThrow('Semgrep settings path must be .tmp/semgrep/settings.yml inside the repository');
  expect(fs.readFileSync(externalSettings, 'utf8')).toBe('api_token: keep-me\n');
});

it('rejects a symlinked settings parent without deleting the external target', () => {
  const root = createTempRoot('semgrep-repository-');
  const externalRoot = createTempRoot('semgrep-external-');
  const externalSettings = writeFile(externalRoot, 'settings.yml', 'api_token: keep-me\n');
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
  fs.symlinkSync(externalRoot, path.join(root, '.tmp/semgrep'), 'dir');

  expect(() =>
    prepareSemgrepSettings(
      {
        command: 'semgrep',
        args: [],
        env: { SEMGREP_SETTINGS_FILE: path.join(root, '.tmp/semgrep/settings.yml') },
      },
      { root }
    )
  ).toThrow('unsafe repository path');
  expect(fs.readFileSync(externalSettings, 'utf8')).toBe('api_token: keep-me\n');
});

it('rejects a symlinked intermediate parent without deleting the external target', () => {
  const root = createTempRoot('semgrep-repository-');
  const externalRoot = createTempRoot('semgrep-external-');
  const externalSettings = writeFile(externalRoot, 'semgrep/settings.yml', 'api_token: keep-me\n');
  fs.symlinkSync(externalRoot, path.join(root, '.tmp'), 'dir');

  expect(() =>
    prepareSemgrepSettings(
      {
        command: 'semgrep',
        args: [],
        env: { SEMGREP_SETTINGS_FILE: path.join(root, '.tmp/semgrep/settings.yml') },
      },
      { root }
    )
  ).toThrow('unsafe repository path');
  expect(fs.readFileSync(externalSettings, 'utf8')).toBe('api_token: keep-me\n');
});
