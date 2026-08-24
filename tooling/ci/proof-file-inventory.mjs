import fs from 'node:fs';
import path from 'node:path';

export function listRegularProofFiles(root, label = 'Proof') {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`${label} contains a symlink: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll(path.sep, '/'));
      else throw new Error(`${label} contains an unsupported filesystem entry: ${absolute}`);
    }
  }
  visit(root);
  return files.sort();
}
