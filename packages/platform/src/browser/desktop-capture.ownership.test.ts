import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = new URL('../../', import.meta.url);
const allowedRawDesktopCaptureOwners = new Set(['src/browser/desktop-capture.ts']);
const rawDesktopCaptureReference = /chrome\s*\.\s*desktopCapture\b/;

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

describe('desktopCapture browser API ownership', () => {
  it('keeps raw chrome.desktopCapture access inside the shared adapter', () => {
    const offenders = collectProductionSources(srcRoot.pathname).filter((path) => {
      const relativePath = relative(srcRoot.pathname, path);
      return (
        !allowedRawDesktopCaptureOwners.has(relativePath) &&
        rawDesktopCaptureReference.test(readFileSync(path, 'utf8'))
      );
    });

    expect(offenders.map((path) => relative(srcRoot.pathname, path))).toEqual([]);
  });
});
