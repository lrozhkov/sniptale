import path from 'node:path';

export function collectProofEvidenceSources(releaseRoot, manifest, { excludedFiles = [] } = {}) {
  const excluded = new Set(excludedFiles);
  const sources = [
    ['proof/release-proof-manifest.json', path.join(releaseRoot, 'proof-manifest.json')],
    ['proof/SHA256SUMS', path.join(releaseRoot, 'SHA256SUMS')],
  ];
  for (const entry of manifest.files ?? []) {
    if (excluded.has(entry.file)) continue;
    sources.push([`proof-files/${entry.file}`, path.join(releaseRoot, ...entry.file.split('/'))]);
  }
  const names = sources.map(([name]) => name);
  if (new Set(names).size !== names.length) {
    throw new Error('Release proof evidence projection contains a path collision.');
  }
  return sources;
}
