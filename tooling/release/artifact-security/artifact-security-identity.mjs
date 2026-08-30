import {
  decodeIdentityText,
  loadBoundedIdentityArchive,
} from '../../qa/policy/retired/retired-identity-archive.mjs';
import { retiredIdentityKind } from '../../qa/policy/retired/retired-identity.mjs';

function verifyIdentityValue(value, location) {
  const kind = retiredIdentityKind(value);
  if (kind) throw new Error(`Release artifact ${location} contains ${kind}.`);
}

async function verifyNestedIdentityArchive(file) {
  if (!file.relativePath.toLocaleLowerCase('en-US').endsWith('.zip')) return;
  const entries = await loadBoundedIdentityArchive(file.contents);
  for (const entry of entries) {
    verifyIdentityValue(entry.name, `${file.relativePath}#${entry.name}`);
    if (entry.dir) continue;
    const payload = Buffer.from(await entry.async('uint8array'));
    const text = decodeIdentityText(payload);
    if (text !== null) verifyIdentityValue(text, `${file.relativePath}#${entry.name} payload`);
  }
}

export async function verifyArtifactIdentityFile(file) {
  verifyIdentityValue(file.relativePath, file.relativePath);
  const text = decodeIdentityText(file.contents);
  if (text !== null) verifyIdentityValue(text, `${file.relativePath} content`);
  await verifyNestedIdentityArchive(file);
}
