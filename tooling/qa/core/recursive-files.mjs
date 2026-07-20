import fs from 'node:fs';
import path from 'node:path';

export function collectRecursiveFiles(
  rootDir,
  {
    baseDir = rootDir,
    ignoredSegments = new Set(),
    predicate = () => true,
    returnAbsolute = false,
  } = {}
) {
  const result = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir || !fs.existsSync(currentDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (ignoredSegments.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      const candidate = returnAbsolute
        ? absolutePath
        : path.relative(baseDir, absolutePath).replaceAll(path.sep, '/');
      if (predicate(candidate, entry, absolutePath)) {
        result.push(candidate);
      }
    }
  }

  return result;
}
