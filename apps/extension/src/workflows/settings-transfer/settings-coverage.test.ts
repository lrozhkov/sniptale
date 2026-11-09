import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTION_VIEWS,
} from '../../platform/navigation/extension-pages/settings-route/codec';
import { SETTINGS_TRANSFER_REGISTRY_BY_ID } from './registry';
import {
  SETTINGS_TRANSFER_SECTION_COVERAGE,
  SETTINGS_TRANSFER_EXCLUDED_CONTROL_COVERAGE,
  SETTINGS_TRANSFER_PERSISTENCE_MUTATION_COVERAGE,
  SETTINGS_TRANSFER_VIEW_COVERAGE,
  SETTINGS_TRANSFER_EXCLUDED_VIEW_COVERAGE,
} from './settings-coverage';

describe('visible Settings transfer coverage guard', () => {
  it('requires every Settings section to declare transferable or explicitly excluded owners', () => {
    expect(Object.keys(SETTINGS_TRANSFER_SECTION_COVERAGE).sort()).toEqual(
      [...SETTINGS_SECTION_IDS].sort()
    );
    for (const ids of Object.values(SETTINGS_TRANSFER_SECTION_COVERAGE)) {
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        if (id === 'action/status') continue;
        if (id in SETTINGS_TRANSFER_EXCLUDED_CONTROL_COVERAGE) continue;
        expect(SETTINGS_TRANSFER_REGISTRY_BY_ID.has(id), id).toBe(true);
      }
    }
  });

  it('keeps surface and gradient views in the same route and transfer catalog', () => {
    for (const [section, viewCoverage] of Object.entries(SETTINGS_TRANSFER_VIEW_COVERAGE)) {
      const excluded =
        Object.entries(SETTINGS_TRANSFER_EXCLUDED_VIEW_COVERAGE).find(
          ([excludedSection]) => excludedSection === section
        )?.[1] ?? {};
      expect(Object.keys({ ...viewCoverage, ...excluded })).toEqual(
        SETTINGS_SECTION_VIEWS[section as keyof typeof SETTINGS_SECTION_VIEWS]
      );
      for (const domainId of Object.values(viewCoverage)) {
        expect(SETTINGS_TRANSFER_REGISTRY_BY_ID.has(domainId), domainId).toBe(true);
      }
    }
  });

  it('declares only the policy-excluded local background catalog as a non-transferable view', () => {
    expect(SETTINGS_TRANSFER_EXCLUDED_VIEW_COVERAGE).toEqual({
      'editor-resources': {
        backgrounds: {
          storageKey: 'sniptale_background_presets',
          policy: 'docs/security/data-handling.md',
          reason: 'Local-only background preset metadata is excluded from settings transfer.',
        },
      },
    });
    const policy = readFileSync(join(process.cwd(), 'docs/security/data-handling.md'), 'utf8');
    const backgroundPolicy = policy
      .split('\n\n')
      .find((paragraph) => paragraph.startsWith('Background preset metadata'));
    expect(backgroundPolicy).toContain('sniptale_background_presets');
    expect(backgroundPolicy).toContain('Exclude it from sync, settings transfer');
  });

  it('discovers the shared protection client outside sections and requires its secret classification', () => {
    const settingsRoot = mkdtempSync(join(tmpdir(), 'sniptale-settings-coverage-'));
    try {
      mkdirSync(join(settingsRoot, 'sections'));
      mkdirSync(join(settingsRoot, 'secret-protection'));
      writeFileSync(
        join(settingsRoot, 'secret-protection/context.tsx'),
        `import { createSecretProtectionClient } from '../runtime/secret-protection';
         const client = createSecretProtectionClient(transport);`
      );
      mkdirSync(join(settingsRoot, 'unapproved-neighbor'));
      writeFileSync(
        join(settingsRoot, 'unapproved-neighbor/context.tsx'),
        `import { createSecretProtectionClient } from '../runtime/secret-protection';`
      );
      const identity =
        'apps/extension/src/settings/secret-protection/context.tsx|createSecretProtectionClient';
      expect(collectSettingsPersistenceMutations(settingsRoot)).toEqual([identity]);
      const entry = SETTINGS_TRANSFER_PERSISTENCE_MUTATION_COVERAGE.find(
        (candidate) => candidate.sourceFile === identity.split('|')[0]
      );
      expect(entry).toMatchObject({
        classification: 'secret',
        mutations: expect.arrayContaining(['createSecretProtectionClient']),
      });
      expect(entry?.transferIds).toBeUndefined();
    } finally {
      rmSync(settingsRoot, { recursive: true, force: true });
    }
  });

  it('classifies every Settings persistence mutation callsite exactly', () => {
    const actual = collectSettingsPersistenceMutations();
    const expected = SETTINGS_TRANSFER_PERSISTENCE_MUTATION_COVERAGE.flatMap((entry) =>
      entry.mutations.map((mutation) => `${entry.sourceFile}|${mutation}`)
    ).sort();
    expect(actual).toEqual(expected);
    for (const entry of SETTINGS_TRANSFER_PERSISTENCE_MUTATION_COVERAGE) {
      expect(Boolean(entry.classification) !== Boolean(entry.transferIds)).toBe(true);
      for (const transferId of entry.transferIds ?? []) {
        expect(SETTINGS_TRANSFER_REGISTRY_BY_ID.has(transferId), transferId).toBe(true);
      }
      for (const excludedControlId of entry.excludedControlIds ?? []) {
        expect(SETTINGS_TRANSFER_EXCLUDED_CONTROL_COVERAGE).toHaveProperty(excludedControlId);
      }
    }
  });
});

const SETTINGS_ROOT = join(process.cwd(), 'apps/extension/src/settings');
const MUTATION_NAME =
  /^(?:save|add|update|delete|reset|set|create|change|reorder|move|merge|mutate|patch|cleanup|clear|enable|disable|lock|unlock|request)/u;

function collectSettingsPersistenceMutations(settingsRoot = SETTINGS_ROOT): string[] {
  return [
    ...collectRootPersistenceMutations(join(settingsRoot, 'sections'), ''),
    ...collectRootPersistenceMutations(
      join(settingsRoot, 'secret-protection'),
      'apps/extension/src/settings/secret-protection/'
    ),
  ].sort();
}

function collectRootPersistenceMutations(root: string, sourcePrefix: string): string[] {
  const result: string[] = [];
  for (const file of walk(root)) {
    if (!/\.(?:ts|tsx)$/u.test(file) || /\.test\.(?:ts|tsx)$/u.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    const sourceFile = sourcePrefix + relative(root, file).replaceAll('\\', '/');
    const imports = source.matchAll(/import\s*\{([\s\S]*?)\}\s*from ['"]([^'"]+)['"]/gu);
    for (const match of imports) {
      const moduleId = match[2] ?? '';
      if (!moduleId.includes('runtime/') && !moduleId.includes('composition/persistence')) continue;
      for (const imported of (match[1] ?? '').split(',')) {
        const name =
          imported
            .trim()
            .replace(/^type\s+/u, '')
            .split(/\s+as\s+/u)[0] ?? '';
        if (MUTATION_NAME.test(name)) result.push(`${sourceFile}|${name}`);
      }
    }
    if (/\{[^}]*updateSettings[^}]*\}\s*=\s*useSettingsStore\(\)/su.test(source)) {
      result.push(`${sourceFile}|updateSettings`);
    }
  }
  return result.sort();
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
