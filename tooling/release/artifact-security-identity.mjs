import JSZip from 'jszip';
import { retiredIdentityKind } from '../qa/core/retired-identity.mjs';

function verifyIdentityValue(value, location) {
  const kind = retiredIdentityKind(value);
  if (kind) throw new Error(`Release artifact ${location} contains ${kind}.`);
}

function decodeIdentityText(contents) {
  if (contents.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(contents);
  } catch {
    return null;
  }
}

async function verifyNestedIdentityArchive(file) {
  if (!file.relativePath.toLocaleLowerCase('en-US').endsWith('.zip')) return;
  const zip = await JSZip.loadAsync(file.contents, { checkCRC32: true });
  for (const entry of Object.values(zip.files)) {
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
