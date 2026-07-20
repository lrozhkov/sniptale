import { execFileSync, spawnSync } from 'node:child_process';

export function git(root, args) {
  return execFileSync(process.platform === 'win32' ? 'git.exe' : 'git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

export function treeEntries(root, tree) {
  return new Map(
    git(root, ['ls-tree', '-r', tree])
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+) blob ([0-9a-f]+)\t(.+)$/u);
        if (!match) throw new Error(`unsupported tree entry: ${line}`);
        return [match[3], { blob: match[2], mode: match[1] }];
      })
  );
}

export function readBlobs(root, entries) {
  const hashes = [...new Set(entries.map((entry) => entry.blob))];
  const result = spawnSync(
    process.platform === 'win32' ? 'git.exe' : 'git',
    ['cat-file', '--batch'],
    {
      cwd: root,
      input: `${hashes.join('\n')}\n`,
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  if (result.status !== 0) throw new Error('git cat-file --batch failed');
  const blobs = new Map();
  let offset = 0;
  for (const hash of hashes) {
    const lineEnd = result.stdout.indexOf(10, offset);
    const header = result.stdout.subarray(offset, lineEnd).toString('utf8');
    const match = header.match(/^([0-9a-f]+) blob (\d+)$/u);
    if (!match || match[1] !== hash) throw new Error(`unexpected git blob header: ${header}`);
    const start = lineEnd + 1;
    const end = start + Number(match[2]);
    blobs.set(hash, result.stdout.subarray(start, end));
    offset = end + 1;
  }
  return blobs;
}

export function grepLines(root, tree, pattern, paths = []) {
  try {
    return git(root, ['grep', '-I', '-n', '-E', pattern, tree, '--', ...paths])
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => line.slice(line.indexOf(':') + 1));
  } catch {
    return [];
  }
}

export function parsedGrepLine(line) {
  const match = line.match(/^(.+?):(\d+):(.*)$/u);
  return match ? { path: match[1], line: Number(match[2]), text: match[3] } : null;
}
