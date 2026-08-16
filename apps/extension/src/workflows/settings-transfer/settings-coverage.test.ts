import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTION_VIEWS,
} from '../../platform/navigation/extension-pages/settings-route/codec';
import { SETTINGS_TRANSFER_REGISTRY_BY_ID } from './registry';
import {
  SETTINGS_TRANSFER_SECTION_COVERAGE,
  SETTINGS_TRANSFER_PERSISTENCE_MUTATION_COVERAGE,
  SETTINGS_TRANSFER_VIEW_COVERAGE,
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
        expect(SETTINGS_TRANSFER_REGISTRY_BY_ID.has(id), id).toBe(true);
      }
    }
  });

  it('keeps surface and gradient views in the same route and transfer catalog', () => {
    for (const [section, viewCoverage] of Object.entries(SETTINGS_TRANSFER_VIEW_COVERAGE)) {
      expect(Object.keys(viewCoverage)).toEqual(
        SETTINGS_SECTION_VIEWS[section as keyof typeof SETTINGS_SECTION_VIEWS]
      );
      for (const domainId of Object.values(viewCoverage)) {
        expect(SETTINGS_TRANSFER_REGISTRY_BY_ID.has(domainId), domainId).toBe(true);
      }
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
    }
  });
});

const SETTINGS_SECTIONS_ROOT = join(process.cwd(), 'apps/extension/src/settings/sections');
const MUTATION_NAME =
  /^(?:save|add|update|delete|reset|set|create|change|reorder|move|merge|mutate|patch|cleanup|clear|enable|disable|lock|unlock|request)/u;

function collectSettingsPersistenceMutations(): string[] {
  const result: string[] = [];
  for (const file of walk(SETTINGS_SECTIONS_ROOT)) {
    if (!/\.(?:ts|tsx)$/u.test(file) || /\.test\.(?:ts|tsx)$/u.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    const sourceFile = relative(SETTINGS_SECTIONS_ROOT, file).replaceAll('\\', '/');
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
