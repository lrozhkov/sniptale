import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isExecutedAsScript } from '../qa/core/shared.mjs';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed.`);
  return result.stdout.trim();
}

function collectArtifactFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unsafe main proof symlink: ${absolute}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll(path.sep, '/'));
      else throw new Error(`Unsafe main proof entry: ${absolute}`);
    }
  }
  walk(root);
  return files.sort();
}

export function verifyMainProof(root, commit) {
  if (!/^[a-f0-9]{40}$/u.test(commit ?? '')) throw new Error('Expected a full main commit SHA.');
  const manifestPath = path.join(root, 'proof-manifest.json');
  const sumsPath = path.join(root, 'SHA256SUMS');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expectedTree = readGit(['rev-parse', `${commit}^{tree}`]);
  if (
    manifest.schemaVersion !== 1 ||
    manifest.artifactKind !== 'sniptale-ci-proof' ||
    manifest.lane !== 'candidate' ||
    manifest.status !== 'passed' ||
    manifest.commit !== commit ||
    manifest.candidateTree !== expectedTree ||
    manifest.trustedControlSha !== commit ||
    !/^sha256:[a-f0-9]{64}$/u.test(manifest.containerDigest ?? '')
  ) {
    throw new Error('Main proof identity does not match the release commit.');
  }
  const expected = new Map(
    fs
      .readFileSync(sumsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
        if (!match) throw new Error(`Malformed main proof checksum: ${line}`);
        return [match[2], match[1]];
      })
  );
  const listed = new Set([...manifest.files.map(({ file }) => file), 'proof-manifest.json']);
  if (expected.size !== listed.size || [...listed].some((file) => !expected.has(file))) {
    throw new Error('Main proof checksum inventory does not match its manifest.');
  }
  for (const { file, sha256: digest } of manifest.files) {
    if (expected.get(file) !== digest) {
      throw new Error(`Main proof manifest digest mismatch: ${file}`);
    }
  }
  for (const [file, digest] of expected) {
    const absolute = path.resolve(root, file);
    const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
    if (relative === '..' || relative.startsWith('../') || !fs.statSync(absolute).isFile()) {
      throw new Error(`Unsafe main proof file: ${file}`);
    }
    if (sha256(absolute) !== digest) throw new Error(`Main proof digest mismatch: ${file}`);
  }
  const physicalFiles = collectArtifactFiles(root);
  const admittedFiles = [...listed, 'SHA256SUMS'].sort();
  if (JSON.stringify(physicalFiles) !== JSON.stringify(admittedFiles)) {
    throw new Error('Main proof physical artifact inventory is not exact.');
  }
  const zipFiles = [...expected.keys()].filter((file) => /^build\/sniptale_.+\.zip$/u.test(file));
  if (zipFiles.length !== 1 || !expected.has('.tmp/licenses/sbom.cdx.json')) {
    throw new Error('Main proof must contain exactly one release ZIP and the canonical SBOM.');
  }
  return { manifest, zipFile: zipFiles[0] };
}

if (isExecutedAsScript(import.meta.url)) {
  const [root, commit] = process.argv.slice(2);
  if (!root || !commit) throw new Error('Usage: verify-main-proof.mjs <artifact-root> <commit>');
  const result = verifyMainProof(path.resolve(root), commit);
  process.stdout.write(`${JSON.stringify({ commit, zipFile: result.zipFile })}\n`);
}
