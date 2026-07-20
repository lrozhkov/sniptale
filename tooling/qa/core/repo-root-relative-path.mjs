import path from 'node:path';

import { toRelativePath } from './shared.mjs';

export function toRelativePathForRoot(filePath, root = null) {
  if (!root) {
    return toRelativePath(filePath);
  }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  return path.relative(root, absolutePath).replaceAll(path.sep, '/');
}
