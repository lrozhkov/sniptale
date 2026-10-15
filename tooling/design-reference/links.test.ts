import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'tinyglobby';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const tool = resolve(root, 'tooling/design-reference');

function checkReference(file: string, reference: string) {
  const target = reference.trim().replace(/^<|>$/g, '').split(/[?#]/)[0];
  if (!target || /^(?:[a-z]+:|\/)/i.test(target)) return;
  const destination = resolve(dirname(resolve(root, file)), target);
  expect(existsSync(destination), `${file} -> ${reference}`).toBe(true);
  if (statSync(destination).isDirectory()) {
    expect(existsSync(resolve(destination, 'index.html')), `${file} -> ${reference}`).toBe(true);
  }
}

describe('canonical design reference links', () => {
  it('resolves documents, browser assets, styles, and static module imports', () => {
    const files = globSync(['docs/design/*.md', 'tooling/design-reference/**/*.{md,html,css,js}'], {
      cwd: root,
    });
    const patterns = [
      /\[[^\]]*\]\(([^)]+)\)/g,
      /(?:src|href)=["']([^"']+)["']/g,
      /url\(["']?([^"')]+)/g,
      /(?:from\s*|import\s*)["'](\.[^"']+)["']/g,
    ];
    for (const file of files) {
      const text = readFileSync(resolve(root, file), 'utf8');
      for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) checkReference(file, match[1]);
      }
    }
  });

  it('uses canonical documents for every group and contains no copied rule tree', () => {
    expect(existsSync(resolve(tool, 'docs'))).toBe(false);
    expect(existsSync(resolve(tool, 'DESIGN.md'))).toBe(false);
    const catalog = readFileSync(resolve(tool, 'catalog.json'), 'utf8');
    for (const match of catalog.matchAll(/"path":\s*"([^"]+)"/g)) {
      checkReference('tooling/design-reference/catalog.json', match[1]);
      expect(match[1]).toMatch(/^\.\.\/\.\.\/docs\/design\//);
    }
    const manifests = globSync('tooling/design-reference/examples/*/cases.json', { cwd: root });
    expect(manifests).toHaveLength(12);
    for (const file of manifests) {
      const text = readFileSync(resolve(root, file), 'utf8');
      const rule = text.match(/"rules":\s*"([^"]+)"/);
      expect(rule, file).not.toBeNull();
      expect(existsSync(resolve(root, 'docs/design', rule![1])), file).toBe(true);
    }
    for (const file of globSync('docs/design/*.md', { cwd: root })) {
      expect(
        readFileSync(resolve(root, file), 'utf8').split(/\s+/).length,
        file
      ).toBeLessThanOrEqual(800);
    }
  });
});
