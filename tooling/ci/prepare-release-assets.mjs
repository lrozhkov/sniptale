import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const artifactRoot = process.argv[2];
if (!artifactRoot || !fs.statSync(artifactRoot).isDirectory()) {
  throw new Error('Usage: prepare-release-assets.mjs <verified artifact directory>');
}
const output = path.join(artifactRoot, 'release-assets');
fs.mkdirSync(output, { recursive: false });
const sources = [
  ...fs
    .readdirSync(path.join(artifactRoot, 'build'))
    .filter((name) => name.endsWith('.zip'))
    .map((name) => path.join(artifactRoot, 'build', name)),
  path.join(artifactRoot, '.tmp/licenses/sbom.cdx.json'),
  path.join(artifactRoot, 'proof-manifest.json'),
];
const names = new Set();
for (const source of sources) {
  if (!fs.existsSync(source) || !fs.statSync(source).isFile())
    throw new Error(`Missing release asset: ${source}`);
  const name = path.basename(source);
  if (names.has(name)) throw new Error(`Release asset collision: ${name}`);
  names.add(name);
  fs.copyFileSync(source, path.join(output, name), fs.constants.COPYFILE_EXCL);
}
const sums = [...names].sort().map(
  (name) =>
    `${crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(output, name)))
      .digest('hex')}  ${name}`
);
fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${sums.join('\n')}\n`, { flag: 'wx' });
process.stdout.write(`${output}\n`);
