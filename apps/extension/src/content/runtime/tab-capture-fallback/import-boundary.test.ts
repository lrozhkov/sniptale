import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const contentRoot = new URL('../..', import.meta.url);
const forbiddenPrivilegedBrowserImport =
  /from\s+['"][^'"]*shared\/browser\/(?:tabs|tab-capture)['"]/;

function collectProductionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectProductionSources(path);
    }

    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return [path];
  });
}

describe('content privileged browser import boundary', () => {
  it('keeps tab capture and tab query ownership out of production content code', () => {
    const offenders = collectProductionSources(contentRoot.pathname).filter((path) =>
      forbiddenPrivilegedBrowserImport.test(readFileSync(path, 'utf8'))
    );

    expect(offenders.map((path) => relative(contentRoot.pathname, path))).toEqual([]);
  });
});
