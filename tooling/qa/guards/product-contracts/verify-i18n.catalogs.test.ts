import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../../test-support/test-helpers';
import { canonicalCatalogText, parseCatalog } from './i18n-catalog-format.mjs';
import {
  collectCatalogFormatChanges,
  readI18nCatalogs,
  runI18nCatalogCheck,
} from './verify-i18n.catalogs.mjs';
import { runI18nReport } from './verify-i18n.mjs';
import { getSourceSnapshotStats } from '../../analysis/source/source-snapshot.mjs';

const directory = 'apps/extension/src/platform/i18n/catalogs';
function fixture() {
  const root = createTempRoot('i18n-catalog-');
  writeFile(
    root,
    'packages/platform/src/i18n/config.ts',
    'const LOCALE_REGISTRY = {en:{}, ru:{}} as const;'
  );
  writeFile(
    root,
    `${directory}/en.json`,
    canonicalCatalogText(
      parseCatalog('{"common":{"save":"Save","delete":"Delete","unused":"Unused"}}').tree
    )
  );
  writeFile(
    root,
    `${directory}/ru.json`,
    canonicalCatalogText(
      parseCatalog('{"common":{"save":"Сохранить","delete":"Удалить","unused":"Не используется"}}')
        .tree
    )
  );
  return root;
}

describe('locale catalog QA contract', () => {
  it('checks full shape, registered languages, and canonical formatting', () => {
    const root = fixture();
    expect(runI18nCatalogCheck({ root })).toEqual([]);
    writeFile(
      root,
      `${directory}/ru.json`,
      '{"common":{"delete":"Удалить","save":"Сохранить","unused":"Не используется"}}'
    );
    expect(readI18nCatalogs({ root }).failures).toEqual([]);
    expect(runI18nCatalogCheck({ root })).toEqual([expect.stringContaining('noncanonical format')]);
    const changes = collectCatalogFormatChanges({ root });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.file).toBe(`${directory}/ru.json`);
    expect(JSON.parse(changes[0]?.text ?? '')).toEqual(
      JSON.parse(fs.readFileSync(path.join(root, directory, 'ru.json'), 'utf8'))
    );
    writeFile(root, `${directory}/de.json`, '{}');
    expect(runI18nCatalogCheck({ root })).toContain(`${directory}/de.json: unregistered catalog`);
  });

  it('refuses every write if a catalog is missing, invalid, or contains duplicate keys', () => {
    const root = fixture();
    writeFile(root, `${directory}/ru.json`, '{"common":{"save":"x","save":"y"}}');
    expect(() => collectCatalogFormatChanges({ root })).toThrow('duplicate key');
    fs.unlinkSync(path.join(root, directory, 'ru.json'));
    expect(readI18nCatalogs({ root }).failures.join('\n')).toContain('ru.json');
    expect(() => collectCatalogFormatChanges({ root })).toThrow();
  });

  it('checks catalogs independently of an unrelated scoped source selection', () => {
    const root = fixture();
    writeFile(root, `${directory}/ru.json`, '{"common":{}}');
    const file = 'apps/extension/src/popup/example.ts';
    writeFile(root, file, 'export const number = 1;');
    expect(runI18nReport({ root, files: [file] }).failures.join('\n')).toContain(
      'missing key common.save'
    );
  });

  it('reports conservative usage candidates and discards stale evidence after consumer deletion', () => {
    const root = fixture();
    const file = 'apps/extension/src/popup/example.ts';
    writeFile(
      root,
      file,
      "const table = {save:'common.save'}; translate(table.save); translate(`common.${kind}`);"
    );
    const dynamic = runI18nReport({ root });
    expect(dynamic.usage.complete).toBe(true);
    expect(dynamic.usage.candidates).toEqual([]);
    expect(dynamic.usage.unresolved).toHaveLength(2);
    writeFile(root, file, "translate('common.save');");
    expect(runI18nReport({ root }).usage.candidates).toEqual(['common.delete', 'common.unused']);
    fs.unlinkSync(path.join(root, file));
    expect(runI18nReport({ root }).usage.candidates).toEqual([
      'common.delete',
      'common.save',
      'common.unused',
    ]);
    expect(runI18nReport({ root, files: [] }).usage).toEqual({
      complete: false,
      candidates: [],
      unresolved: [],
    });
  });

  it('reuses one source snapshot for raw-copy and usage checks independently of locales', () => {
    const root = fixture();
    const file = 'apps/extension/src/popup/example.ts';
    writeFile(root, file, "translate('common.save');");
    const before = getSourceSnapshotStats().parseCount;
    runI18nReport({ root });
    expect(getSourceSnapshotStats().parseCount - before).toBe(1);
    runI18nReport({ root, collectUsage: false });
    expect(getSourceSnapshotStats().parseCount - before).toBe(1);
    writeFile(root, file, "translate('common.delete');");
    runI18nReport({ root });
    expect(getSourceSnapshotStats().parseCount - before).toBe(2);
  });

  it('does not count test-only references as product use', () => {
    const root = fixture();
    writeFile(root, 'apps/extension/src/popup/example.test.ts', "translate('common.unused');");
    expect(runI18nReport({ root }).usage.candidates).toContain('common.unused');
  });
});
