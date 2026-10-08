import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ARTIFACT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/u;
const PACKAGE_PATH = 'node_modules/mediabunny';

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message) {
  throw new Error(`Mediabunny normalization: ${message}`);
}

function containedFile(root, relative) {
  if (
    typeof relative !== 'string' ||
    relative.includes('\\') ||
    relative.split('/').some((part) => !part || part === '.' || part === '..') ||
    path.isAbsolute(relative)
  )
    fail('invalid package path');
  let current = root;
  const parts = relative.split('/');
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail(`symlink is not permitted: ${relative}`);
    if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) {
      fail(`unexpected file type: ${relative}`);
    }
  }
  return current;
}

function loadArtifacts() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ARTIFACT_ROOT, 'patch-manifest.json'), 'utf8')
  );
  if (
    !object(manifest) ||
    manifest.schemaVersion !== 1 ||
    manifest.package !== 'mediabunny' ||
    manifest.version !== '1.55.2' ||
    !Array.isArray(manifest.changes) ||
    manifest.changes.length !== 24 ||
    !object(manifest.payload) ||
    manifest.payload.path !== 'patch-payload.json.gz' ||
    !HASH.test(manifest.payload.sha256) ||
    !HASH.test(manifest.packageJsonSha256) ||
    !HASH.test(manifest.sourcePatchSha256) ||
    !object(manifest.license) ||
    manifest.license.path !== 'LICENSE' ||
    !HASH.test(manifest.license.sha256) ||
    !Number.isSafeInteger(manifest.payload.expandedBytes) ||
    manifest.payload.expandedBytes <= 0 ||
    manifest.payload.expandedBytes > MAX_PAYLOAD_BYTES
  )
    fail('invalid patch manifest');
  const paths = new Set();
  for (const row of manifest.changes) {
    if (
      !object(row) ||
      typeof row.path !== 'string' ||
      !/^(?:src|dist)\/[a-zA-Z0-9/_.-]+$/u.test(row.path) ||
      row.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      paths.has(row.path) ||
      !HASH.test(row.beforeSha256) ||
      !HASH.test(row.afterSha256) ||
      row.beforeSha256 === row.afterSha256 ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes <= 0 ||
      row.bytes > MAX_PAYLOAD_BYTES
    )
      fail('invalid replacement inventory');
    paths.add(row.path);
  }
  const payloadBytes = fs.readFileSync(path.join(ARTIFACT_ROOT, manifest.payload.path));
  if (
    payloadBytes.length !== manifest.payload.compressedBytes ||
    hash(payloadBytes) !== manifest.payload.sha256
  ) {
    fail('payload digest mismatch');
  }
  if (
    hash(fs.readFileSync(path.join(ARTIFACT_ROOT, 'source.patch'))) !==
      manifest.sourcePatchSha256 ||
    hash(fs.readFileSync(path.join(ARTIFACT_ROOT, 'LICENSE'))) !== manifest.license.sha256
  ) {
    fail('source patch or license digest mismatch');
  }
  const expanded = gunzipSync(payloadBytes, { maxOutputLength: MAX_PAYLOAD_BYTES });
  if (expanded.length !== manifest.payload.expandedBytes) fail('payload size mismatch');
  const payload = JSON.parse(expanded.toString('utf8'));
  if (!object(payload) || Object.keys(payload).length !== paths.size)
    fail('payload inventory mismatch');
  for (const row of manifest.changes) {
    if (typeof payload[row.path] !== 'string') fail('replacement text missing');
    const bytes = Buffer.from(payload[row.path]);
    if (bytes.length !== row.bytes || hash(bytes) !== row.afterSha256)
      fail('replacement digest mismatch');
  }
  return { manifest, payload };
}

function validateInstall(root, manifest) {
  const lock = JSON.parse(fs.readFileSync(containedFile(root, 'package-lock.json'), 'utf8'));
  const entry = object(lock.packages) ? lock.packages[PACKAGE_PATH] : null;
  if (
    !object(entry) ||
    entry.version !== manifest.version ||
    entry.resolved !== manifest.resolved ||
    entry.integrity !== manifest.integrity ||
    entry.link ||
    Object.keys(lock.packages).some(
      (key) => key !== PACKAGE_PATH && key.endsWith('/node_modules/mediabunny')
    )
  ) {
    fail('lock identity mismatch or duplicate installation');
  }
  const metadataPath = containedFile(root, `${PACKAGE_PATH}/package.json`);
  if (hash(fs.readFileSync(metadataPath)) !== manifest.packageJsonSha256)
    fail('installed package identity mismatch');
  if (
    hash(fs.readFileSync(containedFile(root, `${PACKAGE_PATH}/LICENSE`))) !==
    manifest.license.sha256
  ) {
    fail('installed license mismatch');
  }
  const rows = manifest.changes.map((row) => {
    const file = containedFile(root, `${PACKAGE_PATH}/${row.path}`);
    const digest = hash(fs.readFileSync(file));
    if (digest !== row.beforeSha256 && digest !== row.afterSha256)
      fail(`unknown file content: ${row.path}`);
    return {
      ...row,
      file,
      patched: digest === row.afterSha256,
      mode: fs.statSync(file).mode & 0o777,
    };
  });
  if (rows.some((row) => row.patched) && rows.some((row) => !row.patched)) {
    fail('mixed installation; run npm ci --ignore-scripts, then dependencies:normalize');
  }
  return rows;
}

/** Complete a locked Mediabunny installation, or verify it without writing when check is true. */
export function normalizeMediabunny({ root = process.cwd(), check = false } = {}) {
  const canonicalRoot = fs.realpathSync(root);
  const { manifest, payload } = loadArtifacts();
  let rows = validateInstall(canonicalRoot, manifest);
  if (rows.every((row) => row.patched)) return { state: 'patched', files: rows.length };
  if (check) fail('installation is unpatched; run npm run dependencies:normalize');
  const lockDirectory = path.join(canonicalRoot, PACKAGE_PATH, '.sniptale-normalization-lock');
  fs.mkdirSync(lockDirectory);
  const temporary = [];
  try {
    // Recheck under the single-writer lock before preparing any replacement.
    rows = validateInstall(canonicalRoot, manifest);
    if (rows.every((row) => row.patched)) return { state: 'patched', files: rows.length };
    for (const row of rows) {
      const file = `${row.file}.sniptale-${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(file, payload[row.path], { flag: 'wx', mode: row.mode });
      temporary.push(file);
      fs.chmodSync(file, row.mode);
      if (hash(fs.readFileSync(file)) !== row.afterSha256)
        fail('prepared replacement digest mismatch');
    }
    // All bytes are verified before replacing the first file. Interruption is detected as mixed state.
    for (const [index, row] of rows.entries()) fs.renameSync(temporary[index], row.file);
    if (!validateInstall(canonicalRoot, manifest).every((row) => row.patched))
      fail('replacement did not complete');
    return { state: 'applied', files: rows.length };
  } finally {
    for (const file of temporary) fs.rmSync(file, { force: true });
    fs.rmdirSync(lockDirectory);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check') || args.length > 1)
    fail('usage: normalize.mjs [--check]');
  const result = normalizeMediabunny({ check: args.includes('--check') });
  process.stdout.write(`Mediabunny ${result.state}: ${result.files} verified files\n`);
}
