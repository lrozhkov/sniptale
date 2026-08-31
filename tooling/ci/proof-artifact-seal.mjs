import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveManifestEntry(manifest, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    path.posix.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath
  ) {
    throw new Error(`Unsafe verified proof artifact path: ${String(relativePath)}.`);
  }
  const matches = Array.isArray(manifest?.files)
    ? manifest.files.filter(({ file }) => file === relativePath)
    : [];
  if (matches.length !== 1 || !/^[a-f0-9]{64}$/u.test(matches[0].sha256 ?? '')) {
    throw new Error(`Verified proof artifact does not seal exactly one ${relativePath}.`);
  }
  return matches[0];
}

export function sealVerifiedProofFiles(artifactRoot, manifest, files) {
  const root = path.resolve(artifactRoot);
  const planned = files.map(({ destination, relativePath }) => {
    const entry = resolveManifestEntry(manifest, relativePath);
    const source = path.join(root, relativePath);
    const resolvedDestination = path.resolve(destination);
    const stat = fs.lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Unsafe verified proof artifact: ${relativePath}.`);
    }
    if (fs.existsSync(resolvedDestination)) {
      throw new Error(`Verified proof destination already exists: ${resolvedDestination}.`);
    }
    return { destination: resolvedDestination, entry, relativePath, source };
  });
  if (new Set(planned.map(({ destination }) => destination)).size !== planned.length) {
    throw new Error('Verified proof destinations must be unique.');
  }

  const attempted = [];
  try {
    for (const item of planned) {
      fs.mkdirSync(path.dirname(item.destination), { recursive: true });
      attempted.push(item.destination);
      fs.copyFileSync(item.source, item.destination, fs.constants.COPYFILE_EXCL);
      if (sha256(item.destination) !== item.entry.sha256) {
        throw new Error(`Verified proof artifact digest drifted: ${item.relativePath}.`);
      }
    }
    return planned.map(({ destination }) => destination);
  } catch (error) {
    for (const destination of attempted) fs.rmSync(destination, { force: true });
    throw error;
  }
}
