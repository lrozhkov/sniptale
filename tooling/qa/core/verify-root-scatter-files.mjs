import fs from 'node:fs';
import path from 'node:path';

import { EXTENSION_TOP_LEVEL_SLICES, TOP_LEVEL_SLICES } from './verify-root-scatter.config.mjs';

const RETIRED_ROOTS = ['scripts', 'tests', 'test-support', '.hatiqo', 'cases'];

function collectSliceRootFiles(root, prefix, slices) {
  return slices.flatMap((slice) => {
    const sliceRoot = path.join(root, ...prefix, slice);
    if (!fs.existsSync(sliceRoot)) return [];
    return fs
      .readdirSync(sliceRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(sliceRoot, entry.name));
  });
}

function collectFilesRecursively(absoluteRoot) {
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  }
  return files;
}

export function collectRepoWideRootScatterFiles(root) {
  return [
    ...collectSliceRootFiles(root, ['src'], TOP_LEVEL_SLICES),
    ...collectSliceRootFiles(root, ['apps', 'extension', 'src'], EXTENSION_TOP_LEVEL_SLICES),
    ...RETIRED_ROOTS.flatMap((retiredRoot) =>
      collectFilesRecursively(path.join(root, retiredRoot))
    ),
  ].toSorted();
}
