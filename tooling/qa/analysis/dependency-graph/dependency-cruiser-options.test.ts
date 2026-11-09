import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const options = require('./dependency-cruiser-options.cjs');

it('resolves only the three build projections through the shared TypeScript paths', () => {
  const config = ts.readConfigFile(options.tsConfig.fileName, ts.sys.readFile).config;
  const aliases = config.compilerOptions.paths;
  expect(Object.keys(aliases).sort()).toEqual(
    ['sniptale:i18n/content-shim', 'sniptale:i18n/popup', 'sniptale:i18n/popup-shell'].sort()
  );
  for (const targets of Object.values(aliases)) {
    expect(targets).toEqual(['./apps/extension/src/platform/i18n/catalog-projections.d.ts']);
    expect(fs.existsSync(path.resolve(String((targets as string[])[0])))).toBe(true);
  }
});
