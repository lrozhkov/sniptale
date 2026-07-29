import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const nativeOwnerFiles = [
  './native-backend.ts',
  './capture-parts.ts',
  './planner.ts',
  '../visible/coordinator.ts',
];

it('keeps the native scrolling raster path free of debugger APIs', () => {
  for (const relativePath of nativeOwnerFiles) {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
    expect(source, relativePath).not.toMatch(
      /browserDebugger|chrome\.debugger|attachDebugger|detachDebugger|Page\.captureScreenshot/
    );
  }
});
